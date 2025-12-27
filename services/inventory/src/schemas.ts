import { z } from 'zod';

// ============================================================================
// Inventory Service Schemas
// Unified balance tracking for CEX and DEX
// ============================================================================

export const TokenBalanceSchema = z.object({
  token: z.string(),
  symbol: z.string(),
  balance: z.string(),
  balance_usdt: z.number().optional(),
  decimals: z.number(),
  last_updated: z.string(),
});

export type TokenBalance = z.infer<typeof TokenBalanceSchema>;

export const VenueBalancesSchema = z.object({
  venue: z.enum(['lbank', 'latoken', 'dex_wallet']),
  status: z.enum(['ok', 'error', 'unavailable']),
  error: z.string().optional(),
  balances: z.array(TokenBalanceSchema),
  last_updated: z.string(),
});

export type VenueBalances = z.infer<typeof VenueBalancesSchema>;

export const InventoryStateSchema = z.object({
  ts: z.string(),
  venues: z.array(VenueBalancesSchema),
  summary: z.object({
    total_usdt_value: z.number().optional(),
    csr_total: z.string().optional(),
    csr25_total: z.string().optional(),
    usdt_total: z.string().optional(),
  }),
});

export type InventoryState = z.infer<typeof InventoryStateSchema>;

export const MaxExecutableSizeSchema = z.object({
  market: z.string(),
  direction: z.enum(['buy_cex_sell_dex', 'buy_dex_sell_cex']),
  max_size_usdt: z.number(),
  limiting_factor: z.string(),
  warnings: z.array(z.string()),
});

export type MaxExecutableSize = z.infer<typeof MaxExecutableSizeSchema>;
