/**
 * Type definitions for the Uniswap UI Scraper
 */

export type TokenSymbol = "CSR" | "CSR25";

export interface QuoteData {
  market: string;
  inputToken: string;
  outputToken: string;

  // Raw and parsed amounts
  amountInUSDT: number;
  amountInRaw: string;
  amountOutToken: number;
  amountOutRaw: string;

  // Price calculations
  price_usdt_per_token: number; // USDT needed to buy 1 token
  price_token_per_usdt: number; // tokens received per 1 USDT
  usdt_for_1_token: number; // alias for price_usdt_per_token (UI convenience)

  // Gas (null if unavailable, NOT 0)
  gasEstimateUsdt: number | null;
  gasRaw: string | null;

  route: string;
  ts: number;
  scrapeMs: number;
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
