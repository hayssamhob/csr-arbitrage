import { ethers } from "ethers";

// Uniswap Quote API Service - Gets real executable quotes with gas, price impact, slippage
// Uses the Uniswap Routing API for accurate swap quotes

type LogFn = (
  level: string,
  event: string,
  data?: Record<string, unknown>
) => void;

interface UniswapApiQuote {
  amountIn: string;
  amountOut: string;
  amountOutMin?: string;
  gasPriceWei: string;
  gasUseEstimate: string;
  gasUseEstimateUSD: string;
  priceImpact?: number;
  route: Array<{
    type: string;
    address: string;
    tokenIn: { address: string; symbol: string; decimals: number };
    tokenOut: { address: string; symbol: string; decimals: number };
    fee?: string;
    amountIn: string;
    amountOut: string;
  }>;
  routeString?: string;
  quoteId?: string;
}

interface QuoteResult {
  effectivePrice: number;
  amountIn: string;
  amountOut: string;
  gasEstimateUsd: number;
  gasEstimateEth: string;
  priceImpactPercent: number;
  poolFee: number;
  route: string;
  source: string;
}

export class UniswapQuoteApiService {
  private readonly rpcUrl: string;
  private readonly onLog: LogFn;
  private provider: ethers.providers.JsonRpcProvider;
  private ethPriceUsd: number = 3500; // Default ETH price, updated periodically

  // Token addresses (Ethereum mainnet)
  private readonly USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
  private readonly CSR_ADDRESS = "0x48a5b65EB671af0e2E65a492d4c436eee749b41d";
  private readonly CSR25_ADDRESS = "0x48d540e651FB7bBc797291b5414951faa653B497";

  constructor(rpcUrl: string, onLog: LogFn) {
    this.rpcUrl = rpcUrl;
    this.onLog = onLog;
    this.provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    
    // Update ETH price periodically
    this.updateEthPrice();
    setInterval(() => this.updateEthPrice(), 60000); // Every minute
  }

  private async updateEthPrice(): Promise<void> {
    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
      );
      if (response.ok) {
        const data = await response.json();
        this.ethPriceUsd = data.ethereum?.usd || 3500;
      }
    } catch {
      // Keep existing price on error
    }
  }

  async getQuote(
    tokenSymbol: "CSR" | "CSR25",
    amountUsdt: number,
    direction: "buy" | "sell"
  ): Promise<QuoteResult> {
    const tokenAddress = tokenSymbol === "CSR" ? this.CSR_ADDRESS : this.CSR25_ADDRESS;
    const tokenDecimals = 18;
    const usdtDecimals = 6;

    // For "buy" direction: USDT -> Token (user wants to buy token with USDT)
    // For "sell" direction: Token -> USDT (user wants to sell token for USDT)
    const tokenIn = direction === "buy" ? this.USDT_ADDRESS : tokenAddress;
    const tokenOut = direction === "buy" ? tokenAddress : this.USDT_ADDRESS;
    const decimalsIn = direction === "buy" ? usdtDecimals : tokenDecimals;

    // Calculate amount in wei
    const amountInWei = ethers.utils.parseUnits(amountUsdt.toString(), decimalsIn);

    try {
      // Try Uniswap Routing API first
      const quote = await this.fetchUniswapApiQuote(
        tokenIn,
        tokenOut,
        amountInWei.toString(),
        direction === "buy" ? usdtDecimals : tokenDecimals,
        direction === "buy" ? tokenDecimals : usdtDecimals
      );

      if (quote) {
        return this.formatQuoteResult(quote, tokenSymbol, amountUsdt, direction);
      }

      // Fallback to on-chain quote simulation
      return await this.getOnChainQuote(tokenSymbol, amountUsdt, direction);
    } catch (error) {
      this.onLog("error", "uniswap_quote_api_error", {
        error: error instanceof Error ? error.message : "Unknown error",
        tokenSymbol,
        amountUsdt,
        direction,
      });

      // Return fallback quote with estimated values
      return this.getFallbackQuote(tokenSymbol, amountUsdt, direction);
    }
  }

  private async fetchUniswapApiQuote(
    tokenIn: string,
    tokenOut: string,
    amount: string,
    decimalsIn: number,
    decimalsOut: number
  ): Promise<UniswapApiQuote | null> {
    try {
      // Uniswap Labs Routing API endpoint
      const response = await fetch("https://api.uniswap.org/v2/quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokenInChainId: 1,
          tokenOutChainId: 1,
          tokenIn,
          tokenOut,
          amount,
          type: "EXACT_INPUT",
          configs: [
            {
              routingType: "CLASSIC",
              protocols: ["V2", "V3", "V4"],
            },
          ],
          slippageTolerance: 0.5, // 0.5% slippage
        }),
      });

      if (!response.ok) {
        this.onLog("warn", "uniswap_api_response_not_ok", {
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const data = await response.json();
      
      if (data.quote) {
        return {
          amountIn: data.quote.amountIn || amount,
          amountOut: data.quote.amountOut || "0",
          gasPriceWei: data.quote.gasPriceWei || "0",
          gasUseEstimate: data.quote.gasUseEstimate || "150000",
          gasUseEstimateUSD: data.quote.gasUseEstimateUSD || "0.01",
          priceImpact: data.quote.priceImpact,
          route: data.quote.route || [],
          routeString: data.quote.routeString,
          quoteId: data.quote.quoteId,
        };
      }

      return null;
    } catch (error) {
      this.onLog("warn", "uniswap_api_fetch_error", {
        error: error instanceof Error ? error.message : "Unknown",
      });
      return null;
    }
  }

  private async getOnChainQuote(
    tokenSymbol: "CSR" | "CSR25",
    amountUsdt: number,
    direction: "buy" | "sell"
  ): Promise<QuoteResult> {
    // Quoter V2 contract address (Uniswap V3)
    const QUOTER_V2 = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
    
    const tokenAddress = tokenSymbol === "CSR" ? this.CSR_ADDRESS : this.CSR25_ADDRESS;
    const tokenDecimals = 18;
    const usdtDecimals = 6;

    const tokenIn = direction === "buy" ? this.USDT_ADDRESS : tokenAddress;
    const tokenOut = direction === "buy" ? tokenAddress : this.USDT_ADDRESS;
    const decimalsIn = direction === "buy" ? usdtDecimals : tokenDecimals;
    const decimalsOut = direction === "buy" ? tokenDecimals : usdtDecimals;

    const amountInWei = ethers.utils.parseUnits(amountUsdt.toString(), decimalsIn);

    // QuoterV2 ABI for quoteExactInputSingle
    const quoterAbi = [
      "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
    ];

    const quoter = new ethers.Contract(QUOTER_V2, quoterAbi, this.provider);

    // Try different fee tiers
    const feeTiers = [3000, 10000, 500, 100]; // 0.3%, 1%, 0.05%, 0.01%
    
    for (const fee of feeTiers) {
      try {
        const params = {
          tokenIn,
          tokenOut,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0,
        };

        const result = await quoter.callStatic.quoteExactInputSingle(params);
        const amountOut = result.amountOut || result[0];
        const gasEstimate = result.gasEstimate || result[3] || 150000;

        const amountOutFormatted = ethers.utils.formatUnits(amountOut, decimalsOut);
        
        // Calculate effective price
        let effectivePrice: number;
        if (direction === "buy") {
          // USDT -> Token: price = USDT spent / tokens received
          effectivePrice = amountUsdt / parseFloat(amountOutFormatted);
        } else {
          // Token -> USDT: price = USDT received / tokens sold
          effectivePrice = parseFloat(amountOutFormatted) / amountUsdt;
        }

        // Estimate gas cost in USD
        const gasPrice = await this.provider.getGasPrice();
        const gasCostWei = gasPrice.mul(gasEstimate);
        const gasCostEth = parseFloat(ethers.utils.formatEther(gasCostWei));
        const gasCostUsd = gasCostEth * this.ethPriceUsd;

        // Estimate price impact based on pool liquidity (simplified)
        const priceImpact = this.estimatePriceImpact(amountUsdt, fee);

        return {
          effectivePrice,
          amountIn: amountUsdt.toString(),
          amountOut: amountOutFormatted,
          gasEstimateUsd: gasCostUsd,
          gasEstimateEth: gasCostEth.toFixed(6),
          priceImpactPercent: priceImpact,
          poolFee: fee / 10000, // Convert to percentage
          route: `${tokenSymbol}/${fee === 3000 ? "0.3%" : fee === 10000 ? "1%" : fee === 500 ? "0.05%" : "0.01%"} Pool`,
          source: "quoter_v2",
        };
      } catch {
        // Try next fee tier
        continue;
      }
    }

    // If all fee tiers fail, return fallback
    return this.getFallbackQuote(tokenSymbol, amountUsdt, direction);
  }

  private formatQuoteResult(
    quote: UniswapApiQuote,
    tokenSymbol: "CSR" | "CSR25",
    amountUsdt: number,
    direction: "buy" | "sell"
  ): QuoteResult {
    const tokenDecimals = 18;
    const usdtDecimals = 6;
    const decimalsOut = direction === "buy" ? tokenDecimals : usdtDecimals;

    const amountOut = parseFloat(
      ethers.utils.formatUnits(quote.amountOut, decimalsOut)
    );

    let effectivePrice: number;
    if (direction === "buy") {
      effectivePrice = amountUsdt / amountOut;
    } else {
      effectivePrice = amountOut / amountUsdt;
    }

    const gasCostUsd = parseFloat(quote.gasUseEstimateUSD) || 0.01;
    const gasCostEth = (gasCostUsd / this.ethPriceUsd).toFixed(6);

    // Extract pool fee from route
    let poolFee = 0.3; // Default 0.3%
    if (quote.route && quote.route.length > 0) {
      const firstPool = quote.route[0];
      if (firstPool.fee) {
        poolFee = parseInt(firstPool.fee) / 10000;
      }
    }

    return {
      effectivePrice,
      amountIn: amountUsdt.toString(),
      amountOut: amountOut.toFixed(6),
      gasEstimateUsd: gasCostUsd,
      gasEstimateEth: gasCostEth,
      priceImpactPercent: quote.priceImpact || -0.5,
      poolFee,
      route: quote.routeString || "Uniswap API",
      source: "uniswap_api",
    };
  }

  private estimatePriceImpact(amountUsdt: number, feeTier: number): number {
    // Simplified price impact estimation based on trade size and liquidity
    // Larger trades = higher impact, lower fee tiers usually have more liquidity
    const baseImpact = (amountUsdt / 10000) * 0.5; // 0.5% per $10k
    const feeMultiplier = feeTier === 3000 ? 1 : feeTier === 10000 ? 1.5 : 0.8;
    return -(baseImpact * feeMultiplier); // Negative = slippage
  }

  private getFallbackQuote(
    tokenSymbol: "CSR" | "CSR25",
    amountUsdt: number,
    direction: "buy" | "sell"
  ): QuoteResult {
    // Use cached/estimated price as fallback
    const estimatedPrice = tokenSymbol === "CSR" ? 0.003 : 0.044;
    const amountOut = direction === "buy" 
      ? (amountUsdt / estimatedPrice).toFixed(6)
      : (amountUsdt * estimatedPrice).toFixed(6);

    return {
      effectivePrice: estimatedPrice,
      amountIn: amountUsdt.toString(),
      amountOut,
      gasEstimateUsd: 0.02,
      gasEstimateEth: "0.000006",
      priceImpactPercent: -0.5,
      poolFee: 0.3,
      route: "Estimated (API unavailable)",
      source: "fallback",
    };
  }
}
