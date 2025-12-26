import { z } from 'zod';

// ============================================================================
// LBank Ticker Event Schema (Internal normalized format)
// Per architecture.md: includes bid, ask, last, timestamps
// ============================================================================
export const LBankTickerEventSchema = z.object({
  type: z.literal('lbank.ticker'),
  symbol: z.string(), // e.g., "csr_usdt"
  ts: z.string(), // ISO 8601 timestamp (our receive time)
  bid: z.number(),
  ask: z.number(),
  last: z.number(),
  volume_24h: z.number().optional(),
  source_ts: z.string().optional(), // Original timestamp from LBank
});

export type LBankTickerEvent = z.infer<typeof LBankTickerEventSchema>;

// ============================================================================
// LBank Depth Event Schema (Internal normalized format)
// ============================================================================
export const LBankDepthEventSchema = z.object({
  type: z.literal('lbank.depth'),
  symbol: z.string(),
  ts: z.string(),
  bids: z.array(z.tuple([z.number(), z.number()])), // [price, quantity][]
  asks: z.array(z.tuple([z.number(), z.number()])), // [price, quantity][]
  source_ts: z.string().optional(),
});

export type LBankDepthEvent = z.infer<typeof LBankDepthEventSchema>;

// ============================================================================
// Uniswap Quote Result Schema
// Per architecture.md: effective_price_usdt, estimated_gas, route
// ============================================================================
export const UniswapQuoteResultSchema = z.object({
  type: z.literal('uniswap.quote'),
  pair: z.string(), // e.g., "CSR/USDT"
  chain_id: z.number(),
  ts: z.string(),
  amount_in: z.string(),
  amount_in_unit: z.string(),
  amount_out: z.string(),
  amount_out_unit: z.string(),
  effective_price_usdt: z.number(),
  estimated_gas: z.number(),
  route: z.object({
    summary: z.string(),
  }).optional(),
  is_stale: z.boolean().optional(),
});

export type UniswapQuoteResult = z.infer<typeof UniswapQuoteResultSchema>;

// ============================================================================
// Strategy Decision Event Schema (DRY-RUN ONLY)
// ============================================================================
export const StrategyDecisionSchema = z.object({
  type: z.literal('strategy.decision'),
  ts: z.string(),
  symbol: z.string(),
  lbank_bid: z.number(),
  lbank_ask: z.number(),
  uniswap_price: z.number(),
  raw_spread_bps: z.number(), // Basis points
  estimated_cost_bps: z.number(), // LP fee + gas + buffer
  edge_after_costs_bps: z.number(),
  would_trade: z.boolean(),
  direction: z.enum(['buy_cex_sell_dex', 'buy_dex_sell_cex', 'none']),
  suggested_size_usdt: z.number(),
  reason: z.string(),
});

export type StrategyDecision = z.infer<typeof StrategyDecisionSchema>;

// ============================================================================
// Health Status Schema
// Per architecture.md: last_message_ts, reconnect_count, errors_last_5m
// ============================================================================
export const HealthStatusSchema = z.object({
  service: z.string(),
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  ts: z.string(),
  last_message_ts: z.string().nullable(),
  reconnect_count: z.number(),
  errors_last_5m: z.number(),
  details: z.record(z.unknown()).optional(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

// ============================================================================
// WebSocket Message Wrapper (for internal broadcast)
// ============================================================================
export const WsMessageSchema = z.discriminatedUnion('type', [
  LBankTickerEventSchema,
  LBankDepthEventSchema,
  UniswapQuoteResultSchema,
  StrategyDecisionSchema,
]);

export type WsMessage = z.infer<typeof WsMessageSchema>;

// ============================================================================
// Raw LBank WebSocket Message Schemas (for validation)
// ASSUMPTION: Based on LBank docs, ticker format uses 'tick' wrapper
// Marked as experimental - validate against live messages
// ============================================================================
export const RawLBankTickerSchema = z.object({
  tick: z.object({
    latest: z.string(),
    high: z.string(),
    low: z.string(),
    vol: z.string(),
    change: z.string(),
    turnover: z.string().optional(),
  }).optional(),
  pair: z.string().optional(),
  TS: z.string().optional(),
  type: z.string().optional(),
});

export const RawLBankDepthSchema = z.object({
  depth: z.object({
    bids: z.array(z.tuple([z.string(), z.string()])),
    asks: z.array(z.tuple([z.string(), z.string()])),
  }).optional(),
  pair: z.string().optional(),
  TS: z.string().optional(),
  type: z.string().optional(),
});
