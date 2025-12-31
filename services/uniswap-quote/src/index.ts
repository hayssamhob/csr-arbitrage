import { BigNumber, Contract, providers } from "ethers";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { CONTRACTS, config as serviceConfig } from "./config";

// ==========================================================================
// Uniswap V4 Quote Service (Verified Mainnet Pools)
// Fetches CSR/CSR25 prices via V4 PoolManager.getSlot0 and publishes to Redis
// ==========================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const TOPIC_MARKET_DATA = "market.data";

// V4 PoolManager ABI (minimal for getSlot0)
const POOL_MANAGER_ABI = [
  "function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
];

// Token definitions with decimals
const TOKENS = {
  USDT: {
    address: CONTRACTS.USDT_TOKEN.toLowerCase(),
    decimals: 6,
    symbol: "USDT",
  },
  CSR: {
    address: CONTRACTS.CSR_TOKEN.toLowerCase(),
    decimals: 18,
    symbol: "CSR",
  },
  CSR25: {
    address: CONTRACTS.CSR25_TOKEN.toLowerCase(),
    decimals: 18,
    symbol: "CSR25",
  },
};

// Validate currency sorting (V4 requires currency0 < currency1 numerically)
function validateCurrencySorting(): void {
  const csrNum = BigNumber.from(TOKENS.CSR.address);
  const csr25Num = BigNumber.from(TOKENS.CSR25.address);
  const usdtNum = BigNumber.from(TOKENS.USDT.address);

  console.log(`[Quote] Currency sorting validation:`);
  console.log(`  CSR25: ${TOKENS.CSR25.address}`);
  console.log(`  CSR:   ${TOKENS.CSR.address}`);
  console.log(`  USDT:  ${TOKENS.USDT.address}`);

  if (csrNum.gte(usdtNum)) {
    console.warn(`[Quote] WARNING: CSR >= USDT - pool key may be inverted!`);
  }

  if (csr25Num.gte(usdtNum)) {
    console.warn(`[Quote] WARNING: CSR25 >= USDT - pool key may be inverted!`);
  }
}

const provider = new providers.JsonRpcProvider(serviceConfig.RPC_URL);
const poolManager = new Contract(
  CONTRACTS.UNISWAP_V4_MANAGER,
  POOL_MANAGER_ABI,
  provider
);
const redis = new Redis(serviceConfig.REDIS_URL);

// Pool configurations with verified IDs
interface PoolConfig {
  symbol: "CSR" | "CSR25";
  poolId: string;
  token0Decimals: number;
  token1Decimals: number;
  zeroForOne: boolean;
}

function getPoolConfigs(): PoolConfig[] {
  const configs: PoolConfig[] = [];

  if (serviceConfig.CSR_POOL_ID) {
    configs.push({
      symbol: "CSR",
      poolId: serviceConfig.CSR_POOL_ID,
      token0Decimals: TOKENS.CSR.decimals,
      token1Decimals: TOKENS.USDT.decimals,
      zeroForOne: false,
    });
  }

  if (serviceConfig.CSR25_POOL_ID) {
    configs.push({
      symbol: "CSR25",
      poolId: serviceConfig.CSR25_POOL_ID,
      token0Decimals: TOKENS.CSR25.decimals,
      token1Decimals: TOKENS.USDT.decimals,
      zeroForOne: false,
    });
  }

  return configs;
}

// Calculate price from sqrtPriceX96
function sqrtPriceX96ToPrice(
  sqrtPriceX96: BigNumber,
  token0Decimals: number,
  token1Decimals: number
): number {
  const Q96 = BigNumber.from(2).pow(96);
  const sqrtPrice = sqrtPriceX96.mul(BigNumber.from(10).pow(18)).div(Q96);
  const price = sqrtPrice.mul(sqrtPrice).div(BigNumber.from(10).pow(18));

  const decimalAdjustment = token0Decimals - token1Decimals;
  let adjustedPrice: number;

  if (decimalAdjustment > 0) {
    adjustedPrice =
      price.mul(BigNumber.from(10).pow(decimalAdjustment)).toNumber() / 1e18;
  } else if (decimalAdjustment < 0) {
    adjustedPrice =
      price.div(BigNumber.from(10).pow(-decimalAdjustment)).toNumber() / 1e18;
  } else {
    adjustedPrice = price.toNumber() / 1e18;
  }

  return adjustedPrice;
}

async function fetchSlot0Quote(poolConfig: PoolConfig): Promise<{
  price: number;
  tick: number;
  lpFee: number;
  ts: number;
} | null> {
  try {
    const slot0 = await poolManager.getSlot0(poolConfig.poolId);

    const sqrtPriceX96: BigNumber = slot0.sqrtPriceX96 ?? slot0[0];
    const tick: number = slot0.tick ?? slot0[1];
    const lpFee: number = slot0.lpFee ?? slot0[3];

    if (sqrtPriceX96.isZero()) {
      console.warn(
        `[Quote] Pool ${poolConfig.symbol} returned zero sqrtPriceX96`
      );
      return null;
    }

    const price = sqrtPriceX96ToPrice(
      sqrtPriceX96,
      poolConfig.token0Decimals,
      poolConfig.token1Decimals
    );

    return { price, tick, lpFee, ts: Date.now() };
  } catch (err: any) {
    console.error(
      `[Quote] getSlot0 failed for ${poolConfig.symbol}: ${err.message}`
    );
    return null;
  }
}

async function publishTick(
  symbol: "CSR" | "CSR25",
  data: { price: number; tick: number; lpFee: number }
): Promise<void> {
  const tick = {
    type: "dex_quote",
    eventId: uuidv4(),
    symbol: symbol.toLowerCase() === "csr" ? "csr/usdt" : "csr25/usdt",
    venue: "uniswap_v4",
    source: "uniswap_v4",
    ts: new Date().toISOString(),
    effective_price_usdt: data.price,
    amount_in: 1,
    amount_out: 1 / data.price,
    tick: data.tick,
    lp_fee_bps: data.lpFee,
    gas_estimate_usdt: 0.5,
    route: "v4_pool",
  };

  try {
    await redis.xadd(TOPIC_MARKET_DATA, "*", "payload", JSON.stringify(tick));
    console.log(
      `[Quote] ${symbol} price: $${data.price.toFixed(6)} (tick: ${
        data.tick
      }, fee: ${data.lpFee}bps)`
    );
  } catch (err) {
    console.error(`[Quote] Redis publish error:`, err);
  }
}

let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

async function poll(): Promise<void> {
  const poolConfigs = getPoolConfigs();

  if (poolConfigs.length === 0) {
    console.warn(`[Quote] No pool IDs configured - skipping poll`);
    setTimeout(poll, serviceConfig.POLL_INTERVAL_MS);
    return;
  }

  try {
    const results = await Promise.all(
      poolConfigs.map(async (cfg) => {
        const quote = await fetchSlot0Quote(cfg);
        return { cfg, quote };
      })
    );

    let anySuccess = false;
    for (const { cfg, quote } of results) {
      if (quote) {
        await publishTick(cfg.symbol, quote);
        anySuccess = true;
      }
    }

    if (anySuccess) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      if (consecutiveFailures <= MAX_CONSECUTIVE_FAILURES) {
        console.warn(
          `[Quote] No quotes retrieved (attempt ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`
        );
      }
    }
  } catch (err) {
    console.error(`[Quote] Poll error:`, (err as any).message);
    consecutiveFailures++;
  } finally {
    setTimeout(poll, serviceConfig.POLL_INTERVAL_MS);
  }
}

async function main(): Promise<void> {
  console.log(`[Quote] ========================================`);
  console.log(`[Quote] Uniswap V4 Quote Service Starting`);
  console.log(`[Quote] ========================================`);
  console.log(`[Quote] RPC: ${serviceConfig.RPC_URL.slice(0, 40)}...`);
  console.log(`[Quote] PoolManager: ${CONTRACTS.UNISWAP_V4_MANAGER}`);
  console.log(`[Quote] CSR Pool ID: ${serviceConfig.CSR_POOL_ID}`);
  console.log(`[Quote] CSR25 Pool ID: ${serviceConfig.CSR25_POOL_ID}`);

  validateCurrencySorting();

  try {
    const block = await provider.getBlockNumber();
    console.log(`[Quote] RPC connected. Block: ${block}`);
  } catch (err: any) {
    console.error(`[Quote] RPC connectivity failed: ${err.message}`);
    process.exit(1);
  }

  try {
    const code = await provider.getCode(CONTRACTS.UNISWAP_V4_MANAGER);
    if (code === "0x") {
      console.error(`[Quote] FATAL: No contract at PoolManager address!`);
      process.exit(1);
    }
    console.log(`[Quote] PoolManager contract verified (${code.length} bytes)`);
  } catch (err: any) {
    console.error(`[Quote] Failed to verify PoolManager: ${err.message}`);
  }

  poll();
}

main().catch((err) => {
  console.error(`[Quote] Fatal:`, err);
  process.exit(1);
});
