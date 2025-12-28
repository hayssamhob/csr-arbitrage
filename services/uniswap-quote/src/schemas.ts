import { z } from 'zod';

// ============================================================================
// Uniswap Quote Service Schemas
// Per architecture.md: effective_price_usdt, estimated_gas, route
// ============================================================================

export const UniswapQuoteResultSchema = z.object({
  type: z.literal("uniswap.quote"),
  pair: z.string(), // e.g., "CSR/USDT"
  chain_id: z.number(),
  ts: z.string(), // ISO 8601
  amount_in: z.string(),
  amount_in_unit: z.string(),
  amount_out: z.string(),
  amount_out_unit: z.string(),
  effective_price_usdt: z.number(),
  estimated_gas: z.number(),
  pool_fee: z.number().optional(), // Pool fee in percentage (e.g., 0.3 for 0.3%)
  price_impact: z.number().optional(), // Price impact in percentage (negative = slippage)
  price_impact_percent: z.string().optional(), // Price impact as display string (e.g., "-1.26%")
  gas_cost_usdt: z.number().optional(), // Gas cost in USDT
  gas_cost_eth: z.string().optional(), // Gas cost in ETH
  max_slippage: z.string().optional(), // Max slippage setting (e.g., "Auto / 0.50%")
  order_routing: z.string().optional(), // Order routing info (e.g., "Uniswap API")
  fee_display: z.string().optional(), // Fee display (e.g., "Free" or "0.3%")
  route: z
    .object({
      summary: z.string(),
      pools: z.array(z.string()).optional(),
    })
    .optional(),
  is_stale: z.boolean().optional(),
  validated: z.boolean().optional(),
  source: z.string().optional(),
  error: z.string().optional(),
});

export type UniswapQuoteResult = z.infer<typeof UniswapQuoteResultSchema>;

// Quote request schema
export const QuoteRequestSchema = z.object({
  amount_usdt: z.number().positive(),
  direction: z.enum(['buy', 'sell']).default('buy'), // buy = USDT->token, sell = token->USDT
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

// Cached quote entry
export interface CachedQuote {
  quote: UniswapQuoteResult;
  cachedAt: number; // timestamp ms
}
