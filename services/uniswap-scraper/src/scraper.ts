import puppeteer, { Browser, Page } from "puppeteer";
import * as fs from "fs";
import * as path from "path";
import { ScraperConfig } from "./config";
import { LogFn, QuoteData, ScrapeError, TokenSymbol } from "./types";

const DEBUG_DIR = "/tmp/uniswap-debug";

/**
 * Observable Uniswap UI Scraper
 * 
 * Priority: Visibility and non-blocking behavior
 * - Screenshots at each stage
 * - HTML snapshots for debugging
 * - Fast fail (no hanging)
 * - Proper React input dispatching
 */
export class UniswapScraper {
  private browser: Browser | null = null;
  private pages: Map<TokenSymbol, Page> = new Map();
  private config: ScraperConfig;
  private onLog: LogFn;
  private consecutiveFailures: Map<TokenSymbol, number> = new Map();
  private recentErrors: ScrapeError[] = [];
  private lastSuccessTs: number | null = null;

  constructor(config: ScraperConfig, onLog: LogFn) {
    this.config = config;
    this.onLog = onLog;
    this.consecutiveFailures.set("CSR", 0);
    this.consecutiveFailures.set("CSR25", 0);
    
    // Ensure debug directory exists
    if (!fs.existsSync(DEBUG_DIR)) {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
  }

  /**
   * Save screenshot for debugging
   */
  private async saveScreenshot(page: Page, token: TokenSymbol, stage: string): Promise<string> {
    const filename = `${token}-${stage}-${Date.now()}.png`;
    const filepath = path.join(DEBUG_DIR, filename);
    try {
      await page.screenshot({ path: filepath, fullPage: true });
      this.onLog("debug", "screenshot_saved", { token, stage, filepath });
      return filepath;
    } catch (error) {
      this.onLog("warn", "screenshot_failed", { 
        token, stage, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return "";
    }
  }

  /**
   * Save HTML snapshot for debugging
   */
  private async saveHtml(page: Page, token: TokenSymbol, stage: string): Promise<string> {
    const filename = `${token}-${stage}-${Date.now()}.html`;
    const filepath = path.join(DEBUG_DIR, filename);
    try {
      const content = await page.content();
      fs.writeFileSync(filepath, content);
      this.onLog("debug", "html_saved", { token, stage, filepath });
      return filepath;
    } catch (error) {
      this.onLog("warn", "html_save_failed", { 
        token, stage, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return "";
    }
  }

  /**
   * Dismiss ALL blocking modals - run until no blockers found
   */
  private async dismissBlockers(page: Page, token: TokenSymbol): Promise<void> {
    const blockerTexts = ["Accept", "I agree", "Continue", "Close", "Got it", "Dismiss", "OK"];
    let dismissed = 0;
    const maxIterations = 5;

    for (let i = 0; i < maxIterations; i++) {
      let foundBlocker = false;

      // Try clicking buttons with blocker text
      for (const text of blockerTexts) {
        try {
          const buttons = await page.$$(`button`);
          for (const button of buttons) {
            const buttonText = await button.evaluate(el => el.textContent || "");
            if (buttonText.toLowerCase().includes(text.toLowerCase())) {
              await button.click();
              dismissed++;
              foundBlocker = true;
              this.onLog("debug", "blocker_clicked", { token, text: buttonText });
              await page.waitForTimeout(300);
            }
          }
        } catch {
          // Button might have disappeared
        }
      }

      // Try to close any modal overlays
      try {
        await page.evaluate(() => {
          // Remove overflow:hidden from body
          document.body.style.overflow = "auto";
          
          // Try to find and click close buttons on modals
          const closeSelectors = [
            '[aria-label="Close"]',
            '[data-testid="close-icon"]',
            'button[aria-label*="close"]',
            '.modal-close',
          ];
          for (const sel of closeSelectors) {
            const el = document.querySelector(sel) as HTMLElement;
            if (el) {
              el.click();
            }
          }
          
          // Hide modal overlays
          const overlays = document.querySelectorAll('[class*="overlay"], [class*="modal"], [class*="backdrop"]');
          overlays.forEach(el => {
            (el as HTMLElement).style.display = "none";
          });
        });
      } catch {
        // Ignore errors
      }

      if (!foundBlocker) break;
      await page.waitForTimeout(200);
    }

    this.onLog("info", "blockers_dismissed", { token, count: dismissed });
  }

  async initialize(): Promise<void> {
    this.onLog("info", "browser_launching", {
      headless: this.config.headless,
      args: this.config.chromeArgs,
    });

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: this.config.chromeArgs,
      defaultViewport: { width: 1920, height: 1080 },
    });

    // Initialize pages for each token
    for (const token of ["CSR", "CSR25"] as TokenSymbol[]) {
      await this.initializePage(token);
    }

    this.onLog("info", "browser_initialized", {
      pages: Array.from(this.pages.keys()),
    });
  }

  private async initializePage(token: TokenSymbol): Promise<void> {
    if (!this.browser) throw new Error("Browser not initialized");

    const page = await this.browser.newPage();
    await page.setUserAgent(this.config.userAgent);

    // Don't block stylesheets - we need to see the UI properly
    if (this.config.blockResources) {
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const resourceType = req.resourceType();
        if (["image", "font", "media"].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
    }

    const url = this.config.tokens[token];
    this.onLog("info", "page_navigating", { token, url });

    try {
      await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: this.config.uniswapTimeoutMs,
      });

      // Save debug artifacts after load
      await this.saveScreenshot(page, token, "01-after-load");
      await this.saveHtml(page, token, "01-after-load");
      
      this.onLog("info", "page_loaded", { token });

      // Dismiss blockers
      await this.dismissBlockers(page, token);
      await this.saveScreenshot(page, token, "02-after-blockers");

      this.pages.set(token, page);
    } catch (error) {
      this.onLog("error", "page_load_failed", {
        token,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Scrape quote - non-blocking, fast fail
   */
  async scrapeQuote(token: TokenSymbol, amountUsdt: number): Promise<QuoteData> {
    const page = this.pages.get(token);
    if (!page) {
      return this.createInvalidQuote(token, amountUsdt, "selector_missing", "Page not initialized");
    }

    const startTime = Date.now();
    const maxDuration = 10000; // 10 second max per quote

    try {
      // Step 1: Find input field
      this.onLog("debug", "finding_input", { token, amountUsdt });
      
      const inputSelector = 'input[inputmode="decimal"]';
      const inputs = await page.$$(inputSelector);
      
      if (inputs.length === 0) {
        await this.saveScreenshot(page, token, `03-no-inputs-${amountUsdt}`);
        return this.createInvalidQuote(token, amountUsdt, "selector_missing", "No decimal inputs found");
      }

      this.onLog("info", "input_field_found", { token, inputCount: inputs.length });

      // Use first input (the "You pay" field)
      const inputField = inputs[0];

      // Step 2: Get current output value (before setting input)
      const outputBefore = await this.getOutputValue(page);
      this.onLog("debug", "output_before", { token, outputBefore });

      // Step 3: Set input value with proper React dispatching
      this.onLog("debug", "setting_input", { token, amountUsdt });
      
      // Clear the input
      await inputField.click({ clickCount: 3 });
      await page.keyboard.press("Backspace");
      
      // Type the value
      await inputField.type(amountUsdt.toString(), { delay: 30 });
      
      // Dispatch React events
      await inputField.evaluate((el, value) => {
        const input = el as HTMLInputElement;
        
        // Set value directly
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        )?.set;
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, value);
        }
        
        // Dispatch events
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
      }, amountUsdt.toString());

      this.onLog("info", "input_value_set", { token, amountUsdt });
      await this.saveScreenshot(page, token, `04-after-input-${amountUsdt}`);

      // Step 4: Wait for output to change (max 5 seconds, no hanging)
      this.onLog("debug", "waiting_for_output", { token });
      
      const outputAfter = await this.waitForOutputChange(page, outputBefore, 5000);
      
      if (outputAfter === null) {
        this.onLog("warn", "output_unchanged", { token, amountUsdt, outputBefore });
        await this.saveScreenshot(page, token, `05-output-unchanged-${amountUsdt}`);
        return this.createInvalidQuote(token, amountUsdt, "timeout", "Output did not change");
      }

      this.onLog("info", "output_changed", { token, outputBefore, outputAfter });

      // Step 5: Calculate effective price
      const effectivePrice = amountUsdt / outputAfter;
      
      // Success
      this.consecutiveFailures.set(token, 0);
      this.lastSuccessTs = Date.now();

      const duration = Date.now() - startTime;
      this.onLog("info", "quote_scraped", {
        token,
        amountUsdt,
        outputAfter,
        effectivePrice,
        durationMs: duration,
      });

      return {
        market: `${token}_USDT`,
        inputToken: "USDT",
        outputToken: token,
        amountInUSDT: amountUsdt,
        amountOutToken: outputAfter.toFixed(8),
        effectivePriceUsdtPerToken: effectivePrice,
        gasEstimateUsdt: 0, // TODO: extract from UI
        route: "Uniswap UI",
        ts: Math.floor(Date.now() / 1000),
        valid: true,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      const failures = (this.consecutiveFailures.get(token) || 0) + 1;
      this.consecutiveFailures.set(token, failures);

      this.onLog("error", "scrape_failed", {
        token,
        amountUsdt,
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
        consecutiveFailures: failures,
      });

      await this.saveScreenshot(page, token, `error-${amountUsdt}`);

      return this.createInvalidQuote(
        token,
        amountUsdt,
        "unknown",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get current output value from the second decimal input
   */
  private async getOutputValue(page: Page): Promise<number | null> {
    try {
      const result = await page.evaluate(() => {
        const inputs = document.querySelectorAll('input[inputmode="decimal"]');
        if (inputs.length >= 2) {
          const output = inputs[1] as HTMLInputElement;
          const value = output.value.replace(/,/g, "");
          return value ? parseFloat(value) : null;
        }
        return null;
      });
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Wait for output to change (non-blocking, max timeout)
   */
  private async waitForOutputChange(
    page: Page,
    originalValue: number | null,
    maxWaitMs: number
  ): Promise<number | null> {
    const startTime = Date.now();
    const checkInterval = 300;

    while (Date.now() - startTime < maxWaitMs) {
      const currentValue = await this.getOutputValue(page);
      
      // Check if value changed
      if (currentValue !== null && currentValue > 0) {
        if (originalValue === null || currentValue !== originalValue) {
          this.onLog("debug", "output_container_found", { currentValue });
          return currentValue;
        }
      }

      await page.waitForTimeout(checkInterval);
    }

    // Timeout - return whatever we have
    const finalValue = await this.getOutputValue(page);
    return finalValue !== originalValue ? finalValue : null;
  }

  private createInvalidQuote(
    token: TokenSymbol,
    amountUsdt: number,
    reason: ScrapeError["type"],
    message: string
  ): QuoteData {
    return {
      market: `${token}_USDT`,
      inputToken: "USDT",
      outputToken: token,
      amountInUSDT: amountUsdt,
      amountOutToken: "0",
      effectivePriceUsdtPerToken: 0,
      gasEstimateUsdt: 0,
      route: "none",
      ts: Math.floor(Date.now() / 1000),
      valid: false,
      reason: `${reason}: ${message}`,
    };
  }

  async restartBrowser(): Promise<void> {
    this.onLog("warn", "browser_restarting");
    try {
      await this.close();
    } catch {
      // Ignore
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.initialize();
    this.consecutiveFailures.set("CSR", 0);
    this.consecutiveFailures.set("CSR25", 0);
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
    }
  }

  getErrorsLast5m(): number {
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    return this.recentErrors.filter(e => e.timestamp > fiveMinAgo).length;
  }

  getLastSuccessTs(): number | null {
    return this.lastSuccessTs;
  }

  getConsecutiveFailures(token: TokenSymbol): number {
    return this.consecutiveFailures.get(token) || 0;
  }
}
