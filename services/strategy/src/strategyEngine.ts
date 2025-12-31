import { Config } from './config';
import {
  CexTickerEvent,
  LBankTickerEvent,
  LatokenTickerEvent,
  StrategyDecision,
  UniswapQuoteResult,
} from "./schemas";

// ============================================================================
// Strategy Engine
// DRY-RUN ONLY: Computes edge after costs and logs decisions
// Per architecture.md: never executes trades in MVP
// Supports multiple markets: CSR/USDT and CSR25/USDT
// ============================================================================

type LogFn = (
  level: string,
  event: string,
  data?: Record<string, unknown>
) => void;

export interface SingleMarketState {
  lbankTicker: LBankTickerEvent | null;
  latokenTicker: LatokenTickerEvent | null;
  uniswapQuote: UniswapQuoteResult | null;
  lastLbankUpdate: string | null;
  lastLatokenUpdate: string | null;
  lastUniswapUpdate: string | null;
  decision: StrategyDecision | null;
}

export interface MarketState {
  csr_usdt: SingleMarketState;
  csr25_usdt: SingleMarketState;
}

export class StrategyEngine {
  private readonly config: Config;
  private readonly onLog: LogFn;
  private readonly onDecision: (decision: StrategyDecision) => void;
  private readonly symbols: string[];

  private state: MarketState = {
    csr_usdt: {
      lbankTicker: null,
      latokenTicker: null,
      uniswapQuote: null,
      lastLbankUpdate: null,
      lastLatokenUpdate: null,
      lastUniswapUpdate: null,
      decision: null,
    },
    csr25_usdt: {
      lbankTicker: null,
      latokenTicker: null,
      uniswapQuote: null,
      lastLbankUpdate: null,
      lastLatokenUpdate: null,
      lastUniswapUpdate: null,
      decision: null,
    },
  };

  constructor(
    config: Config,
    onLog: LogFn,
    onDecision: (decision: StrategyDecision) => void
  ) {
    this.config = config;
    this.onLog = onLog;
    this.onDecision = onDecision;
    this.symbols = config.SYMBOLS.split(",").map((s) => s.trim().toLowerCase());
  }

  // Update LBank ticker data
  updateLBankTicker(ticker: LBankTickerEvent): void {
    const symbol = ticker.symbol.toLowerCase();

    // Check if this is a symbol we're tracking
    if (!this.symbols.includes(symbol)) {
      return;
    }

    // Update the appropriate market state
    const marketKey = symbol as keyof MarketState;
    if (this.state[marketKey]) {
      this.state[marketKey].lbankTicker = ticker;
      this.state[marketKey].lastLbankUpdate = new Date().toISOString();

      this.onLog("debug", "lbank_ticker_updated", {
        symbol: ticker.symbol,
        bid: ticker.bid,
        ask: ticker.ask,
      });

      // Evaluate strategy for this market
      this.evaluateMarket(marketKey);
    }
  }

  // Update Latoken ticker data
  updateLatokenTicker(ticker: LatokenTickerEvent): void {
    const symbol = ticker.symbol.toLowerCase();

    // Check if this is a symbol we're tracking
    if (!this.symbols.includes(symbol)) {
      return;
    }

    // Update the appropriate market state
    const marketKey = symbol as keyof MarketState;
    if (this.state[marketKey]) {
      this.state[marketKey].latokenTicker = ticker;
      this.state[marketKey].lastLatokenUpdate = new Date().toISOString();

      this.onLog("debug", "latoken_ticker_updated", {
        symbol: ticker.symbol,
        bid: ticker.bid,
        ask: ticker.ask,
      });

      // Evaluate strategy for this market
      this.evaluateMarket(marketKey);
    }
  }

  // Update Uniswap quote data
  updateUniswapQuote(quote: UniswapQuoteResult, symbol: string): void {
    const marketKey = symbol.toLowerCase() as keyof MarketState;

    if (this.state[marketKey]) {
      this.state[marketKey].uniswapQuote = quote;
      this.state[marketKey].lastUniswapUpdate = new Date().toISOString();

      this.onLog("debug", "uniswap_quote_updated", {
        symbol,
        pair: quote.pair,
        effectivePrice: quote.effective_price_usdt,
        isStale: quote.is_stale,
      });

      // Evaluate strategy for this market
      this.evaluateMarket(marketKey);
    }
  }

  // Get current market state (for health endpoint)
  getState(): MarketState {
    return JSON.parse(JSON.stringify(this.state));
  }

  // Get best available CEX ticker (LBank or Latoken)
  getBestCexTicker(marketKey: keyof MarketState): CexTickerEvent | null {
    const market = this.state[marketKey];

    // Prefer LBank if available and fresh
    if (market.lbankTicker && market.lastLbankUpdate) {
      const age = Date.now() - new Date(market.lastLbankUpdate).getTime();
      if (age < this.config.MAX_STALENESS_SECONDS * 1000) {
        return market.lbankTicker;
      }
    }

    // Fall back to Latoken
    if (market.latokenTicker && market.lastLatokenUpdate) {
      const age = Date.now() - new Date(market.lastLatokenUpdate).getTime();
      if (age < this.config.MAX_STALENESS_SECONDS * 1000) {
        return market.latokenTicker;
      }
    }

    return null;
  }

  // Check if market data is stale
  isMarketDataStale(marketKey: keyof MarketState): boolean {
    const now = Date.now();
    const maxStaleMs = this.config.MAX_STALENESS_SECONDS * 1000;
    const market = this.state[marketKey];

    // Need at least one CEX source and Uniswap
    const hasCex = market.lastLbankUpdate || market.lastLatokenUpdate;
    if (!hasCex || !market.lastUniswapUpdate) {
      return true;
    }

    // Check CEX staleness (use freshest available)
    let cexAge = Infinity;
    if (market.lastLbankUpdate) {
      cexAge = Math.min(
        cexAge,
        now - new Date(market.lastLbankUpdate).getTime()
      );
    }
    if (market.lastLatokenUpdate) {
      cexAge = Math.min(
        cexAge,
        now - new Date(market.lastLatokenUpdate).getTime()
      );
    }

    const uniswapAge = now - new Date(market.lastUniswapUpdate).getTime();

    return cexAge > maxStaleMs || uniswapAge > maxStaleMs;
  }

  // Main evaluation logic for a specific market
  private evaluateMarket(marketKey: keyof MarketState): void {
    const market = this.state[marketKey];
    const { uniswapQuote } = market;

    // Get best available CEX ticker (LBank or Latoken)
    const cexTicker = this.getBestCexTicker(marketKey);

    // Need both data sources
    if (!cexTicker || !uniswapQuote) {
      this.onLog("debug", "evaluation_skipped", {
        market: marketKey,
        reason: "incomplete_data",
        hasCex: !!cexTicker,
        hasUniswap: !!uniswapQuote,
      });
      return;
    }

    // Check for stale data
    if (this.isMarketDataStale(marketKey)) {
      this.onLog("warn", "evaluation_skipped", {
        market: marketKey,
        reason: "stale_data",
      });
      return;
    }

    // Check for quote errors
    if (uniswapQuote.error) {
      this.onLog("warn", "evaluation_skipped", {
        market: marketKey,
        reason: "quote_error",
        error: uniswapQuote.error,
      });
      return;
    }

    // Check if quote is validated
    if (uniswapQuote.validated === false) {
      this.onLog("warn", "strategy.skipped", {
        market: marketKey,
        reason: "invalid_or_unvalidated_quote",
      });
      return;
    }

    // Check if quote is from real data source
    if (!uniswapQuote.source?.startsWith("uniswap_v4")) {
      this.onLog("warn", "strategy.skipped", {
        market: marketKey,
        reason: "non_real_or_invalid_uniswap_quote",
        source: uniswapQuote.source,
      });
      return;
    }

    // Calculate spreads and edge
    const decision = this.calculateDecision(cexTicker, uniswapQuote);

    // Store decision in state
    this.state[marketKey].decision = decision;

    // Log and emit decision
    this.onLog("info", "strategy_decision", {
      market: marketKey,
      would_trade: decision.would_trade,
      direction: decision.direction,
      edge_bps: decision.edge_after_costs_bps,
      reason: decision.reason,
    });

    this.onDecision(decision);
  }

  // Calculate RealTimeEdge using live V4 data (tick, lp_fee_bps)
  calculateRealTimeEdge(
    cexPrice: number,
    dexPrice: number,
    lpFeeBps: number,
    gasCostUsdt: number,
    tradeSizeUsdt: number
  ): {
    edgeBps: number;
    netProfitUsdt: number;
    breakdown: Record<string, number>;
  } {
    // Raw spread in basis points
    const rawSpreadBps = ((cexPrice - dexPrice) / dexPrice) * 10000;

    // Use actual LP fee from V4 pool (e.g., 3000 = 0.3%)
    const actualLpFeeBps = lpFeeBps / 10; // Convert from bps*10 to bps

    // Gas cost as percentage of trade
    const gasCostBps = (gasCostUsdt / tradeSizeUsdt) * 10000;

    // CEX fee (typically 0.1%)
    const cexFeeBps = this.config.CEX_TRADING_FEE_BPS;

    // Slippage estimate (based on size)
    const slippageBps = Math.min((tradeSizeUsdt / 1000) * 5, 50); // 5bps per $1000, max 50bps

    // Total costs
    const totalCostBps = actualLpFeeBps + gasCostBps + cexFeeBps + slippageBps;

    // Net edge after all costs
    const edgeBps = rawSpreadBps - totalCostBps;

    // Net profit in USDT
    const netProfitUsdt = (edgeBps / 10000) * tradeSizeUsdt;

    return {
      edgeBps: Math.round(edgeBps * 100) / 100,
      netProfitUsdt: Math.round(netProfitUsdt * 100) / 100,
      breakdown: {
        raw_spread_bps: Math.round(rawSpreadBps * 100) / 100,
        lp_fee_bps: actualLpFeeBps,
        gas_cost_bps: Math.round(gasCostBps * 100) / 100,
        cex_fee_bps: cexFeeBps,
        slippage_bps: Math.round(slippageBps * 100) / 100,
        total_cost_bps: Math.round(totalCostBps * 100) / 100,
      },
    };
  }

  private calculateDecision(
    ticker: CexTickerEvent,
    quote: UniswapQuoteResult
  ): StrategyDecision {
    const now = new Date().toISOString();
    const uniswapPrice = quote.effective_price_usdt;
    const cexBid = ticker.bid;
    const cexAsk = ticker.ask;
    const cexSource = ticker.type === "lbank.ticker" ? "lbank" : "latoken";

    // Use real LP fee from V4 quote if available (in bps * 10, e.g., 3000 = 0.3%)
    const realLpFeeBps = quote.lp_fee_bps
      ? quote.lp_fee_bps / 10
      : this.config.DEX_LP_FEE_BPS;

    // Calculate spreads in basis points
    // Scenario 1: Buy on CEX (at ask), sell on DEX
    const spreadBuyCexSellDex = ((uniswapPrice - cexAsk) / cexAsk) * 10000;

    // Scenario 2: Buy on DEX, sell on CEX (at bid)
    const spreadBuyDexSellCex =
      ((cexBid - uniswapPrice) / uniswapPrice) * 10000;

    // Determine best direction
    let rawSpreadBps: number;
    let direction: StrategyDecision["direction"];

    if (spreadBuyCexSellDex > spreadBuyDexSellCex && spreadBuyCexSellDex > 0) {
      rawSpreadBps = spreadBuyCexSellDex;
      direction = "buy_cex_sell_dex";
    } else if (spreadBuyDexSellCex > 0) {
      rawSpreadBps = spreadBuyDexSellCex;
      direction = "buy_dex_sell_cex";
    } else {
      rawSpreadBps = Math.max(spreadBuyCexSellDex, spreadBuyDexSellCex);
      direction = "none";
    }

    // Calculate detailed costs using real V4 data
    // 1. CEX trading fee (one side of the trade)
    const cexFeeBps = this.config.CEX_TRADING_FEE_BPS;

    // 2. DEX LP fee - use real fee from V4 quote
    const dexFeeBps = realLpFeeBps;

    // 3. Gas cost - use real-time from quote if available, else config default
    const realTimeGasCostUsdt =
      quote.gas_cost_usdt ?? this.config.GAS_COST_USDT;
    const gasCostBps =
      (realTimeGasCostUsdt / this.config.QUOTE_SIZE_USDT) * 10000;

    // 4. Rebalance cost (optional, off by default for Pattern C inventory arbitrage)
    const rebalanceBps = this.config.INCLUDE_REBALANCE_COST
      ? this.config.REBALANCE_COST_BPS
      : 0;

    // 5. Slippage buffer
    const slippageBps = this.config.SLIPPAGE_BUFFER_BPS;

    // Total estimated cost (Pattern C: no per-trade network fees)
    const estimatedCostBps =
      cexFeeBps + dexFeeBps + gasCostBps + rebalanceBps + slippageBps;

    // Cost breakdown for transparency (includes real V4 data)
    const costBreakdown = {
      cex_fee_bps: Math.round(cexFeeBps * 100) / 100,
      dex_lp_fee_bps: Math.round(dexFeeBps * 100) / 100,
      gas_cost_bps: Math.round(gasCostBps * 100) / 100,
      rebalance_bps: Math.round(rebalanceBps * 100) / 100,
      slippage_bps: Math.round(slippageBps * 100) / 100,
      v4_tick: quote.tick || null,
      v4_lp_fee_raw: quote.lp_fee_bps || null,
    };
    const edgeAfterCostsBps = rawSpreadBps - estimatedCostBps;

    // Determine if we would trade
    const wouldTrade =
      edgeAfterCostsBps >= this.config.MIN_EDGE_BPS && direction !== "none";

    // Calculate suggested size (bounded by max)
    let suggestedSize = 0;
    if (wouldTrade) {
      suggestedSize = Math.min(
        this.config.QUOTE_SIZE_USDT,
        this.config.MAX_TRADE_SIZE_USDT
      );
    }

    // Build reason string
    let reason: string;
    if (direction === "none") {
      reason = "No positive spread opportunity";
    } else if (!wouldTrade) {
      reason = `Edge ${edgeAfterCostsBps.toFixed(1)}bps below threshold ${
        this.config.MIN_EDGE_BPS
      }bps`;
    } else {
      reason = `Edge ${edgeAfterCostsBps.toFixed(
        1
      )}bps exceeds threshold, direction: ${direction}`;
    }

    return {
      type: "strategy.decision",
      ts: now,
      symbol: ticker.symbol,
      lbank_bid: cexBid,
      lbank_ask: cexAsk,
      uniswap_price: uniswapPrice,
      raw_spread_bps: Math.round(rawSpreadBps * 100) / 100,
      estimated_cost_bps: Math.round(estimatedCostBps * 100) / 100,
      cost_breakdown: costBreakdown,
      edge_after_costs_bps: Math.round(edgeAfterCostsBps * 100) / 100,
      would_trade: wouldTrade,
      direction,
      suggested_size_usdt: suggestedSize,
      reason,
    };
  }
}
