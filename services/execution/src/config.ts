import { z } from 'zod';

// ============================================================================
// Execution Service Configuration
// Supports OFF/PAPER/LIVE modes with strict safety controls
// ============================================================================

// Verified Uniswap V4 Contract Addresses (Ethereum Mainnet)
// Source: https://docs.uniswap.org/contracts/v4/deployments
export const UNISWAP_V4_ADDRESSES = {
  POOL_MANAGER: '0x000000000004444c5dc75cB358380D2e3dE08A90',
  STATE_VIEW: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
  QUOTER: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
  UNIVERSAL_ROUTER: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
  PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
};

// Token addresses for CSR/CSR25 pools
export const TOKEN_ADDRESSES = {
  CSR: '0x75Ecb52e403C617679FBd3e77A50f9d10A842387',
  CSR25: '0x502E7230E142A332DFEd1095F7174834b2548982',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
};

// V4 Pool parameters (discovered by quote service)
export interface PoolKey {
  currency0: string;
  currency1: string;
  fee: number;
  tickSpacing: number;
  hooks: string;
}

// Default pool configurations
export const DEFAULT_POOL_CONFIGS: Record<string, PoolKey> = {
  CSR_USDT: {
    currency0: TOKEN_ADDRESSES.CSR,
    currency1: TOKEN_ADDRESSES.USDT,
    fee: 3000,        // 0.3%
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000',
  },
  CSR25_USDT: {
    currency0: TOKEN_ADDRESSES.CSR25,
    currency1: TOKEN_ADDRESSES.USDT,
    fee: 3000,        // 0.3%
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000',
  },
};

const ConfigSchema = z.object({
  // Execution mode: off (monitoring), paper (simulate), live (real orders)
  EXECUTION_MODE: z.enum(['off', 'paper', 'live']).default('off'),

  // Kill switch - disables ALL execution when true
  KILL_SWITCH: z.preprocess(
    (val) => val === 'true' || val === true,
    z.boolean().default(true)
  ),

  // Risk Controls (mandatory)
  MAX_ORDER_USDT: z.coerce.number().positive().default(1000),
  MAX_DAILY_VOLUME_USDT: z.coerce.number().positive().default(10000),
  MIN_EDGE_BPS: z.coerce.number().min(0).default(50),
  MAX_SLIPPAGE_BPS: z.coerce.number().min(0).default(100),
  MAX_STALENESS_SECONDS: z.coerce.number().positive().default(30),
  MAX_CONCURRENT_ORDERS: z.coerce.number().int().positive().default(1),

  // Strategy Engine URL
  STRATEGY_ENGINE_URL: z.string().url().default('http://localhost:3003'),

  // LBank API credentials (required for live mode)
  LBANK_API_KEY: z.string().optional(),
  LBANK_API_SECRET: z.string().optional(),

  // HTTP port
  HTTP_PORT: z.coerce.number().int().positive().default(3004),

  // Database path
  DB_PATH: z.string().default('./data/execution.db'),

  // Log level
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  const rawConfig = {
    EXECUTION_MODE: process.env.EXECUTION_MODE,
    KILL_SWITCH: process.env.KILL_SWITCH,
    MAX_ORDER_USDT: process.env.MAX_ORDER_USDT,
    MAX_DAILY_VOLUME_USDT: process.env.MAX_DAILY_VOLUME_USDT,
    MIN_EDGE_BPS: process.env.MIN_EDGE_BPS,
    MAX_SLIPPAGE_BPS: process.env.MAX_SLIPPAGE_BPS,
    MAX_STALENESS_SECONDS: process.env.MAX_STALENESS_SECONDS,
    MAX_CONCURRENT_ORDERS: process.env.MAX_CONCURRENT_ORDERS,
    STRATEGY_ENGINE_URL: process.env.STRATEGY_ENGINE_URL,
    LBANK_API_KEY: process.env.LBANK_API_KEY,
    LBANK_API_SECRET: process.env.LBANK_API_SECRET,
    HTTP_PORT: process.env.HTTP_PORT,
    DB_PATH: process.env.DB_PATH,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  const result = ConfigSchema.safeParse(rawConfig);

  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}

export function validateLiveMode(config: Config): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.EXECUTION_MODE !== 'live') {
    return { valid: true, errors: [] };
  }

  // Live mode requires additional validation
  if (config.KILL_SWITCH) {
    errors.push('KILL_SWITCH must be false for live mode');
  }

  if (!config.LBANK_API_KEY) {
    errors.push('LBANK_API_KEY is required for live mode');
  }

  if (!config.LBANK_API_SECRET) {
    errors.push('LBANK_API_SECRET is required for live mode');
  }

  return { valid: errors.length === 0, errors };
}
