import express, { Express, Request, Response } from 'express';
import { Config } from './config';
import { LatokenClient } from './latokenClient';

// ============================================================================
// Health endpoints for LATOKEN Gateway
// ============================================================================

interface HealthState {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  ts: string;
  last_data_ts: string | null;
  is_stale: boolean;
  running: boolean;
  symbols: string[];
  available_pairs: string[];
  init_error: string | null;
}

export function createHealthServer(
  client: LatokenClient,
  config: Config,
  symbols: string[],
  getErrorCount?: () => number
): Express {
  const app = express();

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'latoken-gateway',
      ts: new Date().toISOString()
    });
  });

  app.get('/ready', (_req: Request, res: Response) => {
    const now = Date.now();
    const lastTs = client.lastDataTimestamp;
    const lastTsMs = lastTs ? new Date(lastTs).getTime() : 0;
    const stalenessMs = lastTs ? now - lastTsMs : Infinity;
    const isStale = stalenessMs > config.MAX_STALENESS_SECONDS * 1000;

    let status: HealthState['status'] = 'healthy';
    if (!client.isRunning || client.initializationError) {
      status = 'unhealthy';
    } else if (isStale) {
      status = 'degraded';
    }

    const health: HealthState = {
      service: 'latoken-gateway',
      status,
      ts: new Date().toISOString(),
      last_data_ts: lastTs,
      is_stale: isStale,
      running: client.isRunning,
      symbols,
      available_pairs: client.getAvailablePairs(),
      init_error: client.initializationError,
    };

    res.status(status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503).json(health);
  });

  app.get('/metrics', (_req: Request, res: Response) => {
    const lastTs = client.lastDataTimestamp;
    const stalenessMs = lastTs ? Date.now() - new Date(lastTs).getTime() : -1;

    res.json({
      latoken_gateway_running: client.isRunning ? 1 : 0,
      latoken_gateway_staleness_ms: stalenessMs,
      latoken_gateway_pairs_count: client.getAvailablePairs().length,
    });
  });

  return app;
}
