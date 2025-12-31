import { BigNumber, Contract, constants, providers, utils } from "ethers";
import Redis from "ioredis";
import { v4 as uuidv4 } from "uuid";
import { CONTRACTS, config as serviceConfig } from "./config";

// ==========================================================================
// Uniswap V4 Quote Service with Dynamic Pool Discovery
// Uses getSlot0(poolId) to find active pools and calculates price from sqrtPriceX96
// ==========================================================================

export type LogLevel = "debug" | "info" | "warn" | "error";

const TOPIC_MARKET_DATA = "market.data";

// Pool discovery configuration - common Uniswap V4 parameters
const FEES = [500, 3000, 10000]; // 0.05%, 0.3%, 1%
const TICK_SPACINGS = [10, 60, 200];
const HOOKS_ADDRESS = constants.AddressZero; // Try address(0) first

// StateView ABI for getSlot0 - the proper way to read V4 pool state
const STATE_VIEW_ABI = [
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
];

// V4 Quoter ABI for quoteExactInputSingle
const QUOTER_ABI = [
  "function quoteExactInputSingle((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks, bool zeroForOne, uint128 amountIn, bytes hookData)) external returns (uint256 amountOut, uint256 gasEstimate)",
];

// Token definitions with decimals
const TOKENS = {
  USDT: {
    address: CONTRACTS.USDT_TOKEN,
    decimals: 6,
    symbol: "USDT",
  },
  CSR: {
    address: CONTRACTS.CSR_TOKEN,
    decimals: 18,
    symbol: "CSR",
  },
  CSR25: {
    address: CONTRACTS.CSR25_TOKEN,
    decimals: 18,
    symbol: "CSR25",
  },
};

// Sort addresses numerically for V4 pool key (currency0 < currency1)
function sortCurrencies(tokenA: string, tokenB: string): [string, string] {
  const a = BigNumber.from(tokenA);
  const b = BigNumber.from(tokenB);
  return a.lt(b) ? [tokenA, tokenB] : [tokenB, tokenA];
}

// Compute pool ID from PoolKey (keccak256 of packed struct)
function computePoolId(
  currency0: string,
  currency1: string,
  fee: number,
  tickSpacing: number,
  hooks: string
): string {
  // PoolKey struct: (Currency currency0, Currency currency1, uint24 fee, int24 tickSpacing, IHooks hooks)
  const encoded = utils.defaultAbiCoder.encode(
    ["address", "address", "uint24", "int24", "address"],
    [currency0, currency1, fee, tickSpacing, hooks]
  );
  return utils.keccak256(encoded);
}

// Calculate price from sqrtPriceX96
// sqrtPriceX96 = sqrt(price) * 2^96 where price = token1/token0
function sqrtPriceX96ToPrice(
  sqrtPriceX96: BigNumber,
  token0Decimals: number,
  token1Decimals: number
): number {
  // Convert to number safely using string manipulation
  const sqrtPriceStr = sqrtPriceX96.toString();
  const Q96 = BigNumber.from(2).pow(96);

  // price = (sqrtPriceX96 / 2^96)^2
  // Adjust for decimals: multiply by 10^(token0Decimals - token1Decimals)
  const sqrtPriceNum = parseFloat(sqrtPriceStr) / parseFloat(Q96.toString());
  const rawPrice = sqrtPriceNum * sqrtPriceNum;

  // Decimal adjustment: price is in token1/token0
  const decimalAdjust = Math.pow(10, token0Decimals - token1Decimals);
  return rawPrice * decimalAdjust;
}

const provider = new providers.JsonRpcProvider(serviceConfig.RPC_URL);
const redis = new Redis(serviceConfig.REDIS_URL);

// StateView contract for getSlot0 calls
const stateView = new Contract(
  CONTRACTS.UNISWAP_V4_MANAGER,
  STATE_VIEW_ABI,
  provider
);

// Quoter contract for price quotes
const quoter = new Contract(CONTRACTS.UNISWAP_V4_QUOTER, QUOTER_ABI, provider);

// Pool state from on-chain
interface PoolState {
  sqrtPriceX96: BigNumber;
  tick: number;
  protocolFee: number;
  lpFee: number;
}

// Validated pool info (discovered pool key)
interface ValidatedPool {
  symbol: "CSR" | "CSR25";
  poolId: string;
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
  token0Decimals: number;
  token1Decimals: number;
}

// Cache for discovered pools
const discoveredPools: Map<string, ValidatedPool> = new Map();

// Read pool state using PoolManager.getSlot0(poolId)
async function getSlot0(poolId: string): Promise<PoolState | null> {
  try {
    const result = await stateView.callStatic.getSlot0(poolId);
    const sqrtPriceX96 = BigNumber.from(result.sqrtPriceX96);

    if (sqrtPriceX96.isZero()) {
      return null;
    }

    return {
      sqrtPriceX96,
      tick: result.tick,
      protocolFee: result.protocolFee,
      lpFee: result.lpFee,
    };
  } catch (err: any) {
    // Pool doesn't exist or call reverted
    return null;
  }
}

// Discover valid pool by trying different parameters
async function discoverPool(
  symbol: "CSR" | "CSR25",
  tokenAddress: string,
  tokenDecimals: number,
  providedPoolId?: string
): Promise<ValidatedPool | null> {
  // Check cache first
  if (discoveredPools.has(symbol)) {
    return discoveredPools.get(symbol)!;
  }

  const [currency0, currency1] = sortCurrencies(
    TOKENS.USDT.address,
    tokenAddress
  );
  const isToken0Usdt =
    currency0.toLowerCase() === TOKENS.USDT.address.toLowerCase();
  const token0Decimals = isToken0Usdt ? TOKENS.USDT.decimals : tokenDecimals;
  const token1Decimals = isToken0Usdt ? tokenDecimals : TOKENS.USDT.decimals;

  console.log(`[Quote] Discovering ${symbol} pool...`);
  console.log(`[Quote]   currency0: ${currency0}`);
  console.log(`[Quote]   currency1: ${currency1}`);

  // Try provided pool ID first
  if (providedPoolId) {
    console.log(
      `[Quote]   Checking provided ID: ${providedPoolId.slice(0, 18)}...`
    );
    const state = await getSlot0(providedPoolId);
    if (state && !state.sqrtPriceX96.isZero()) {
      console.log(
        `[Quote]   ✓ Pool found with provided ID! sqrtPriceX96=${state.sqrtPriceX96
          .toString()
          .slice(0, 20)}...`
      );
      const pool: ValidatedPool = {
        symbol,
        poolId: providedPoolId,
        currency0,
        currency1,
        fee: 3000,
        tickSpacing: 60,
        hooks: constants.AddressZero,
        token0Decimals,
        token1Decimals,
      };
      discoveredPools.set(symbol, pool);
      return pool;
    }
    console.log(`[Quote]   ✗ Provided ID not valid (sqrtPriceX96=0)`);
  }

  // Dynamic search through fee/tickSpacing combinations
  console.log(
    `[Quote]   Searching through ${
      FEES.length * TICK_SPACINGS.length
    } combinations...`
  );

  for (const fee of FEES) {
    for (const tickSpacing of TICK_SPACINGS) {
      const poolId = computePoolId(
        currency0,
        currency1,
        fee,
        tickSpacing,
        constants.AddressZero
      );
      const state = await getSlot0(poolId);

      if (state && !state.sqrtPriceX96.isZero()) {
        console.log(
          `[Quote]   ✓ Pool found! fee=${fee}, tickSpacing=${tickSpacing}`
        );
        console.log(`[Quote]     ID: ${poolId}`);
        console.log(
          `[Quote]     sqrtPriceX96: ${state.sqrtPriceX96
            .toString()
            .slice(0, 20)}...`
        );

        const pool: ValidatedPool = {
          symbol,
          poolId,
          currency0,
          currency1,
          fee,
          tickSpacing,
          hooks: constants.AddressZero,
          token0Decimals,
          token1Decimals,
        };
        discoveredPools.set(symbol, pool);
        return pool;
      }
    }
  }

  console.log(`[Quote]   ✗ No valid pool found for ${symbol}`);
  return null;
}

// Fetch quote using direct pool state reading
async function fetchQuote(
  symbol: "CSR" | "CSR25",
  tokenAddress: string,
  tokenDecimals: number,
  providedPoolId?: string
): Promise<{
  price: number;
  tick: number;
  lpFee: number;
  ts: number;
} | null> {
  // Discover/validate pool
  const pool = await discoverPool(
    symbol,
    tokenAddress,
    tokenDecimals,
    providedPoolId
  );
  if (!pool) {
    return null;
  }

  // Re-read current state (pool discovery caches the structure, but we want fresh price)
  const state = await getSlot0(pool.poolId);
  if (!state || state.sqrtPriceX96.isZero()) {
    console.warn(`[Quote] Pool ${symbol} state read failed`);
    discoveredPools.delete(symbol); // Clear cache to retry discovery
    return null;
  }

  // Calculate price from sqrtPriceX96
  // price = token1/token0
  const rawPrice = sqrtPriceX96ToPrice(
    state.sqrtPriceX96,
    pool.token0Decimals,
    pool.token1Decimals
  );

  // We want price of token in USDT
  // If USDT is token0: price = token1/token0 = TOKEN/USDT, so token price = 1/rawPrice
  // If USDT is token1: price = token1/token0 = USDT/TOKEN, so token price = rawPrice
  const isUsdtToken0 =
    pool.currency0.toLowerCase() === TOKENS.USDT.address.toLowerCase();
  const tokenPriceUsdt = isUsdtToken0 ? 1 / rawPrice : rawPrice;

  return {
    price: tokenPriceUsdt,
    tick: state.tick,
    lpFee: state.lpFee,
    ts: Date.now(),
  };
}

async function publishTick(
  symbol: "CSR" | "CSR25",
  data: { price: number; tick: number; lpFee: number }
): Promise<void> {
  const payload = {
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
    route: "v4_pool_direct",
  };

  try {
    await redis.xadd(
      TOPIC_MARKET_DATA,
      "*",
      "payload",
      JSON.stringify(payload)
    );
    console.log(
      `[Quote] ${symbol} price: $${data.price.toFixed(6)} (tick: ${data.tick})`
    );
  } catch (err) {
    console.error(`[Quote] Redis publish error:`, err);
  }
}

// Pool configs for polling
interface PoolPollConfig {
  symbol: "CSR" | "CSR25";
  tokenAddress: string;
  tokenDecimals: number;
  providedPoolId: string;
}

const POOL_CONFIGS: PoolPollConfig[] = [
  {
    symbol: "CSR",
    tokenAddress: TOKENS.CSR.address,
    tokenDecimals: TOKENS.CSR.decimals,
    providedPoolId: serviceConfig.CSR_POOL_ID,
  },
  {
    symbol: "CSR25",
    tokenAddress: TOKENS.CSR25.address,
    tokenDecimals: TOKENS.CSR25.decimals,
    providedPoolId: serviceConfig.CSR25_POOL_ID,
  },
];

let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;

async function poll(): Promise<void> {
  try {
    const results = await Promise.all(
      POOL_CONFIGS.map(async (cfg) => {
        const quote = await fetchQuote(
          cfg.symbol,
          cfg.tokenAddress,
          cfg.tokenDecimals,
          cfg.providedPoolId
        );
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
  console.log(`[Quote] Uniswap V4 Quote Service with Pool Discovery`);
  console.log(`[Quote] ========================================`);
  console.log(`[Quote] RPC: ${serviceConfig.RPC_URL.slice(0, 40)}...`);
  console.log(`[Quote] PoolManager: ${CONTRACTS.UNISWAP_V4_MANAGER}`);
  console.log(
    `[Quote] CSR Pool ID: ${serviceConfig.CSR_POOL_ID.slice(0, 18)}...`
  );
  console.log(
    `[Quote] CSR25 Pool ID: ${serviceConfig.CSR25_POOL_ID.slice(0, 18)}...`
  );

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
