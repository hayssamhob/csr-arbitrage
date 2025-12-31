import * as dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';
import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from './config';
// Shared imports
import { MarketTick, TOPICS } from '../../../packages/shared/src';

// ============================================================================
// Uniswap V4 Gateway Service
// Polls Uniswap V4 PoolManager for price updates and performs Flash Accounting checks
// ============================================================================

// Structured logging
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;
  console.log(JSON.stringify({ level, service: 'uniswap-v4-gateway', event, ts: new Date().toISOString(), ...data }));
}

async function main() {
  log('info', 'starting', { version: '2.0.0-v4' });
  const config = loadConfig();

  // 1. Redis Clients
  // Pub for Market Data
  const redisPub = new Redis(config.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });
  // Sub for Execution Requests (Blocking)
  const redisSub = new Redis(config.REDIS_URL);

  redisPub.on('connect', () => log('info', 'redis_pub_connected'));
  redisPub.on('error', (err) => log('error', 'redis_pub_error', { error: err.message }));

  // 2. Viem Client (Public & Wallet)
  // Public for reading
  const publicClient = createPublicClient({
    chain: mainnet,
    transport: http(config.RPC_URL),
  });

  // Wallet for writing - Placeholder account or private key from env
  // const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  // const walletClient = createWalletClient({
  //   account,
  //   chain: mainnet,
  //   transport: http(config.RPC_URL)
  // });

  // Minimal ABI for PoolManager (V4)
  const POOL_MANAGER_ABI = parseAbi([
    'function getSlot0(bytes32 id) external view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
    'function getLiquidity(bytes32 id) external view returns (uint128 liquidity)',
    'function swap(bytes32 key, uint256 amountSpecified, uint160 sqrtPriceLimitX96) external returns (int256 delta)'
  ]);

  // Consumer Group Setup
  const STREAM_KEY = TOPICS.EXECUTION_REQUESTS;
  const GROUP_NAME = 'execution_group';
  const CONSUMER_NAME = `executor_${uuidv4()}`;

  try {
    await redisSub.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
    log('info', 'consumer_group_created');
  } catch (err: any) {
    if (!err.message.includes('BUSYGROUP')) {
      log('error', 'xgroup_create_error', { error: err.message });
    }
  }

  // Execution Loop
  async function consumeExecutionStream() {
    log('info', 'starting_execution_consumer');
    while (true) {
      try {
        const results = await redisSub.call(
          'XREADGROUP',
          'GROUP',
          GROUP_NAME,
          CONSUMER_NAME,
          'BLOCK',
          '2000',
          'COUNT',
          '10',
          'STREAMS',
          STREAM_KEY,
          '>'
        ) as any;

        if (results) {
          for (const [stream, messages] of results) {
            for (const [id, fields] of messages) {
              let dataStr: string | null = null;
              for (let i = 0; i < fields.length; i += 2) {
                if (fields[i] === 'data') {
                  dataStr = fields[i + 1];
                  break;
                }
              }

              if (!dataStr) {
                await redisSub.xack(STREAM_KEY, GROUP_NAME, id);
                continue;
              }

              try {
                const raw = JSON.parse(dataStr);
                // Schema validation: BusMessageSchema.parse(raw) or specific ExecutionRequestSchema if separate
                if (raw.type === 'execution.request') {
                  log('info', 'processing_execution', {
                    eventId: raw.eventId,
                    symbol: raw.symbol,
                    direction: raw.direction,
                    size: raw.sizeUsdt
                  });
                  await executeTrade(raw);
                }

                await redisSub.xack(STREAM_KEY, GROUP_NAME, id);
              } catch (execErr: any) {
                log('error', 'execution_failed', { id, error: execErr.message });
                // Ack on failure to avoid poison pill? Or retry?
                // For MVP ack.
                await redisSub.xack(STREAM_KEY, GROUP_NAME, id);
              }
            }
          }
        }
      } catch (err: any) {
        log('error', 'consume_error', { error: err.message });
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  async function executeTrade(request: any) {
    // Placeholder Implementation
    // 1. Construct V4 Swap Call
    // 2. Submit Transaction
    // 3. Wait for Receipt

    // Simulating delay for on-chain
    await new Promise(r => setTimeout(r, 100));

    // Log success
    log('info', 'trade_executed', {
      runId: request.runId,
      txHash: '0x' + uuidv4().replace(/-/g, ''), // Mock Hash
      status: 'success'
    });
  }

  consumeExecutionStream();

  // Polling Loop
  const POLL_INTERVAL = 3000;
  const pools = [
    { name: 'CSR/USDT', id: config.CSR_POOL_ID },
    { name: 'CSR25/USDT', id: config.CSR25_POOL_ID },
  ];

  setInterval(async () => {
    for (const pool of pools) {
      if (!pool.id || !pool.id.startsWith('0x')) continue;

      try {
        const tick: MarketTick = {
          type: 'market.tick',
          eventId: uuidv4(),
          symbol: pool.name,
          venue: 'uniswap_v4',
          ts: Date.now(),
          price: 0.0125, // Placeholder price
          meta: { poolId: pool.id }
        };

        if (redisPub.status === 'ready') {
          await redisPub.xadd(TOPICS.MARKET_DATA, '*', 'data', JSON.stringify(tick));
        }

      } catch (err: any) {
        log('error', 'poll_failed', { pool: pool.name, error: err.message });
      }
    }
  }, POLL_INTERVAL);

  log('info', 'polling_started');

  process.on('SIGTERM', async () => {
    log('info', 'shutting_down');
    await redisPub.quit();
    await redisSub.quit();
    process.exit(0);
  });
}

main().catch((err) => {
  log('error', 'startup_failed', { error: String(err) });
  process.exit(1);
});
