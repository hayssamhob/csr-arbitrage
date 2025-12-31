import { z } from 'zod';

// ============================================================================
// Event Bus Topic Names
// ============================================================================
export const TOPICS = {
  MARKET_DATA: 'market.data',
  STRATEGY_DECISIONS: 'strategy.decisions',
  EXECUTION_REQUESTS: 'execution.requests',
  SYSTEM_EVENTS: 'system.events',
} as const;

// ============================================================================
// 1. Market Data Events (The Source of Truth)
// ============================================================================

export const MarketTickSchema = z.object({
  type: z.literal('market.tick'),
  eventId: z.string(), // UUID v4
  symbol: z.string(), // Normalized "CSR/USDT"
  venue: z.string(), // "lbank" | "uniswap_v3" | "uniswap_v4"
  ts: z.number(), // Unix timestamp (ms)
  bid: z.number().optional(),
  ask: z.number().optional(),
  last: z.number().optional(),
  price: z.number().optional(), // For DEX quotes
  volume: z.number().optional(),
  sourceTs: z.number().optional(), // Exchange timestamp
  meta: z.record(z.unknown()).optional(), // Any venue specific metadata
});

export type MarketTick = z.infer<typeof MarketTickSchema>;

// ============================================================================
// 2. Strategy Signals (The Brain)
// ============================================================================

export const TradeDirectionSchema = z.enum(['BUY_CEX_SELL_DEX', 'BUY_DEX_SELL_CEX']);

export const StrategySignalSchema = z.object({
  type: z.literal('strategy.signal'),
  signalId: z.string(), // UUID v4
  ts: z.number(),
  tokenIn: z.string(),
  tokenOut: z.string(),
  direction: TradeDirectionSchema,
  
  // Pricing at signal time
  cexPrice: z.number(),
  dexPrice: z.number(),
  estimatedEdgeBps: z.number(),
  
  // Execution params
  sizeAmount: z.string(), // BigInt string
  minAcceptableEdgeBps: z.number(),
});

export type StrategySignal = z.infer<typeof StrategySignalSchema>;

// ============================================================================
// 3. Execution Events (The Action)
// ============================================================================

export const ExecutionRequestSchema = z.object({
  type: z.literal('execution.request'),
  requestId: z.string(),
  signalId: z.string(), // Link back to signal
  strategy: z.string(), // Name of strategy requesting
  
  // V4 specific checks
  flashAccountingRequired: z.boolean().default(true),
  deadline: z.number().optional(),
});

export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

// ============================================================================
// Universal Bus Message
// ============================================================================
export const BusMessageSchema = z.discriminatedUnion('type', [
  MarketTickSchema,
  StrategySignalSchema,
  ExecutionRequestSchema,
]);

export type BusMessage = z.infer<typeof BusMessageSchema>;

