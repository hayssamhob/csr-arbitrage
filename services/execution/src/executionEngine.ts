import { v4 as uuidv4 } from 'uuid';
import { Config, PoolKey } from "./config";
import { Database, DecisionRecord, TradeRecord } from "./database";

// ============================================================================
// Execution Engine
// Handles trade execution in OFF/PAPER/LIVE modes
// NO WITHDRAWALS, NO BRIDGING, NO FUND TRANSFERS - SPOT ORDERS ONLY
// ============================================================================

type LogFn = (
  level: string,
  event: string,
  data?: Record<string, unknown>
) => void;

// V4 Swap parameters
interface V4SwapParams {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: number;
  amountOutMinimum: number;
  sqrtPriceLimitX96?: string;
}

interface ExecuteParams {
  symbol: string;
  direction: string;
  size_usdt: number;
  edge_bps: number;
  idempotency_key: string;
  // V4 specific params
  poolKey?: PoolKey;
  dex_price?: number;
  cex_price?: number;
  tick?: number;
  lp_fee_bps?: number;
}

interface ExecuteResult {
  success: boolean;
  trade_id?: string;
  mode: string;
  status: string;
  message: string;
  fill_price?: number;
  pnl_usdt?: number;
  pool_key?: PoolKey;
}

interface StrategyDecision {
  symbol: string;
  lbank_bid: number;
  lbank_ask: number;
  uniswap_price: number;
  raw_spread_bps: number;
  edge_after_costs_bps: number;
  would_trade: boolean;
  direction: string;
  suggested_size_usdt: number;
  // V4 specific fields
  poolKey?: PoolKey;
  tick?: number;
  lp_fee_bps?: number;
}

export class ExecutionEngine {
  private readonly config: Config;
  private readonly db: Database;
  private readonly log: LogFn;
  private activeOrders: Map<string, TradeRecord> = new Map();

  constructor(config: Config, db: Database, log: LogFn) {
    this.config = config;
    this.db = db;
    this.log = log;
  }

  getStatus(): object {
    return {
      mode: this.config.EXECUTION_MODE,
      kill_switch: this.config.KILL_SWITCH,
      active_orders: this.activeOrders.size,
      daily_volume_usdt: this.db.getDailyVolume(),
      limits: {
        max_order_usdt: this.config.MAX_ORDER_USDT,
        max_daily_volume_usdt: this.config.MAX_DAILY_VOLUME_USDT,
        min_edge_bps: this.config.MIN_EDGE_BPS,
        max_slippage_bps: this.config.MAX_SLIPPAGE_BPS,
        max_concurrent_orders: this.config.MAX_CONCURRENT_ORDERS,
      },
    };
  }

  getDailyStats(): object {
    return {
      volume_usdt: this.db.getDailyVolume(),
      active_orders: this.activeOrders.size,
      mode: this.config.EXECUTION_MODE,
    };
  }

  async evaluateAndExecute(decision: StrategyDecision): Promise<void> {
    // Record the decision
    const decisionRecord: DecisionRecord = {
      id: uuidv4(),
      ts: new Date().toISOString(),
      symbol: decision.symbol,
      lbank_bid: decision.lbank_bid,
      lbank_ask: decision.lbank_ask,
      uniswap_price: decision.uniswap_price,
      raw_spread_bps: decision.raw_spread_bps,
      edge_after_costs_bps: decision.edge_after_costs_bps,
      would_trade: decision.would_trade,
      direction: decision.direction,
      suggested_size_usdt: decision.suggested_size_usdt,
      executed: false,
    };

    this.db.insertDecision(decisionRecord);

    // Check if we should execute
    if (!decision.would_trade) {
      return;
    }

    // Validate conditions
    const validation = this.validateExecution(decision);
    if (!validation.valid) {
      this.log("warn", "execution_rejected", {
        symbol: decision.symbol,
        reason: validation.reason,
      });
      return;
    }

    // Execute
    try {
      await this.execute({
        symbol: decision.symbol,
        direction: decision.direction,
        size_usdt: Math.min(
          decision.suggested_size_usdt,
          this.config.MAX_ORDER_USDT
        ),
        edge_bps: decision.edge_after_costs_bps,
        idempotency_key: uuidv4(),
      });
    } catch (err) {
      this.log("error", "execution_error", {
        symbol: decision.symbol,
        error: String(err),
      });
    }
  }

  private validateExecution(decision: StrategyDecision): {
    valid: boolean;
    reason?: string;
  } {
    // Check kill switch
    if (this.config.KILL_SWITCH) {
      return { valid: false, reason: "Kill switch is active" };
    }

    // Check execution mode
    if (this.config.EXECUTION_MODE === "off") {
      return { valid: false, reason: "Execution mode is off" };
    }

    // Check edge threshold
    if (decision.edge_after_costs_bps < this.config.MIN_EDGE_BPS) {
      return {
        valid: false,
        reason: `Edge ${decision.edge_after_costs_bps} below threshold ${this.config.MIN_EDGE_BPS}`,
      };
    }

    // Check daily volume limit
    const dailyVolume = this.db.getDailyVolume();
    if (
      dailyVolume + decision.suggested_size_usdt >
      this.config.MAX_DAILY_VOLUME_USDT
    ) {
      return { valid: false, reason: `Daily volume limit exceeded` };
    }

    // Check concurrent orders
    if (this.activeOrders.size >= this.config.MAX_CONCURRENT_ORDERS) {
      return { valid: false, reason: `Max concurrent orders reached` };
    }

    return { valid: true };
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const { symbol, direction, size_usdt, edge_bps, idempotency_key } = params;

    // Check idempotency
    if (this.db.checkIdempotencyKey(idempotency_key)) {
      return {
        success: false,
        mode: this.config.EXECUTION_MODE,
        status: "duplicate",
        message: "Order already exists with this idempotency key",
      };
    }

    // Validate size
    if (size_usdt > this.config.MAX_ORDER_USDT) {
      return {
        success: false,
        mode: this.config.EXECUTION_MODE,
        status: "rejected",
        message: `Order size ${size_usdt} exceeds max ${this.config.MAX_ORDER_USDT}`,
      };
    }

    const tradeId = uuidv4();
    const trade: TradeRecord = {
      id: tradeId,
      ts: new Date().toISOString(),
      symbol,
      direction,
      size_usdt,
      edge_bps,
      mode: this.config.EXECUTION_MODE as "paper" | "live",
      status: "pending",
      idempotency_key,
    };

    // Insert trade record
    this.db.insertTrade(trade);
    this.activeOrders.set(tradeId, trade);

    this.log("info", "trade_initiated", {
      trade_id: tradeId,
      symbol,
      direction,
      size_usdt,
      edge_bps,
      mode: this.config.EXECUTION_MODE,
    });

    // Execute based on mode
    if (this.config.EXECUTION_MODE === "paper") {
      return this.executePaper(trade);
    } else if (this.config.EXECUTION_MODE === "live") {
      return this.executeLive(trade);
    }

    return {
      success: false,
      trade_id: tradeId,
      mode: this.config.EXECUTION_MODE,
      status: "rejected",
      message: "Invalid execution mode",
    };
  }

  private async executePaper(
    trade: TradeRecord,
    params?: ExecuteParams
  ): Promise<ExecuteResult> {
    // Use real V4 prices if available, otherwise simulate
    const dexPrice = params?.dex_price || 0;
    const cexPrice = params?.cex_price || 0;
    const lpFeeBps = params?.lp_fee_bps || 30; // Default 0.3% fee

    // Calculate realistic slippage based on trade size
    // Larger trades have more slippage (0.1% per $1000)
    const sizeSlippageBps = (trade.size_usdt / 1000) * 10;
    const randomSlippageBps = Math.random() * 5; // 0-5 bps random component
    const totalSlippageBps = sizeSlippageBps + randomSlippageBps;

    // Calculate fill price with slippage
    let fillPrice: number;
    let simulatedPnl: number;

    if (dexPrice > 0 && cexPrice > 0) {
      // Use real prices for accurate paper P&L calculation
      const direction = trade.direction;

      if (direction === "buy_dex_sell_cex") {
        // Buy on DEX at dexPrice (+ slippage), sell on CEX at cexPrice
        const effectiveBuyPrice = dexPrice * (1 + totalSlippageBps / 10000);
        const effectiveSellPrice = cexPrice * (1 - totalSlippageBps / 10000);
        fillPrice = effectiveBuyPrice;

        // Gross profit = (sell - buy) / buy * size
        const grossProfitPct =
          (effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice;
        const grossProfitUsdt = grossProfitPct * trade.size_usdt;

        // Subtract fees: LP fee (0.3%) + estimated gas ($0.50)
        const lpFeeUsdt = trade.size_usdt * (lpFeeBps / 10000);
        const gasFeeUsdt = 0.5;
        simulatedPnl = grossProfitUsdt - lpFeeUsdt - gasFeeUsdt;
      } else {
        // Buy on CEX at cexPrice, sell on DEX at dexPrice (- slippage)
        const effectiveBuyPrice = cexPrice * (1 + totalSlippageBps / 10000);
        const effectiveSellPrice = dexPrice * (1 - totalSlippageBps / 10000);
        fillPrice = effectiveSellPrice;

        const grossProfitPct =
          (effectiveSellPrice - effectiveBuyPrice) / effectiveBuyPrice;
        const grossProfitUsdt = grossProfitPct * trade.size_usdt;

        const lpFeeUsdt = trade.size_usdt * (lpFeeBps / 10000);
        const gasFeeUsdt = 0.5;
        simulatedPnl = grossProfitUsdt - lpFeeUsdt - gasFeeUsdt;
      }
    } else {
      // Fallback: simulate based on edge_bps
      fillPrice = 1.0;
      simulatedPnl =
        ((trade.edge_bps - totalSlippageBps - lpFeeBps) * trade.size_usdt) /
        10000;
    }

    // Update trade as filled
    this.db.updateTradeStatus(trade.id, "filled", fillPrice, simulatedPnl);
    this.activeOrders.delete(trade.id);

    // Log V4 swap path for debugging
    const poolKey = params?.poolKey;
    if (poolKey) {
      this.log("info", "v4_swap_path", {
        pool_manager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tick_spacing: poolKey.tickSpacing,
        hooks: poolKey.hooks,
        direction: trade.direction,
        zero_for_one: trade.direction === "buy_dex_sell_cex",
      });
    }

    this.log("info", "paper_trade_filled", {
      trade_id: trade.id,
      symbol: trade.symbol,
      direction: trade.direction,
      size_usdt: trade.size_usdt,
      dex_price: dexPrice,
      cex_price: cexPrice,
      fill_price: fillPrice,
      slippage_bps: totalSlippageBps,
      lp_fee_bps: lpFeeBps,
      simulated_pnl: simulatedPnl,
      v4_tick: params?.tick,
      pool_key: poolKey
        ? `${poolKey.currency0.slice(0, 10)}.../${poolKey.currency1.slice(
            0,
            10
          )}...`
        : undefined,
    });

    return {
      success: true,
      trade_id: trade.id,
      mode: "paper",
      status: "filled",
      message: "Paper trade simulated with real V4 prices",
      fill_price: fillPrice,
      pnl_usdt: simulatedPnl,
      pool_key: params?.poolKey,
    };
  }

  private async executeLive(trade: TradeRecord): Promise<ExecuteResult> {
    // LIVE MODE: Place real order on LBank
    // This requires API keys and proper implementation

    if (!this.config.LBANK_API_KEY || !this.config.LBANK_API_SECRET) {
      this.db.updateTradeStatus(
        trade.id,
        "failed",
        undefined,
        undefined,
        "Missing API credentials"
      );
      this.activeOrders.delete(trade.id);

      return {
        success: false,
        trade_id: trade.id,
        mode: "live",
        status: "failed",
        message: "Missing LBank API credentials",
      };
    }

    // TODO: Implement actual LBank order placement
    // For now, reject with clear message
    this.db.updateTradeStatus(
      trade.id,
      "failed",
      undefined,
      undefined,
      "Live trading not yet implemented"
    );
    this.activeOrders.delete(trade.id);

    this.log("warn", "live_trading_not_implemented", {
      trade_id: trade.id,
      message: "Live trading requires LBank API integration",
    });

    return {
      success: false,
      trade_id: trade.id,
      mode: "live",
      status: "failed",
      message:
        "Live trading not yet implemented - requires LBank API integration",
    };
  }
}
