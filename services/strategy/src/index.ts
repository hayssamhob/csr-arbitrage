import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { loadConfig } from './config';
import {
    LBankTickerEventSchema,
    StrategyDecision,
    UniswapQuoteResultSchema,
} from './schemas';
import { StrategyEngine } from './strategyEngine';

// ============================================================================
// Strategy Engine Service
// DRY-RUN ONLY: Monitors spreads and logs decisions
// Per agents.md: never executes trades in MVP, only logs decisions
// ============================================================================

// Structured logger
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;
  
  const entry = {
    level,
    service: 'strategy',
    event,
    ts: new Date().toISOString(),
    ...data,
  };
  const output = JSON.stringify(entry);
  
  if (level === 'error') console.error(output);
  else if (level === 'warn') console.warn(output);
  else console.log(output);
}

// Track decisions for dashboard/metrics
let lastDecision: StrategyDecision | null = null;
let decisionCount = 0;
let wouldTradeCount = 0;

async function main(): Promise<void> {
  log('info', 'starting', { version: '1.0.0', mode: 'DRY_RUN_ONLY' });

  // Load and validate config
  const config = loadConfig();
  
  log('info', 'config_loaded', {
    symbol: config.SYMBOL,
    minEdgeBps: config.MIN_EDGE_BPS,
    estimatedCostBps: config.ESTIMATED_COST_BPS,
    quoteSizeUsdt: config.QUOTE_SIZE_USDT,
    lbankGateway: config.LBANK_GATEWAY_WS_URL,
    uniswapQuoteUrl: config.UNISWAP_QUOTE_URL,
  });

  // Initialize strategy engine
  const engine = new StrategyEngine(
    config,
    (level, event, data) => log(level as LogLevel, event, data),
    (decision) => {
      lastDecision = decision;
      decisionCount++;
      if (decision.would_trade) {
        wouldTradeCount++;
        // IMPORTANT: DRY-RUN ONLY - Log but do not execute
        log('info', 'DRY_RUN_WOULD_TRADE', {
          direction: decision.direction,
          size: decision.suggested_size_usdt,
          edge_bps: decision.edge_after_costs_bps,
          note: 'NO EXECUTION - DRY RUN ONLY',
        });
      }
    }
  );

  // Connect to LBank Gateway WebSocket
  let ws: WebSocket | null = null;
  let wsReconnectAttempts = 0;

  function connectLBankGateway(): void {
    log('info', 'connecting_to_lbank_gateway', { url: config.LBANK_GATEWAY_WS_URL });
    
    ws = new WebSocket(config.LBANK_GATEWAY_WS_URL);

    ws.on('open', () => {
      log('info', 'lbank_gateway_connected');
      wsReconnectAttempts = 0;
    });

    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const parsed = JSON.parse(data.toString());
        
        // Try to parse as ticker event
        const tickerResult = LBankTickerEventSchema.safeParse(parsed);
        if (tickerResult.success) {
          engine.updateLBankTicker(tickerResult.data);
        }
      } catch (err) {
        log('warn', 'ws_message_parse_error', { error: String(err) });
      }
    });

    ws.on('close', () => {
      log('warn', 'lbank_gateway_disconnected');
      scheduleReconnect();
    });

    ws.on('error', (err) => {
      log('error', 'lbank_gateway_error', { error: err.message });
    });
  }

  function scheduleReconnect(): void {
    wsReconnectAttempts++;
    const delay = Math.min(5000 * Math.pow(1.5, wsReconnectAttempts - 1), 60000);
    log('info', 'scheduling_reconnect', { attempt: wsReconnectAttempts, delayMs: delay });
    setTimeout(connectLBankGateway, delay);
  }

  // Connect to LBank Gateway
  connectLBankGateway();

  // Poll Uniswap Quote Service
  async function pollUniswapQuote(): Promise<void> {
    try {
      const response = await fetch(`${config.UNISWAP_QUOTE_URL}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_usdt: config.QUOTE_SIZE_USDT,
          direction: 'buy',
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const quoteResult = UniswapQuoteResultSchema.safeParse(data);
      
      if (quoteResult.success) {
        engine.updateUniswapQuote(quoteResult.data);
      } else {
        log('warn', 'invalid_quote_response', { errors: quoteResult.error.format() });
      }
    } catch (err) {
      log('error', 'uniswap_quote_fetch_error', { error: String(err) });
    }
  }

  // Start polling Uniswap quotes
  setInterval(pollUniswapQuote, config.UNISWAP_POLL_INTERVAL_MS);
  pollUniswapQuote(); // Initial fetch

  // Create HTTP server for health endpoints
  const app = express();
  app.use(express.json());

  // Health check - basic liveness
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'ok', 
      service: 'strategy', 
      mode: 'DRY_RUN_ONLY',
      ts: new Date().toISOString() 
    });
  });

  // Ready check - detailed health
  app.get('/ready', (_req: Request, res: Response) => {
    const state = engine.getState();
    const isStale = engine.isDataStale();
    const wsConnected = ws?.readyState === WebSocket.OPEN;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!wsConnected || !state.lbankTicker || !state.uniswapQuote) {
      status = 'unhealthy';
    } else if (isStale) {
      status = 'degraded';
    }

    const health = {
      service: 'strategy',
      mode: 'DRY_RUN_ONLY',
      status,
      ts: new Date().toISOString(),
      ws_connected: wsConnected,
      has_lbank_data: !!state.lbankTicker,
      has_uniswap_data: !!state.uniswapQuote,
      is_data_stale: isStale,
      last_lbank_update: state.lastLbankUpdate,
      last_uniswap_update: state.lastUniswapUpdate,
      decision_count: decisionCount,
      would_trade_count: wouldTradeCount,
    };

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    res.status(httpStatus).json(health);
  });

  // Get last decision
  app.get('/decision', (_req: Request, res: Response) => {
    if (!lastDecision) {
      res.status(404).json({ error: 'No decision yet' });
      return;
    }
    res.json(lastDecision);
  });

  // Get current state
  app.get('/state', (_req: Request, res: Response) => {
    const state = engine.getState();
    res.json({
      ts: new Date().toISOString(),
      lbank_ticker: state.lbankTicker,
      uniswap_quote: state.uniswapQuote,
      is_stale: engine.isDataStale(),
    });
  });

  // Start server
  app.listen(config.HTTP_PORT, () => {
    log('info', 'server_started', { port: config.HTTP_PORT, mode: 'DRY_RUN_ONLY' });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log('info', 'sigterm_received', { message: 'Shutting down' });
    ws?.close();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    log('info', 'sigint_received', { message: 'Shutting down' });
    ws?.close();
    process.exit(0);
  });
}

main().catch((err) => {
  log('error', 'startup_failed', { error: String(err) });
  process.exit(1);
});
