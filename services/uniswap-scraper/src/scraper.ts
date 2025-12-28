import puppeteer, { Browser, Page } from "puppeteer";

/**
 * Uniswap UI Scraper
 * 
 * Scrapes real prices from Uniswap UI for V4 pools
 * TEMPORARY FALLBACK - clearly labeled source="ui_scrape"
 */

type LogFn = (level: string, event: string, data?: Record<string, unknown>) => void;

// Uniswap swap URLs for each token
const SWAP_URLS = {
  CSR: "https://app.uniswap.org/swap?chain=mainnet&inputCurrency=0xdAC17F958D2ee523a2206206994597C13D831ec7&outputCurrency=0x75Ecb52e403C617679FBd3e77A50f9d10A842387",
  CSR25: "https://app.uniswap.org/swap?chain=mainnet&inputCurrency=0xdAC17F958D2ee523a2206206994597C13D831ec7&outputCurrency=0x502E7230E142A332DFEd1095F7174834b2548982",
};

export interface ScrapeResult {
  token: string;
  price: number;
  gasUsd: number;
  priceImpact: number;
  maxSlippage: string;
  route: string;
}

export class UniswapScraper {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private onLog: LogFn;

  constructor(onLog: LogFn) {
    this.onLog = onLog;
  }

  async initialize(): Promise<void> {
    this.onLog("info", "launching_browser");
    
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--window-size=1920x1080",
      ],
    });

    // Pre-load pages for each token
    for (const [token, url] of Object.entries(SWAP_URLS)) {
      const page = await this.browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
        this.pages.set(token, page);
        this.onLog("info", "page_loaded", { token, url });
      } catch (error) {
        this.onLog("error", "page_load_failed", {
          token,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async scrapePrice(token: "CSR" | "CSR25"): Promise<ScrapeResult> {
    const page = this.pages.get(token);
    
    if (!page) {
      throw new Error(`No page loaded for ${token}`);
    }

    try {
      // Enter amount "1" in the input field to get price for 1 USDT
      const inputSelector = 'input[data-testid="amount-input"]';
      await page.waitForSelector(inputSelector, { timeout: 5000 });
      
      // Clear and type "1"
      await page.click(inputSelector, { clickCount: 3 });
      await page.type(inputSelector, "1");

      // Wait for quote to load (look for output amount)
      await page.waitForTimeout(2000);

      // Extract the output amount (how many tokens for 1 USDT)
      const outputAmount = await page.evaluate(() => {
        // Try to find the output amount element
        const outputElements = document.querySelectorAll('[data-testid="amount-output"]');
        if (outputElements.length > 0) {
          const text = outputElements[0].textContent;
          if (text) {
            return parseFloat(text.replace(/,/g, ""));
          }
        }
        
        // Fallback: look for any input with a numeric value
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const value = input.value;
          if (value && !isNaN(parseFloat(value)) && parseFloat(value) > 0) {
            // Skip the input we just typed
            if (value !== "1") {
              return parseFloat(value.replace(/,/g, ""));
            }
          }
        }
        
        return null;
      });

      if (!outputAmount || outputAmount <= 0) {
        throw new Error("Could not extract output amount");
      }

      // Price = 1 USDT / tokens received = USDT per token
      const price = 1 / outputAmount;

      // Try to extract gas cost
      const gasUsd = await page.evaluate(() => {
        const gasElements = document.querySelectorAll('[class*="gas"]');
        for (const el of gasElements) {
          const text = el.textContent;
          if (text && text.includes("$")) {
            const match = text.match(/\$([0-9.]+)/);
            if (match) {
              return parseFloat(match[1]);
            }
          }
        }
        return 0.02; // Default
      });

      // Try to extract price impact
      const priceImpact = await page.evaluate(() => {
        const impactElements = document.querySelectorAll('[class*="impact"]');
        for (const el of impactElements) {
          const text = el.textContent;
          if (text && text.includes("%")) {
            const match = text.match(/([0-9.-]+)%/);
            if (match) {
              return parseFloat(match[1]);
            }
          }
        }
        return -0.34; // Default
      });

      // Try to extract max slippage
      const maxSlippage = await page.evaluate(() => {
        const slippageElements = document.querySelectorAll('[class*="slippage"]');
        for (const el of slippageElements) {
          const text = el.textContent;
          if (text && text.includes("%")) {
            return text;
          }
        }
        return "Auto / 0.50%";
      });

      this.onLog("info", "price_extracted", {
        token,
        outputAmount,
        price,
        gasUsd,
        priceImpact,
      });

      return {
        token,
        price,
        gasUsd,
        priceImpact,
        maxSlippage,
        route: "Uniswap UI",
      };
    } catch (error) {
      this.onLog("error", "scrape_error", {
        token,
        error: error instanceof Error ? error.message : String(error),
      });

      // Try to reload the page and retry
      try {
        const url = SWAP_URLS[token];
        await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      } catch {
        // Ignore reload errors
      }

      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
