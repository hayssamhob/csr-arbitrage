import { ethers } from 'ethers';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { config, CONTRACTS } from './config';
import { createPublicClient, http, parseAbi, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';

// ============================================================================
// Uniswap V4 Quote Service (Redis Publisher)
// Fetches prices for CSR and CSR25 from Uniswap V4 pools
// Publishes 'dex_quote' messages to Redis 'market.data' stream
// ============================================================

const TOPIC_MARKET_DATA = 'market.data';

// Minimal ABIs for Uniswap V4
const POOL_MANAGER_ABI = parseAbi([
    'function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)'
]);

const QUOTER_ABI = parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'function quoteExactInputSingle((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, bool zeroForOne, uint128 amountIn, bytes hookData) external returns (uint128 amountOut, uint256 gasEstimate)'
]);

const redis = new Redis(config.REDIS_URL);
const viemClient = createPublicClient({
    chain: mainnet,
    transport: http(config.RPC_URL)
});

/**
 * Fetch V4 Price using PoolManager (Slot0) as fallback
 */
async function getV4MidPrice(poolId: string): Promise<number | null> {
    try {
        const result = await viemClient.readContract({
            address: CONTRACTS.UNISWAP_V4_MANAGER as `0x${string}`,
            abi: POOL_MANAGER_ABI,
            functionName: 'getSlot0',
            args: [poolId as `0x${string}`]
        });

        const sqrtPriceX96 = result[0];

        // Price = (sqrtPriceX96 / 2^96)^2
        const price = Number(sqrtPriceX96) / (2 ** 96);
        const ratio = price * price;

        // Decimal adjustment: 10^18 (Token) / 10^6 (USDT) = 10^12
        return ratio * 1e12;
    } catch (err) {
        console.error(`[V4-Price] Error fetching Slot0 for ${poolId}:`, err);
        return null;
    }
}

async function getQuote(symbol: 'CSR' | 'CSR25', amountUsdt: number) {
    const tokenAddress = symbol === 'CSR' ? CONTRACTS.CSR_TOKEN : CONTRACTS.CSR25_TOKEN;
    const poolId = symbol === 'CSR' ? config.CSR_POOL_ID : config.CSR25_POOL_ID;

    if (!poolId) {
        console.warn(`[Quote] No PoolID configured for ${symbol}`);
        return null;
    }

    try {
        // Construct PoolKey
        const poolKey = {
            currency0: tokenAddress < CONTRACTS.USDT_TOKEN ? (tokenAddress as `0x${string}`) : (CONTRACTS.USDT_TOKEN as `0x${string}`),
            currency1: tokenAddress < CONTRACTS.USDT_TOKEN ? (CONTRACTS.USDT_TOKEN as `0x${string}`) : (tokenAddress as `0x${string}`),
            fee: 3000,
            tickSpacing: 60,
            hooks: '0x0000000000000000000000000000000000000000' as `0x${string}`
        };

        const zeroForOne = tokenAddress.toLowerCase() === poolKey.currency0.toLowerCase();
        const amountIn = BigInt(1e18); // 1 Token (18 decimals)

        // Try Quoter first
        try {
            console.log(`[Quote] Simulating V4 Quote for ${symbol}...`);
            console.log(`PoolKey:`, poolKey);
            console.log(`zeroForOne: ${zeroForOne}, amountIn: ${amountIn.toString()}`);

            const { result } = await viemClient.simulateContract({
                address: CONTRACTS.UNISWAP_V4_QUOTER as `0x${string}`,
                abi: QUOTER_ABI,
                functionName: 'quoteExactInputSingle',
                args: [poolKey, zeroForOne, amountIn, '0x']
            });

            const [amountOut, gasEstimate] = result as [bigint, bigint];
            const price = Number(formatUnits(amountOut, 6));

            console.log(`[Quote] V4 Quoter success for ${symbol}: ${price} USDT`);

            return {
                price: price,
                amountOut: amountOut.toString(),
                gasEstimate: gasEstimate.toString(),
                ts: Date.now()
            };
        } catch (quoterErr: any) {
            console.warn(`[Quote] V4 Quoter failed for ${symbol}: ${quoterErr.shortMessage || quoterErr.message}`);

            console.log(`[Quote] Trying Slot0 fallback for ${symbol} (PoolID: ${poolId})...`);
            const midPrice = await getV4MidPrice(poolId);

            if (!midPrice) {
                console.error(`[Quote] Slot0 fallback also failed for ${symbol}`);
                return null;
            }

            console.log(`[Quote] Slot0 fallback success for ${symbol}: ${midPrice} USDT`);

            return {
                price: midPrice,
                amountOut: (midPrice * 1e6).toString(),
                gasEstimate: "200000",
                ts: Date.now()
            };
        }
    } catch (e: any) {
        console.error(`[Quote] V4 fetch failed for ${symbol}:`, e.message);
    }
    return null;
}

async function publishTick(symbol: string, data: any) {
    const tick = {
        type: 'dex_quote',
        eventId: uuidv4(),
        symbol: symbol.toLowerCase() === 'csr' ? 'csr/usdt' : 'csr25/usdt',
        venue: 'uniswap_v4',
        source: 'uniswap_v4',
        ts: new Date().toISOString(),
        effective_price_usdt: data.price,
        amount_in: 1, // 1 Token
        amount_out: Number(data.amountOut) / 1e6, // In USDT
        gas_estimate_usdt: (Number(data.gasEstimate) * 40e-9 * 3000), // Very rough estimate (gas * gasPrice * ethPrice)
        route: 'v4_pool'
    };

    try {
        await redis.xadd(TOPIC_MARKET_DATA, '*', 'payload', JSON.stringify(tick));
        console.log(`[Quote] Published V4 ${symbol} price: ${data.price.toFixed(6)} USDT`);
    } catch (err) {
        console.error(`[Quote] Redis publish error:`, err);
    }
}

async function main() {
    console.log(`Uniswap V4 Quote Service starting...`);
    console.log(`RPC: ${config.RPC_URL.slice(0, 30)}...`);
    console.log(`PoolManager: ${CONTRACTS.UNISWAP_V4_MANAGER}`);

    // Test connectivity
    try {
        const block = await viemClient.getBlockNumber();
        console.log(`[Quote] Successfully connected to RPC. Current block: ${block}`);
    } catch (e: any) {
        console.error(`[Quote] RPC connectivity test failed:`, e.message);
    }

    const poll = async () => {
        try {
            const [csrQuote, csr25Quote] = await Promise.all([
                getQuote('CSR', 100),
                getQuote('CSR25', 100)
            ]);

            if (csrQuote) await publishTick('csr', csrQuote);
            if (csr25Quote) await publishTick('csr25', csr25Quote);

        } catch (err) {
            console.error(`[Quote] Error in poll loop:`, err);
        }
        setTimeout(poll, config.POLL_INTERVAL_MS);
    };

    poll();
}

main().catch(console.error);
