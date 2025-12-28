/**
 * DEX Price Alignment Solver
 * 
 * Computes alignment decisions based on CEX/DEX price comparison,
 * tolerance bands, costs, and benefits.
 */

import {
    AlignmentBenefit,
    AlignmentConfig,
    AlignmentCosts,
    AlignmentDecision,
    AlignmentDirection,
    AlignmentSuggestion,
    BandStatus,
    CooldownState,
    PriceComparison,
} from "./alignmentTypes";

// Quote ladder entry from scraper
interface QuoteLadderEntry {
  amountInUSDT: number;
  price_usdt_per_token: number;
  valid: boolean;
}

/**
 * Classify price deviation into band status
 */
export function classifyBand(
  deviationPercent: number,
  config: AlignmentConfig
): BandStatus {
  const absDeviation = Math.abs(deviationPercent);
  
  if (absDeviation <= config.bands.neutralPercent) {
    return "neutral";
  }
  if (absDeviation <= config.bands.softPercent) {
    return "soft";
  }
  return "hard";
}

/**
 * Compare CEX and DEX prices
 */
export function comparePrices(
  cexPrice: number,
  cexSource: string,
  dexPrice: number,
  dexSizeUsdt: number,
  config: AlignmentConfig
): PriceComparison {
  const deviationPercent = ((dexPrice - cexPrice) / cexPrice) * 100;
  const deviationBps = deviationPercent * 100;
  
  return {
    cexPrice,
    cexSource,
    dexPrice,
    dexSizeUsdt,
    deviationPercent,
    deviationBps,
    bandStatus: classifyBand(deviationPercent, config),
  };
}

/**
 * Estimate costs for an alignment trade
 */
export function estimateCosts(
  tradeSizeUsdt: number,
  gasUsdt: number | null,
  lpFeeBps: number = 30 // Default 0.3% Uniswap fee
): AlignmentCosts {
  // Slippage estimate based on size (rough heuristic)
  const slippageBps = Math.min(tradeSizeUsdt / 100, 50); // 1 bps per $100, max 50 bps
  
  // Gas cost in bps relative to trade size
  const gasCostBps = gasUsdt ? (gasUsdt / tradeSizeUsdt) * 10000 : 0;
  
  const totalCostBps = lpFeeBps + gasCostBps + slippageBps;
  
  return {
    dexFeeBps: lpFeeBps,
    gasUsdt,
    slippageBps,
    totalCostBps,
  };
}

/**
 * Estimate benefit of alignment trade
 */
export function estimateBenefit(
  currentDeviationBps: number,
  expectedPostDeviationBps: number,
  costs: AlignmentCosts
): AlignmentBenefit {
  // Gap reduction
  const gapReductionBps = Math.abs(currentDeviationBps) - Math.abs(expectedPostDeviationBps);
  
  // Protection value - avoiding being arbitraged by others
  // Rough heuristic: 50% of gap reduction as protection value
  const protectionValueBps = gapReductionBps * 0.5;
  
  // Net benefit
  const netBenefitBps = gapReductionBps + protectionValueBps - costs.totalCostBps;
  
  return {
    gapReductionBps,
    protectionValueBps,
    netBenefitBps,
  };
}

/**
 * Interpolate quote ladder to find size for target price
 */
export function interpolateQuoteLadder(
  ladder: QuoteLadderEntry[],
  targetPrice: number
): { size: number; achievable: boolean } {
  const validLadder = ladder.filter(e => e.valid).sort((a, b) => a.amountInUSDT - b.amountInUSDT);
  
  if (validLadder.length === 0) {
    return { size: 0, achievable: false };
  }
  
  // Find bracketing points
  for (let i = 0; i < validLadder.length - 1; i++) {
    const lower = validLadder[i];
    const upper = validLadder[i + 1];
    
    if (
      (lower.price_usdt_per_token <= targetPrice && targetPrice <= upper.price_usdt_per_token) ||
      (lower.price_usdt_per_token >= targetPrice && targetPrice >= upper.price_usdt_per_token)
    ) {
      // Linear interpolation
      const ratio = (targetPrice - lower.price_usdt_per_token) / 
                   (upper.price_usdt_per_token - lower.price_usdt_per_token);
      const size = lower.amountInUSDT + ratio * (upper.amountInUSDT - lower.amountInUSDT);
      return { size: Math.max(0, size), achievable: true };
    }
  }
  
  // Target not in range - use closest endpoint
  const first = validLadder[0];
  const last = validLadder[validLadder.length - 1];
  
  if (Math.abs(first.price_usdt_per_token - targetPrice) < Math.abs(last.price_usdt_per_token - targetPrice)) {
    return { size: first.amountInUSDT, achievable: false };
  }
  return { size: last.amountInUSDT, achievable: false };
}

/**
 * Check cooldown state
 */
export function checkCooldown(
  lastTradeTs: number | null,
  lastDirection: AlignmentDirection,
  lastSizeUsdt: number,
  cooldownSeconds: number
): CooldownState {
  if (!lastTradeTs) {
    return {
      lastTradeTs: null,
      lastDirection: "none",
      lastSizeUsdt: 0,
      inCooldown: false,
      cooldownRemaining: 0,
    };
  }
  
  const elapsed = (Date.now() - lastTradeTs) / 1000;
  const remaining = Math.max(0, cooldownSeconds - elapsed);
  
  return {
    lastTradeTs,
    lastDirection,
    lastSizeUsdt,
    inCooldown: remaining > 0,
    cooldownRemaining: remaining,
  };
}

/**
 * Compute alignment suggestion
 */
export function computeSuggestion(
  prices: PriceComparison,
  quoteLadder: QuoteLadderEntry[],
  gasUsdt: number | null,
  config: AlignmentConfig,
  cooldown: CooldownState
): AlignmentSuggestion {
  // Default no-trade suggestion
  const noTrade: AlignmentSuggestion = {
    shouldTrade: false,
    direction: "none",
    suggestedSizeUsdt: 0,
    suggestedSizeTokens: 0,
    targetPrice: prices.cexPrice,
    expectedPostTradePrice: prices.dexPrice,
    costs: estimateCosts(0, null),
    benefit: { gapReductionBps: 0, protectionValueBps: 0, netBenefitBps: 0 },
    reason: "",
    blocked: false,
  };
  
  // Check if in neutral band
  if (prices.bandStatus === "neutral") {
    return { ...noTrade, reason: "Price within neutral band - no action needed" };
  }
  
  // Check cooldown
  if (cooldown.inCooldown) {
    return {
      ...noTrade,
      reason: `In cooldown (${cooldown.cooldownRemaining.toFixed(0)}s remaining)`,
      blocked: true,
      blockReason: "cooldown",
    };
  }
  
  // Determine direction
  // DEX price > CEX price → sell on DEX (push DEX price down)
  // DEX price < CEX price → buy on DEX (push DEX price up)
  const direction: AlignmentDirection = prices.deviationPercent > 0 ? "sell_dex" : "buy_dex";
  
  // Calculate target price with margin
  const marginMultiplier = direction === "buy_dex" 
    ? (1 - config.bands.alignmentMargin / 100)
    : (1 + config.bands.alignmentMargin / 100);
  const targetPrice = prices.cexPrice * marginMultiplier;
  
  // Find required size from ladder
  const { size: requiredSize, achievable } = interpolateQuoteLadder(quoteLadder, targetPrice);
  
  // Clamp to max trade size
  const suggestedSizeUsdt = Math.min(requiredSize, config.maxTradeSizeUsdt);
  
  // Estimate post-trade price (simplified - use ladder)
  const closestLadderEntry = quoteLadder
    .filter(e => e.valid)
    .sort((a, b) => Math.abs(a.amountInUSDT - suggestedSizeUsdt) - Math.abs(b.amountInUSDT - suggestedSizeUsdt))[0];
  const expectedPostTradePrice = closestLadderEntry?.price_usdt_per_token || prices.dexPrice;
  
  // Calculate tokens
  const suggestedSizeTokens = suggestedSizeUsdt / expectedPostTradePrice;
  
  // Estimate costs
  const costs = estimateCosts(suggestedSizeUsdt, gasUsdt);
  
  // Estimate benefit
  const expectedPostDeviationBps = ((expectedPostTradePrice - prices.cexPrice) / prices.cexPrice) * 10000;
  const benefit = estimateBenefit(prices.deviationBps, expectedPostDeviationBps, costs);
  
  // Check if trade is economical
  if (benefit.netBenefitBps < config.minBenefitBps) {
    return {
      ...noTrade,
      direction,
      suggestedSizeUsdt,
      suggestedSizeTokens,
      targetPrice,
      expectedPostTradePrice,
      costs,
      benefit,
      reason: `Uneconomical: net benefit (${benefit.netBenefitBps.toFixed(1)} bps) < min required (${config.minBenefitBps} bps)`,
    };
  }
  
  // Soft band - optional
  if (prices.bandStatus === "soft") {
    return {
      shouldTrade: false, // Optional, not required
      direction,
      suggestedSizeUsdt,
      suggestedSizeTokens,
      targetPrice,
      expectedPostTradePrice,
      costs,
      benefit,
      reason: `Soft deviation - trade optional (${direction === "buy_dex" ? "BUY" : "SELL"} ${suggestedSizeUsdt.toFixed(0)} USDT)`,
      blocked: false,
    };
  }
  
  // Hard band - action required
  return {
    shouldTrade: true,
    direction,
    suggestedSizeUsdt,
    suggestedSizeTokens,
    targetPrice,
    expectedPostTradePrice,
    costs,
    benefit,
    reason: `Hard deviation - alignment recommended (${direction === "buy_dex" ? "BUY" : "SELL"} ${suggestedSizeUsdt.toFixed(0)} USDT)`,
    blocked: false,
  };
}

/**
 * Main alignment decision function
 */
export function computeAlignmentDecision(
  market: string,
  cexPrice: number,
  cexSource: string,
  quoteLadder: QuoteLadderEntry[],
  selectedSizeUsdt: number,
  gasUsdt: number | null,
  config: AlignmentConfig,
  lastTradeTs: number | null = null,
  lastDirection: AlignmentDirection = "none",
  lastSizeUsdt: number = 0
): AlignmentDecision {
  // Find DEX price for selected size
  const selectedQuote = quoteLadder.find(e => e.amountInUSDT === selectedSizeUsdt && e.valid);
  const dexPrice = selectedQuote?.price_usdt_per_token || 
    quoteLadder.filter(e => e.valid)[0]?.price_usdt_per_token || 0;
  
  // Compare prices
  const prices = comparePrices(cexPrice, cexSource, dexPrice, selectedSizeUsdt, config);
  
  // Check cooldown
  const cooldown = checkCooldown(lastTradeTs, lastDirection, lastSizeUsdt, config.cooldownSeconds);
  
  // Compute suggestion
  const suggestion = computeSuggestion(prices, quoteLadder, gasUsdt, config, cooldown);
  
  return {
    market,
    ts: Date.now(),
    prices,
    suggestion,
    cooldown,
    config,
  };
}
