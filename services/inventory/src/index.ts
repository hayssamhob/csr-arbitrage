import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { loadConfig } from './config';
import { InventoryState, VenueBalances, TokenBalance, MaxExecutableSize } from './schemas';

// ============================================================================
// Inventory Service
// Unified balance tracking for CEX and DEX wallets
// ============================================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const minLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;
  console.log(JSON.stringify({ level, service: 'inventory', event, ts: new Date().toISOString(), ...data }));
}

// ERC20 ABI for balance checking
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

class InventoryService {
  private config = loadConfig();
  private provider: ethers.JsonRpcProvider | null = null;
  private lastState: InventoryState | null = null;

  constructor() {
    if (this.config.RPC_URL) {
      this.provider = new ethers.JsonRpcProvider(this.config.RPC_URL);
    }
  }

  async fetchDexBalances(): Promise<VenueBalances> {
    const now = new Date().toISOString();
    
    if (!this.config.DEX_WALLET_ADDRESS || !this.provider) {
      return {
        venue: 'dex_wallet',
        status: 'unavailable',
        error: 'DEX wallet not configured',
        balances: [],
        last_updated: now,
      };
    }

    try {
      const balances: TokenBalance[] = [];
      
      // Fetch ETH balance
      const ethBalance = await this.provider.getBalance(this.config.DEX_WALLET_ADDRESS);
      balances.push({
        token: 'ETH',
        symbol: 'ETH',
        balance: ethers.formatEther(ethBalance),
        decimals: 18,
        last_updated: now,
      });

      // Fetch token balances if configured
      const tokens = [
        { address: this.config.CSR_TOKEN_ADDRESS, name: 'CSR' },
        { address: this.config.CSR25_TOKEN_ADDRESS, name: 'CSR25' },
        { address: this.config.USDT_TOKEN_ADDRESS, name: 'USDT' },
      ];

      for (const token of tokens) {
        if (token.address) {
          try {
            const contract = new ethers.Contract(token.address, ERC20_ABI, this.provider);
            const [balance, decimals, symbol] = await Promise.all([
              contract.balanceOf(this.config.DEX_WALLET_ADDRESS),
              contract.decimals(),
              contract.symbol(),
            ]);
            balances.push({
              token: token.address,
              symbol: symbol || token.name,
              balance: ethers.formatUnits(balance, decimals),
              decimals: Number(decimals),
              last_updated: now,
            });
          } catch (err) {
            log('warn', 'token_balance_error', { token: token.name, error: String(err) });
          }
        }
      }

      return {
        venue: 'dex_wallet',
        status: 'ok',
        balances,
        last_updated: now,
      };
    } catch (err) {
      return {
        venue: 'dex_wallet',
        status: 'error',
        error: String(err),
        balances: [],
        last_updated: now,
      };
    }
  }

  async fetchLBankBalances(): Promise<VenueBalances> {
    const now = new Date().toISOString();
    
    if (!this.config.LBANK_API_KEY || !this.config.LBANK_API_SECRET) {
      return {
        venue: 'lbank',
        status: 'unavailable',
        error: 'LBank API keys not configured',
        balances: [],
        last_updated: now,
      };
    }

    // TODO: Implement LBank balance fetching with signed API
    return {
      venue: 'lbank',
      status: 'unavailable',
      error: 'LBank balance fetching not yet implemented',
      balances: [],
      last_updated: now,
    };
  }

  async fetchLatokenBalances(): Promise<VenueBalances> {
    const now = new Date().toISOString();
    
    if (!this.config.LATOKEN_API_KEY || !this.config.LATOKEN_API_SECRET) {
      return {
        venue: 'latoken',
        status: 'unavailable',
        error: 'LATOKEN API keys not configured',
        balances: [],
        last_updated: now,
      };
    }

    // TODO: Implement LATOKEN balance fetching with signed API
    return {
      venue: 'latoken',
      status: 'unavailable',
      error: 'LATOKEN balance fetching not yet implemented',
      balances: [],
      last_updated: now,
    };
  }

  async getInventoryState(): Promise<InventoryState> {
    const [dex, lbank, latoken] = await Promise.all([
      this.fetchDexBalances(),
      this.fetchLBankBalances(),
      this.fetchLatokenBalances(),
    ]);

    const state: InventoryState = {
      ts: new Date().toISOString(),
      venues: [dex, lbank, latoken],
      summary: {
        total_usdt_value: undefined,
        csr_total: undefined,
        csr25_total: undefined,
        usdt_total: undefined,
      },
    };

    this.lastState = state;
    return state;
  }

  calculateMaxExecutableSize(market: string, direction: 'buy_cex_sell_dex' | 'buy_dex_sell_cex'): MaxExecutableSize {
    const warnings: string[] = [];
    let maxSize = 0;
    let limitingFactor = 'No inventory data';

    if (!this.lastState) {
      warnings.push('Inventory not yet loaded');
      return { market, direction, max_size_usdt: 0, limiting_factor: limitingFactor, warnings };
    }

    // Check venue availability
    const dex = this.lastState.venues.find(v => v.venue === 'dex_wallet');
    const cex = market === 'csr_usdt' 
      ? this.lastState.venues.find(v => v.venue === 'latoken')
      : this.lastState.venues.find(v => v.venue === 'lbank');

    if (!dex || dex.status !== 'ok') {
      warnings.push('DEX wallet balances unavailable');
    }
    if (!cex || cex.status !== 'ok') {
      warnings.push(`CEX (${market === 'csr_usdt' ? 'LATOKEN' : 'LBank'}) balances unavailable`);
    }

    // For now, return 0 with warnings until balances are configured
    return {
      market,
      direction,
      max_size_usdt: maxSize,
      limiting_factor: limitingFactor,
      warnings,
    };
  }
}

async function main() {
  log('info', 'starting', { version: '1.0.0' });

  const config = loadConfig();
  const service = new InventoryService();
  const app = express();

  app.use(cors());
  app.use(express.json());

  // Health endpoints
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'inventory', ts: new Date().toISOString() });
  });

  app.get('/ready', async (_req, res) => {
    const state = await service.getInventoryState();
    const okVenues = state.venues.filter(v => v.status === 'ok').length;
    res.json({
      status: okVenues > 0 ? 'ok' : 'degraded',
      venues_ok: okVenues,
      venues_total: state.venues.length,
    });
  });

  // Main inventory endpoint
  app.get('/api/inventory', async (_req, res) => {
    try {
      const state = await service.getInventoryState();
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Max executable size endpoint
  app.get('/api/max-size/:market/:direction', (req, res) => {
    const { market, direction } = req.params;
    if (!['buy_cex_sell_dex', 'buy_dex_sell_cex'].includes(direction)) {
      return res.status(400).json({ error: 'Invalid direction' });
    }
    const result = service.calculateMaxExecutableSize(
      market,
      direction as 'buy_cex_sell_dex' | 'buy_dex_sell_cex'
    );
    res.json(result);
  });

  app.listen(config.HTTP_PORT, () => {
    log('info', 'server_started', { port: config.HTTP_PORT });
  });
}

main().catch(err => {
  log('error', 'startup_failed', { error: String(err) });
  process.exit(1);
});
