import express, { Express, Request, Response } from 'express';
import { Config } from './config';
import { LBankClient } from './lbankClient';

// ============================================================================
// Health endpoints for LBank Gateway
// Per architecture.md: /health, /ready, /metrics (optional)
// ============================================================================

interface HealthState {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  ts: string;
  last_message_ts: string | null;
  reconnect_count: number;
  errors_last_5m: number;
  is_stale: boolean;
  connected: boolean;
  symbols: string[];
}

export function createHealthServer(
  client: LBankClient,
  config: Config,
  symbols: string[],
  getErrorCount: () => number
): Express {
  const app = express();

  // Health check - basic liveness
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'lbank-gateway', ts: new Date().toISOString() });
  });

  // Ready check - detailed health including staleness
  app.get('/ready', (_req: Request, res: Response) => {
    const now = Date.now();
    const lastTs = client.lastMessageTimestamp;
    const lastTsMs = lastTs ? new Date(lastTs).getTime() : 0;
    const stalenessMs = lastTs ? now - lastTsMs : Infinity;
    const isStale = stalenessMs > config.MAX_STALENESS_SECONDS * 1000;

    let status: HealthState['status'] = 'healthy';
    if (!client.connected) {
      status = 'unhealthy';
    } else if (isStale) {
      status = 'degraded';
    }

    const health: HealthState = {
      service: 'lbank-gateway',
      status,
      ts: new Date().toISOString(),
      last_message_ts: lastTs,
      reconnect_count: client.totalReconnects,
      errors_last_5m: getErrorCount(),
      is_stale: isStale,
      connected: client.connected,
      symbols,
    };

    const httpStatus = status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503;
    res.status(httpStatus).json(health);
  });

  // Metrics endpoint (simple JSON for now)
  app.get('/metrics', (_req: Request, res: Response) => {
    const lastTs = client.lastMessageTimestamp;
    const lastTsMs = lastTs ? new Date(lastTs).getTime() : 0;
    const stalenessMs = lastTs ? Date.now() - lastTsMs : -1;

    res.json({
      lbank_gateway_connected: client.connected ? 1 : 0,
      lbank_gateway_reconnect_total: client.totalReconnects,
      lbank_gateway_errors_5m: getErrorCount(),
      lbank_gateway_staleness_ms: stalenessMs,
      lbank_gateway_symbols_count: symbols.length,
    });
  });

  return app;
}
