import { z } from 'zod';

const ConfigSchema = z.object({
  HTTP_PORT: z.coerce.number().int().positive().default(3007),
  
  // DEX Wallet
  DEX_WALLET_ADDRESS: z.string().optional().default(''),
  RPC_URL: z.string().url().default('https://mainnet.base.org'),
  
  // Token addresses
  CSR_TOKEN_ADDRESS: z.string().optional().default(''),
  CSR25_TOKEN_ADDRESS: z.string().optional().default(''),
  USDT_TOKEN_ADDRESS: z.string().optional().default(''),
  
  // CEX API Keys (optional - for balance reading)
  LBANK_API_KEY: z.string().optional().default(''),
  LBANK_API_SECRET: z.string().optional().default(''),
  LATOKEN_API_KEY: z.string().optional().default(''),
  LATOKEN_API_SECRET: z.string().optional().default(''),
  
  // Polling
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(): Config {
  return ConfigSchema.parse({
    HTTP_PORT: process.env.HTTP_PORT,
    DEX_WALLET_ADDRESS: process.env.DEX_WALLET_ADDRESS,
    RPC_URL: process.env.RPC_URL,
    CSR_TOKEN_ADDRESS: process.env.CSR_TOKEN_ADDRESS,
    CSR25_TOKEN_ADDRESS: process.env.CSR25_TOKEN_ADDRESS,
    USDT_TOKEN_ADDRESS: process.env.USDT_TOKEN_ADDRESS,
    LBANK_API_KEY: process.env.LBANK_API_KEY,
    LBANK_API_SECRET: process.env.LBANK_API_SECRET,
    LATOKEN_API_KEY: process.env.LATOKEN_API_KEY,
    LATOKEN_API_SECRET: process.env.LATOKEN_API_SECRET,
    POLL_INTERVAL_MS: process.env.POLL_INTERVAL_MS,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });
}
