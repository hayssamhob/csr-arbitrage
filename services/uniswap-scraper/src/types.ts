/**
 * Type definitions for the Uniswap UI Scraper
 */

export type TokenSymbol = "CSR" | "CSR25";

export interface QuoteData {
  market: string;
  inputToken: string;
  outputToken: string;
  amountInUSDT: number;
  amountOutToken: string;
  effectivePriceUsdtPerToken: number;
  gasEstimateUsdt: number;
  route: string;
  ts: number;
  valid: boolean;
  reason?: string;
}

export interface ScraperOutput {
  source: "ui_scrape";
  chainId: number;
  quotes: QuoteData[];
  meta: {
    scrapeMs: number;
    browser: string;
    errorsLast5m: number;
    lastSuccessTs: number | null;
    consecutiveFailures: number;
  };
}

export interface ScrapeError {
  type: "selector_missing" | "timeout" | "navigation_failed" | "ui_changed" | "rate_limited" | "browser_error" | "unknown";
  message: string;
  timestamp: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFn = (level: LogLevel, event: string, data?: Record<string, unknown>) => void;
