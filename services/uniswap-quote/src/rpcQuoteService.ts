import { ethers } from "ethers";

/**
 * RPC-Based Quote Service
 * Uses direct RPC calls to Uniswap contracts for execution-accurate quotes
 * No API key required - read-only quoting via Ankr
 */

type LogFn = (
  level: string,
  event: string,
  data?: Record<string, unknown>
) => void;

// Token addresses (verified from Uniswap URLs)
const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CSR_ADDRESS = "0x75Ecb52e403C617679FBd3e77A50f9d10A842387";
const CSR25_ADDRESS = "0x502E7230E142A332DFEd1095F7174834b2548982";

// Uniswap V3 QuoterV2 contract
const QUOTER_V2_ADDRESS = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";

// Uniswap V2 Router for V2 pools
const UNISWAP_V2_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";

// Uniswap V2 Factory
const UNISWAP_V2_FACTORY = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";

// V3 fee tiers to try: 1% (10000), 0.3% (3000), 0.05% (500), 0.01% (100)
const V3_FEE_TIERS = [10000, 3000, 500, 100];

export interface QuoteResult {
  amountIn: string;
  amountInUnit: string;
  amountOut: string;
  amountOutUnit: string;
  effectivePrice: number;
  estimatedGas: number;
  gasCostUsd: number;
  gasCostEth: string;
  minAmountOut: string;
  slippageBps: number;
  priceImpactPercent: number;
  route: string;
  source: string;
  error?: string;
}

export interface MultiSizeQuote {
  token: "CSR" | "CSR25";
  quotes: QuoteResult[];
  timestamp: string;
}

export class RpcQuoteService {
  private readonly provider: ethers.providers.JsonRpcProvider;
  private readonly onLog: LogFn;
  private ethPriceUsd: number = 3500;

  constructor(rpcUrl: string, onLog: LogFn) {
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    this.onLog = onLog;
    
    // Fetch ETH price periodically
    this.updateEthPrice();
    setInterval(() => this.updateEthPrice(), 60000);
  }

  private async updateEthPrice(): Promise<void> {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      const data = await response.json();
      if (data.ethereum?.usd) {
        this.ethPriceUsd = data.ethereum.usd;
        this.onLog("debug", "eth_price_updated", { price: this.ethPriceUsd });
      }
    } catch {
      // Keep existing price on error
    }
  }

  /**
   * Get quotes for multiple sizes for a token
   */
  async getMultiSizeQuotes(
    token: "CSR" | "CSR25",
    sizes: number[] = [50, 100, 250, 500, 1000]
  ): Promise<MultiSizeQuote> {
    const quotes: QuoteResult[] = [];
    
    for (const size of sizes) {
      const quote = await this.getQuote(token, size);
      quotes.push(quote);
    }

    return {
      token,
      quotes,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get a single quote for buying tokens with USDT
   */
  async getQuote(
    token: "CSR" | "CSR25",
    amountUsdt: number,
    slippageBps: number = 50
  ): Promise<QuoteResult> {
    const tokenAddress = token === "CSR" ? CSR_ADDRESS : CSR25_ADDRESS;
    
    // Try different quoting methods in order of preference
    
    // 1. Try V3 QuoterV2 with different fee tiers
    const v3Quote = await this.tryV3Quote(tokenAddress, amountUsdt, slippageBps);
    if (v3Quote && !v3Quote.error) {
      return v3Quote;
    }

    // 2. Try V3 with WETH hop (USDT -> WETH -> TOKEN)
    const v3HopQuote = await this.tryV3WithWethHop(tokenAddress, amountUsdt, slippageBps);
    if (v3HopQuote && !v3HopQuote.error) {
      return v3HopQuote;
    }

    // 3. Try V2 Router
    const v2Quote = await this.tryV2Quote(tokenAddress, amountUsdt, slippageBps);
    if (v2Quote && !v2Quote.error) {
      return v2Quote;
    }

    // All RPC methods failed - try scraper fallback
    const scraperResult = await this.tryScraperFallback(token, amountUsdt, slippageBps);
    if (scraperResult && !scraperResult.error) {
      return scraperResult;
    }

    // All methods failed
    return {
      amountIn: amountUsdt.toString(),
      amountInUnit: "USDT",
      amountOut: "0",
      amountOutUnit: token,
      effectivePrice: 0,
      estimatedGas: 0,
      gasCostUsd: 0,
      gasCostEth: "0",
      minAmountOut: "0",
      slippageBps,
      priceImpactPercent: 0,
      route: "none",
      source: "rpc_failed",
      error: "No liquidity found in V2 or V3 pools",
    };
  }

  /**
   * Try to get price from the Puppeteer scraper service
   */
  private async tryScraperFallback(
    token: "CSR" | "CSR25",
    amountUsdt: number,
    slippageBps: number
  ): Promise<QuoteResult | null> {
    try {
      const scraperUrl = process.env.SCRAPER_URL || "http://localhost:3010";
      const response = await fetch(`${scraperUrl}/price/${token}`);
      
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      if (data.isStale || data.error || data.price <= 0) {
        this.onLog("warn", "scraper_data_stale", { token, data });
        return null;
      }

      // Calculate amounts based on scraped price
      const tokensOut = amountUsdt / data.price;
      const minAmountOut = tokensOut * (1 - slippageBps / 10000);

      this.onLog("info", "scraper_quote_success", {
        token,
        price: data.price,
        source: data.source,
      });

      return {
        amountIn: amountUsdt.toString(),
        amountInUnit: "USDT",
        amountOut: tokensOut.toFixed(6),
        amountOutUnit: token,
        effectivePrice: data.price,
        estimatedGas: 150000,
        gasCostUsd: data.gasUsd || 0.02,
        gasCostEth: ((data.gasUsd || 0.02) / this.ethPriceUsd).toFixed(6),
        minAmountOut: minAmountOut.toFixed(6),
        slippageBps,
        priceImpactPercent: data.priceImpact || -0.34,
        route: data.route || "Uniswap UI",
        source: "ui_scrape", // Clearly labeled
      };
    } catch (error) {
      this.onLog("debug", "scraper_fallback_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Try V3 QuoterV2 with different fee tiers
   */
  private async tryV3Quote(
    tokenAddress: string,
    amountUsdt: number,
    slippageBps: number
  ): Promise<QuoteResult | null> {
    const quoterAbi = [
      "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
    ];

    const quoter = new ethers.Contract(
      QUOTER_V2_ADDRESS,
      quoterAbi,
      this.provider
    );

    // USDT has 6 decimals
    const amountInWei = ethers.utils.parseUnits(amountUsdt.toString(), 6);

    for (const fee of V3_FEE_TIERS) {
      try {
        const params = {
          tokenIn: USDT_ADDRESS,
          tokenOut: tokenAddress,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0,
        };

        this.onLog("debug", "v3_quote_attempt", {
          tokenOut: tokenAddress,
          amountUsdt,
          fee,
        });

        const result = await quoter.callStatic.quoteExactInputSingle(params);
        const amountOut = result.amountOut || result[0];
        const gasEstimate = result.gasEstimate || result[3] || 150000;

        // Token has 18 decimals
        const amountOutFormatted = parseFloat(
          ethers.utils.formatUnits(amountOut, 18)
        );

        if (amountOutFormatted <= 0) continue;

        // Calculate effective price
        const effectivePrice = amountUsdt / amountOutFormatted;

        // Calculate gas cost
        const gasPrice = await this.provider.getGasPrice();
        const gasCostWei = gasPrice.mul(gasEstimate);
        const gasCostEth = parseFloat(ethers.utils.formatEther(gasCostWei));
        const gasCostUsd = gasCostEth * this.ethPriceUsd;

        // Calculate min amount out with slippage
        const minAmountOut = amountOutFormatted * (1 - slippageBps / 10000);

        this.onLog("info", "v3_quote_success", {
          tokenOut: tokenAddress,
          amountUsdt,
          amountOut: amountOutFormatted,
          effectivePrice,
          fee: fee / 10000,
          gasEstimate: gasEstimate.toString(),
        });

        return {
          amountIn: amountUsdt.toString(),
          amountInUnit: "USDT",
          amountOut: amountOutFormatted.toFixed(6),
          amountOutUnit: tokenAddress === CSR_ADDRESS ? "CSR" : "CSR25",
          effectivePrice,
          estimatedGas: gasEstimate.toNumber ? gasEstimate.toNumber() : Number(gasEstimate),
          gasCostUsd,
          gasCostEth: gasCostEth.toFixed(6),
          minAmountOut: minAmountOut.toFixed(6),
          slippageBps,
          priceImpactPercent: -0.34, // Estimated for small trades
          route: `V3 ${fee / 10000}% pool`,
          source: "quoter_v2",
        };
      } catch (error) {
        this.onLog("debug", "v3_quote_fee_failed", {
          fee,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    return null;
  }

  /**
   * Try V3 with WETH hop (USDT -> WETH -> TOKEN)
   */
  private async tryV3WithWethHop(
    tokenAddress: string,
    amountUsdt: number,
    slippageBps: number
  ): Promise<QuoteResult | null> {
    const quoterAbi = [
      "function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)",
    ];

    const quoter = new ethers.Contract(
      QUOTER_V2_ADDRESS,
      quoterAbi,
      this.provider
    );

    const amountInWei = ethers.utils.parseUnits(amountUsdt.toString(), 6);

    // Try USDT -> WETH -> TOKEN with different fee combinations
    const feeComboList = [
      [500, 3000],   // 0.05% USDT/WETH, 0.3% WETH/TOKEN
      [3000, 3000],  // 0.3% USDT/WETH, 0.3% WETH/TOKEN
      [500, 10000],  // 0.05% USDT/WETH, 1% WETH/TOKEN
      [3000, 10000], // 0.3% USDT/WETH, 1% WETH/TOKEN
    ];

    for (const [fee1, fee2] of feeComboList) {
      try {
        // Encode path: USDT -> WETH -> TOKEN
        const path = ethers.utils.solidityPack(
          ["address", "uint24", "address", "uint24", "address"],
          [USDT_ADDRESS, fee1, WETH_ADDRESS, fee2, tokenAddress]
        );

        this.onLog("debug", "v3_hop_quote_attempt", {
          tokenOut: tokenAddress,
          amountUsdt,
          fees: [fee1, fee2],
        });

        const result = await quoter.callStatic.quoteExactInput(path, amountInWei);
        const amountOut = result.amountOut || result[0];
        const gasEstimate = result.gasEstimate || result[3] || 200000;

        const amountOutFormatted = parseFloat(
          ethers.utils.formatUnits(amountOut, 18)
        );

        if (amountOutFormatted <= 0) continue;

        const effectivePrice = amountUsdt / amountOutFormatted;

        const gasPrice = await this.provider.getGasPrice();
        const gasCostWei = gasPrice.mul(gasEstimate);
        const gasCostEth = parseFloat(ethers.utils.formatEther(gasCostWei));
        const gasCostUsd = gasCostEth * this.ethPriceUsd;

        const minAmountOut = amountOutFormatted * (1 - slippageBps / 10000);

        this.onLog("info", "v3_hop_quote_success", {
          tokenOut: tokenAddress,
          amountUsdt,
          amountOut: amountOutFormatted,
          effectivePrice,
          fees: [fee1, fee2],
        });

        return {
          amountIn: amountUsdt.toString(),
          amountInUnit: "USDT",
          amountOut: amountOutFormatted.toFixed(6),
          amountOutUnit: tokenAddress === CSR_ADDRESS ? "CSR" : "CSR25",
          effectivePrice,
          estimatedGas: gasEstimate.toNumber ? gasEstimate.toNumber() : Number(gasEstimate),
          gasCostUsd,
          gasCostEth: gasCostEth.toFixed(6),
          minAmountOut: minAmountOut.toFixed(6),
          slippageBps,
          priceImpactPercent: -0.5, // Higher for multi-hop
          route: `V3 USDT→WETH→${tokenAddress === CSR_ADDRESS ? "CSR" : "CSR25"}`,
          source: "quoter_v2_hop",
        };
      } catch (error) {
        this.onLog("debug", "v3_hop_quote_failed", {
          fees: [fee1, fee2],
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    return null;
  }

  /**
   * Try V2 Router for legacy pools
   */
  private async tryV2Quote(
    tokenAddress: string,
    amountUsdt: number,
    slippageBps: number
  ): Promise<QuoteResult | null> {
    const routerAbi = [
      "function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] memory amounts)",
    ];

    const router = new ethers.Contract(
      UNISWAP_V2_ROUTER,
      routerAbi,
      this.provider
    );

    const amountInWei = ethers.utils.parseUnits(amountUsdt.toString(), 6);

    // Try direct path first
    const paths = [
      [USDT_ADDRESS, tokenAddress],
      [USDT_ADDRESS, WETH_ADDRESS, tokenAddress],
    ];

    for (const path of paths) {
      try {
        this.onLog("debug", "v2_quote_attempt", {
          tokenOut: tokenAddress,
          amountUsdt,
          path,
        });

        const amounts = await router.getAmountsOut(amountInWei, path);
        const amountOut = amounts[amounts.length - 1];

        const amountOutFormatted = parseFloat(
          ethers.utils.formatUnits(amountOut, 18)
        );

        if (amountOutFormatted <= 0) continue;

        const effectivePrice = amountUsdt / amountOutFormatted;

        // V2 swaps typically use ~150k gas for single hop, ~250k for multi
        const gasEstimate = path.length === 2 ? 150000 : 250000;
        const gasPrice = await this.provider.getGasPrice();
        const gasCostWei = gasPrice.mul(gasEstimate);
        const gasCostEth = parseFloat(ethers.utils.formatEther(gasCostWei));
        const gasCostUsd = gasCostEth * this.ethPriceUsd;

        const minAmountOut = amountOutFormatted * (1 - slippageBps / 10000);

        this.onLog("info", "v2_quote_success", {
          tokenOut: tokenAddress,
          amountUsdt,
          amountOut: amountOutFormatted,
          effectivePrice,
          path,
        });

        return {
          amountIn: amountUsdt.toString(),
          amountInUnit: "USDT",
          amountOut: amountOutFormatted.toFixed(6),
          amountOutUnit: tokenAddress === CSR_ADDRESS ? "CSR" : "CSR25",
          effectivePrice,
          estimatedGas: gasEstimate,
          gasCostUsd,
          gasCostEth: gasCostEth.toFixed(6),
          minAmountOut: minAmountOut.toFixed(6),
          slippageBps,
          priceImpactPercent: -0.3,
          route: `V2 ${path.length === 2 ? "direct" : "via WETH"}`,
          source: "v2_router",
        };
      } catch (error) {
        this.onLog("debug", "v2_quote_failed", {
          path,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
    }

    return null;
  }

  /**
   * Get quote for 1 token (for price display)
   */
  async getTokenPrice(token: "CSR" | "CSR25"): Promise<QuoteResult> {
    // To get price of 1 token, we need to quote selling 1 token for USDT
    const tokenAddress = token === "CSR" ? CSR_ADDRESS : CSR25_ADDRESS;
    
    // Try V3 first
    const v3Price = await this.tryV3SellQuote(tokenAddress, 1);
    if (v3Price && !v3Price.error) {
      return v3Price;
    }

    // Try V2
    const v2Price = await this.tryV2SellQuote(tokenAddress, 1);
    if (v2Price && !v2Price.error) {
      return v2Price;
    }

    return {
      amountIn: "1",
      amountInUnit: token,
      amountOut: "0",
      amountOutUnit: "USDT",
      effectivePrice: 0,
      estimatedGas: 0,
      gasCostUsd: 0,
      gasCostEth: "0",
      minAmountOut: "0",
      slippageBps: 50,
      priceImpactPercent: 0,
      route: "none",
      source: "rpc_failed",
      error: "No liquidity found",
    };
  }

  /**
   * Try V3 sell quote (TOKEN -> USDT)
   */
  private async tryV3SellQuote(
    tokenAddress: string,
    amountTokens: number
  ): Promise<QuoteResult | null> {
    const quoterAbi = [
      "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
    ];

    const quoter = new ethers.Contract(
      QUOTER_V2_ADDRESS,
      quoterAbi,
      this.provider
    );

    const amountInWei = ethers.utils.parseUnits(amountTokens.toString(), 18);

    for (const fee of V3_FEE_TIERS) {
      try {
        const params = {
          tokenIn: tokenAddress,
          tokenOut: USDT_ADDRESS,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0,
        };

        const result = await quoter.callStatic.quoteExactInputSingle(params);
        const amountOut = result.amountOut || result[0];
        const gasEstimate = result.gasEstimate || result[3] || 150000;

        // USDT has 6 decimals
        const amountOutFormatted = parseFloat(
          ethers.utils.formatUnits(amountOut, 6)
        );

        if (amountOutFormatted <= 0) continue;

        // Effective price = USDT received / tokens sold
        const effectivePrice = amountOutFormatted / amountTokens;

        const gasPrice = await this.provider.getGasPrice();
        const gasCostWei = gasPrice.mul(gasEstimate);
        const gasCostEth = parseFloat(ethers.utils.formatEther(gasCostWei));
        const gasCostUsd = gasCostEth * this.ethPriceUsd;

        const token = tokenAddress === CSR_ADDRESS ? "CSR" : "CSR25";

        this.onLog("info", "v3_sell_quote_success", {
          token,
          amountTokens,
          amountOutUsdt: amountOutFormatted,
          effectivePrice,
          fee: fee / 10000,
        });

        return {
          amountIn: amountTokens.toString(),
          amountInUnit: token,
          amountOut: amountOutFormatted.toFixed(6),
          amountOutUnit: "USDT",
          effectivePrice,
          estimatedGas: gasEstimate.toNumber ? gasEstimate.toNumber() : Number(gasEstimate),
          gasCostUsd,
          gasCostEth: gasCostEth.toFixed(6),
          minAmountOut: (amountOutFormatted * 0.995).toFixed(6),
          slippageBps: 50,
          priceImpactPercent: -0.34,
          route: `V3 ${fee / 10000}% pool`,
          source: "quoter_v2",
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Try V2 sell quote (TOKEN -> USDT)
   */
  private async tryV2SellQuote(
    tokenAddress: string,
    amountTokens: number
  ): Promise<QuoteResult | null> {
    const routerAbi = [
      "function getAmountsOut(uint amountIn, address[] path) external view returns (uint[] memory amounts)",
    ];

    const router = new ethers.Contract(
      UNISWAP_V2_ROUTER,
      routerAbi,
      this.provider
    );

    const amountInWei = ethers.utils.parseUnits(amountTokens.toString(), 18);

    const paths = [
      [tokenAddress, USDT_ADDRESS],
      [tokenAddress, WETH_ADDRESS, USDT_ADDRESS],
    ];

    for (const path of paths) {
      try {
        const amounts = await router.getAmountsOut(amountInWei, path);
        const amountOut = amounts[amounts.length - 1];

        // USDT has 6 decimals
        const amountOutFormatted = parseFloat(
          ethers.utils.formatUnits(amountOut, 6)
        );

        if (amountOutFormatted <= 0) continue;

        const effectivePrice = amountOutFormatted / amountTokens;

        const gasEstimate = path.length === 2 ? 150000 : 250000;
        const gasPrice = await this.provider.getGasPrice();
        const gasCostWei = gasPrice.mul(gasEstimate);
        const gasCostEth = parseFloat(ethers.utils.formatEther(gasCostWei));
        const gasCostUsd = gasCostEth * this.ethPriceUsd;

        const token = tokenAddress === CSR_ADDRESS ? "CSR" : "CSR25";

        this.onLog("info", "v2_sell_quote_success", {
          token,
          amountTokens,
          amountOutUsdt: amountOutFormatted,
          effectivePrice,
          path,
        });

        return {
          amountIn: amountTokens.toString(),
          amountInUnit: token,
          amountOut: amountOutFormatted.toFixed(6),
          amountOutUnit: "USDT",
          effectivePrice,
          estimatedGas: gasEstimate,
          gasCostUsd,
          gasCostEth: gasCostEth.toFixed(6),
          minAmountOut: (amountOutFormatted * 0.995).toFixed(6),
          slippageBps: 50,
          priceImpactPercent: -0.3,
          route: `V2 ${path.length === 2 ? "direct" : "via WETH"}`,
          source: "v2_router",
        };
      } catch {
        continue;
      }
    }

    return null;
  }
}
