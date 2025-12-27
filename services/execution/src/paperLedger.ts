import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// ============================================================================
// Paper Trading Ledger (SQLite)
// Tracks simulated trades and PnL for paper trading mode
// ============================================================================

export interface PaperTrade {
  id: string;
  ts: string;
  market: string;
  direction: 'buy_cex_sell_dex' | 'buy_dex_sell_cex';
  size_usdt: number;
  cex_price: number;
  dex_price: number;
  raw_spread_bps: number;
  estimated_cost_bps: number;
  edge_after_costs_bps: number;
  simulated_pnl_usdt: number;
  fees_usdt: number;
  decision_id: string;
  status: 'simulated' | 'would_execute';
}

export interface LedgerSummary {
  total_trades: number;
  total_pnl_usdt: number;
  total_fees_usdt: number;
  winning_trades: number;
  losing_trades: number;
  avg_edge_bps: number;
}

export class PaperLedger {
  private db: Database.Database;

  constructor(dbPath: string = './data/paper_ledger.db') {
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS paper_trades (
        id TEXT PRIMARY KEY,
        ts TEXT NOT NULL,
        market TEXT NOT NULL,
        direction TEXT NOT NULL,
        size_usdt REAL NOT NULL,
        cex_price REAL NOT NULL,
        dex_price REAL NOT NULL,
        raw_spread_bps REAL NOT NULL,
        estimated_cost_bps REAL NOT NULL,
        edge_after_costs_bps REAL NOT NULL,
        simulated_pnl_usdt REAL NOT NULL,
        fees_usdt REAL NOT NULL,
        decision_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_paper_trades_ts ON paper_trades(ts);
      CREATE INDEX IF NOT EXISTS idx_paper_trades_market ON paper_trades(market);
      CREATE INDEX IF NOT EXISTS idx_paper_trades_decision_id ON paper_trades(decision_id);
    `);
  }

  recordTrade(trade: Omit<PaperTrade, 'id'>): PaperTrade {
    const id = randomUUID();
    const fullTrade: PaperTrade = { id, ...trade };

    const stmt = this.db.prepare(`
      INSERT INTO paper_trades (
        id, ts, market, direction, size_usdt, cex_price, dex_price,
        raw_spread_bps, estimated_cost_bps, edge_after_costs_bps,
        simulated_pnl_usdt, fees_usdt, decision_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullTrade.id,
      fullTrade.ts,
      fullTrade.market,
      fullTrade.direction,
      fullTrade.size_usdt,
      fullTrade.cex_price,
      fullTrade.dex_price,
      fullTrade.raw_spread_bps,
      fullTrade.estimated_cost_bps,
      fullTrade.edge_after_costs_bps,
      fullTrade.simulated_pnl_usdt,
      fullTrade.fees_usdt,
      fullTrade.decision_id,
      fullTrade.status
    );

    return fullTrade;
  }

  getRecentTrades(limit: number = 20): PaperTrade[] {
    const stmt = this.db.prepare(`
      SELECT * FROM paper_trades ORDER BY ts DESC LIMIT ?
    `);
    return stmt.all(limit) as PaperTrade[];
  }

  getSummary(): LedgerSummary {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_trades,
        COALESCE(SUM(simulated_pnl_usdt), 0) as total_pnl_usdt,
        COALESCE(SUM(fees_usdt), 0) as total_fees_usdt,
        COALESCE(SUM(CASE WHEN simulated_pnl_usdt > 0 THEN 1 ELSE 0 END), 0) as winning_trades,
        COALESCE(SUM(CASE WHEN simulated_pnl_usdt <= 0 THEN 1 ELSE 0 END), 0) as losing_trades,
        COALESCE(AVG(edge_after_costs_bps), 0) as avg_edge_bps
      FROM paper_trades
    `).get() as any;

    return {
      total_trades: stats.total_trades || 0,
      total_pnl_usdt: stats.total_pnl_usdt || 0,
      total_fees_usdt: stats.total_fees_usdt || 0,
      winning_trades: stats.winning_trades || 0,
      losing_trades: stats.losing_trades || 0,
      avg_edge_bps: stats.avg_edge_bps || 0,
    };
  }

  // Check if a decision has already been processed (idempotency)
  hasDecision(decisionId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM paper_trades WHERE decision_id = ?
    `);
    const result = stmt.get(decisionId) as { count: number };
    return result.count > 0;
  }

  close(): void {
    this.db.close();
  }
}
