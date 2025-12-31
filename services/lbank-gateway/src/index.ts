import dotenv from 'dotenv';
dotenv.config();

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { getSymbolsList, loadConfig } from './config';
import { createHealthServer } from './health';
import { LBankClient } from './lbankClient';
// Relative import to shared package (Must be supported by build context)
import { MarketTick, TOPICS } from '../../../packages/shared/src';
import { LBankDepthEvent, LBankTickerEvent } from './schemas';

// ============================================================================
// LBank Gateway Service (Redis Stream Edition)
// Connects to LBank WebSocket, normalizes data, publishes to Redis 'market.data'
// ============================================================================

// Structured logger
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;

  const entry = {
    level,
    service: 'lbank-gateway',
    event,
    ts: new Date().toISOString(),
    ...data,
  };
  console.log(JSON.stringify(entry));
}

// Error tracking
let errorCount = 0;
const errorWindow: number[] = [];
const ERROR_WINDOW_MS = 5 * 60 * 1000;

function trackError(): void {
  const now = Date.now();
  errorWindow.push(now);
  while (errorWindow.length > 0 && errorWindow[0] < now - ERROR_WINDOW_MS) {
    errorWindow.shift();
  }
  errorCount = errorWindow.length;
}

function getErrorCount(): number {
  const now = Date.now();
  while (errorWindow.length > 0 && errorWindow[0] < now - ERROR_WINDOW_MS) {
    errorWindow.shift();
  }
  return errorWindow.length;
}

// Main entry point
async function main(): Promise<void> {
  log('info', 'starting', { version: '2.0.0-redis' });

  // Load config
  const config = loadConfig();
  const symbols = getSymbolsList(config);

  log('info', 'config_loaded', {
    wsUrl: config.LBANK_WS_URL,
    symbols,
    redisUrl: config.REDIS_URL,
  });

  // Connect to Redis
  const redis = new Redis(config.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

  redis.on('connect', () => log('info', 'redis_connected'));
  redis.on('error', (err) => log('error', 'redis_error', { error: err.message }));

  // Helper to publish to Redis Stream
  async function publishTick(tick: MarketTick): Promise<void> {
    try {
      // XADD key * field value
      await redis.xadd(TOPICS.MARKET_DATA, '*', 'data', JSON.stringify(tick));
      // Optional: Publish to Pub/Sub for real-time UI (lighter weight)
      await redis.publish(TOPICS.MARKET_DATA, JSON.stringify(tick));
    } catch (err: any) {
      log('error', 'publish_failed', { error: err.message });
    }
  }

  // LBank Client
  const lbankClient = new LBankClient({
    wsUrl: config.LBANK_WS_URL,
    symbols,
    onLog: (level, event, data) => log(level as LogLevel, event, data),
  });

  // Handle Ticker
  lbankClient.on('ticker', (event: LBankTickerEvent) => {
    const tick: MarketTick = {
      type: 'market.tick',
      eventId: uuidv4(),
      symbol: event.symbol.toUpperCase().replace('_', '/'), // csr_usdt -> CSR/USDT
      venue: 'lbank',
      ts: Date.now(),
      bid: event.bid,
      ask: event.ask,
      last: event.last,
      sourceTs: event.source_ts ? new Date(event.source_ts).getTime() : undefined,
    };
    publishTick(tick);
  });

  // Handle Depth (Update bid/ask more accurately if needed)
  lbankClient.on('depth', (depth: LBankDepthEvent) => {
    if (depth.bids.length > 0 && depth.asks.length > 0) {
      const bestBid = depth.bids[0][0];
      const bestAsk = depth.asks[0][0];

      const tick: MarketTick = {
        type: 'market.tick',
        eventId: uuidv4(),
        symbol: depth.symbol.toUpperCase().replace('_', '/'),
        venue: 'lbank',
        ts: Date.now(),
        bid: bestBid,
        ask: bestAsk,
        last: (bestBid + bestAsk) / 2,
        sourceTs: depth.source_ts ? new Date(depth.source_ts).getTime() : undefined,
      };
      publishTick(tick);
    }
  });

  lbankClient.on('error', trackError);
  lbankClient.connect();

  // Health Server (Keep mostly same for compatibility)
  const healthApp = createHealthServer(lbankClient, config, symbols, getErrorCount);
  healthApp.listen(config.HTTP_PORT, () => {
    log('info', 'health_server_started', { port: config.HTTP_PORT });
  });

  // Graceful shutdown
  const shutdown = async () => {
    log('info', 'shutting_down');
    lbankClient.disconnect();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  log('error', 'startup_failed', { error: String(err) });
  process.exit(1);
});

