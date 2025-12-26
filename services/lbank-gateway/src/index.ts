import dotenv from 'dotenv';
dotenv.config();

import WebSocket, { WebSocketServer } from 'ws';
import { getSymbolsList, loadConfig } from './config';
import { createHealthServer } from './health';
import { LBankClient } from './lbankClient';
import { LBankDepthEvent, LBankTickerEvent } from './schemas';

// ============================================================================
// LBank Gateway Service
// Connects to LBank WebSocket, normalizes data, broadcasts via internal WS
// Per architecture.md: Market Data Gateway component
// ============================================================================

// Structured logger (inline for simplicity, matches shared/logger pattern)
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
  const output = JSON.stringify(entry);
  
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

// Error tracking for health endpoint
let errorCount = 0;
const errorWindow: number[] = []; // timestamps of errors
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function trackError(): void {
  const now = Date.now();
  errorWindow.push(now);
  // Prune old errors
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
  log('info', 'starting', { version: '1.0.0' });

  // Load and validate config
  const config = loadConfig();
  const symbols = getSymbolsList(config);
  
  log('info', 'config_loaded', {
    wsUrl: config.LBANK_WS_URL,
    symbols,
    httpPort: config.HTTP_PORT,
    wsPort: config.INTERNAL_WS_PORT,
    maxStalenessSeconds: config.MAX_STALENESS_SECONDS,
  });

  // Create internal WebSocket server for broadcasting
  const wss = new WebSocketServer({ port: config.INTERNAL_WS_PORT });
  const clients = new Set<WebSocket>();

  wss.on('connection', (ws) => {
    log('info', 'client_connected', { totalClients: clients.size + 1 });
    clients.add(ws);

    ws.on('close', () => {
      clients.delete(ws);
      log('info', 'client_disconnected', { totalClients: clients.size });
    });

    ws.on('error', (err) => {
      log('warn', 'client_error', { error: err.message });
      clients.delete(ws);
    });
  });

  log('info', 'internal_ws_started', { port: config.INTERNAL_WS_PORT });

  // Broadcast function
  function broadcast(message: LBankTickerEvent | LBankDepthEvent): void {
    const payload = JSON.stringify(message);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // Create LBank client
  const lbankClient = new LBankClient({
    wsUrl: config.LBANK_WS_URL,
    symbols,
    onLog: (level, event, data) => log(level as LogLevel, event, data),
  });

  // Handle ticker events
  lbankClient.on('ticker', (ticker: LBankTickerEvent) => {
    broadcast(ticker);
  });

  // Handle depth events
  lbankClient.on('depth', (depth: LBankDepthEvent) => {
    // Update ticker bid/ask from depth data (more accurate)
    if (depth.bids.length > 0 && depth.asks.length > 0) {
      const bestBid = depth.bids[0][0];
      const bestAsk = depth.asks[0][0];
      
      // Emit updated ticker with accurate bid/ask
      const tickerFromDepth: LBankTickerEvent = {
        type: 'lbank.ticker',
        symbol: depth.symbol,
        ts: depth.ts,
        bid: bestBid,
        ask: bestAsk,
        last: (bestBid + bestAsk) / 2, // midpoint as proxy
        source_ts: depth.source_ts,
      };
      broadcast(tickerFromDepth);
    }
    broadcast(depth);
  });

  // Handle errors
  lbankClient.on('error', () => {
    trackError();
  });

  // Handle max reconnect reached
  lbankClient.on('max_reconnect_reached', () => {
    log('error', 'max_reconnect_reached', { message: 'Will not retry further' });
    // In production, might want to alert or exit here
  });

  // Connect to LBank
  lbankClient.connect();

  // Start health HTTP server
  const healthApp = createHealthServer(lbankClient, config, symbols, getErrorCount);
  healthApp.listen(config.HTTP_PORT, () => {
    log('info', 'health_server_started', { port: config.HTTP_PORT });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('info', 'sigterm_received', { message: 'Shutting down gracefully' });
    lbankClient.disconnect();
    wss.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('info', 'sigint_received', { message: 'Shutting down gracefully' });
    lbankClient.disconnect();
    wss.close();
    process.exit(0);
  });
}

main().catch((err) => {
  log('error', 'startup_failed', { error: String(err) });
  process.exit(1);
});
