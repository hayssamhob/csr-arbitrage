/**
 * DEX Price Alignment Types
 * 
 * Defines tolerance bands, alignment decisions, and cost/benefit analysis
 * for maintaining DEX price aligned with CEX price.
 */

export type BandStatus = "neutral" | "soft" | "hard";
export type AlignmentDirection = "buy_dex" | "sell_dex" | "none";
export type ExecutionMode = "off" | "paper" | "live";

export interface AlignmentBands {
  // Neutral band - no action needed (e.g., ±0.5%)
  neutralPercent: number;
  // Soft deviation band - optional action (e.g., ±0.5% to ±1.5%)
  softPercent: number;
  // Hard deviation band - action required (e.g., >±1.5%)
  hardPercent: number;
  // Target alignment margin (0-0.3%)
  alignmentMargin: number;
}

export interface AlignmentConfig {
  // Per-market configuration
  bands: AlignmentBands;
  // Max trade size in USDT
  maxTradeSizeUsdt: number;
  // Cooldown period in seconds after alignment trade
  cooldownSeconds: number;
  // Minimum benefit (bps) required to suggest trade
  minBenefitBps: number;
  // Execution mode
  mode: ExecutionMode;
}

export interface PriceComparison {
  // CEX executable price (bid when selling, ask when buying)
  cexPrice: number;
  cexSource: string;
  // DEX execution price for selected size
  dexPrice: number;
  dexSizeUsdt: number;
  // Deviation
  deviationPercent: number;
  deviationBps: number;
  // Band classification
  bandStatus: BandStatus;
}

export interface AlignmentCosts {
  // DEX LP fee (bps)
  dexFeeBps: number;
  // Estimated gas cost (USDT)
  gasUsdt: number | null;
  // Slippage estimate (bps)
  slippageBps: number;
  // Total cost (bps)
  totalCostBps: number;
}

export interface AlignmentBenefit {
  // Price gap reduction (bps)
  gapReductionBps: number;
  // Protection value - avoiding being arbitraged
  protectionValueBps: number;
  // Net benefit (benefit - cost)
  netBenefitBps: number;
}

export interface AlignmentSuggestion {
  // Should we suggest a trade?
  shouldTrade: boolean;
  // Direction
  direction: AlignmentDirection;
  // Suggested size
  suggestedSizeUsdt: number;
  suggestedSizeTokens: number;
  // Target price after trade
  targetPrice: number;
  // Expected post-trade DEX price
  expectedPostTradePrice: number;
  // Costs and benefits
  costs: AlignmentCosts;
  benefit: AlignmentBenefit;
  // Reason for decision
  reason: string;
  // Is trade blocked?
  blocked: boolean;
  blockReason?: string;
}

export interface CooldownState {
  // Last alignment trade timestamp
  lastTradeTs: number | null;
  // Last direction
  lastDirection: AlignmentDirection;
  // Last size
  lastSizeUsdt: number;
  // Is in cooldown?
  inCooldown: boolean;
  // Cooldown remaining (seconds)
  cooldownRemaining: number;
}

export interface InventoryState {
  // USDT balance on DEX wallet
  usdtBalance: number;
  // Token balance on DEX wallet
  tokenBalance: number;
  // Is USDT sufficient for suggested trade?
  usdtSufficient: boolean;
  // Is token balance sufficient for suggested trade?
  tokenSufficient: boolean;
  // Shortfall amount (if any)
  shortfallUsdt?: number;
  shortfallTokens?: number;
}

export interface AlignmentDecision {
  market: string;
  ts: number;
  // Price comparison
  prices: PriceComparison;
  // Suggestion
  suggestion: AlignmentSuggestion;
  // Cooldown state
  cooldown: CooldownState;
  // Inventory state (optional, may not be available)
  inventory?: InventoryState;
  // Config used
  config: AlignmentConfig;
}

// Default configurations
export const DEFAULT_CSR_CONFIG: AlignmentConfig = {
  bands: {
    neutralPercent: 0.5,
    softPercent: 1.5,
    hardPercent: 3.0,
    alignmentMargin: 0.2,
  },
  maxTradeSizeUsdt: 500,
  cooldownSeconds: 120, // 2 minutes
  minBenefitBps: 10,
  mode: "off",
};

export const DEFAULT_CSR25_CONFIG: AlignmentConfig = {
  bands: {
    neutralPercent: 0.5,
    softPercent: 1.5,
    hardPercent: 2.0,
    alignmentMargin: 0.2,
  },
  maxTradeSizeUsdt: 1000,
  cooldownSeconds: 120,
  minBenefitBps: 10,
  mode: "off",
};
