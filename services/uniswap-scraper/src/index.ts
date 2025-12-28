import express from "express";
import { UniswapScraper } from "./scraper";

/**
 * Uniswap UI Scraper Service
 * 
 * TEMPORARY FALLBACK for V4 prices until RPC-based quoting is available
 * - Scrapes Uniswap UI every 10 seconds
 * - Clearly labeled source="ui_scrape"
 * - Fails safe: returns error instead of wrong data
 * - NEVER use in LIVE trading mode
 */

const PORT = parseInt(process.env.SCRAPER_PORT || "3010", 10);
const SCRAPE_INTERVAL_MS = 10000; // 10 seconds max

interface PriceData {
  token: string;
  price: number;
  gasUsd: number;
  priceImpact: number;
  maxSlippage: string;
  route: string;
  timestamp: string;
  source: "ui_scrape";
  isStale: boolean;
  error?: string;
}

// In-memory cache for scraped prices
const priceCache: Map<string, PriceData> = new Map();

const log = (level: string, event: string, data?: Record<string, unknown>) => {
  console.log(JSON.stringify({
    level,
    service: "uniswap-scraper",
    event,
    ts: new Date().toISOString(),
    ...data,
  }));
};

async function main() {
  const app = express();
  app.use(express.json());

  // Initialize scraper
  const scraper = new UniswapScraper(log);
  
  try {
    await scraper.initialize();
    log("info", "scraper_initialized");
  } catch (error) {
    log("error", "scraper_init_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    // Continue anyway - we'll return errors for price requests
  }

  // Start periodic scraping
  const scrapeAll = async () => {
    const tokens = ["CSR", "CSR25"] as const;
    
    for (const token of tokens) {
      try {
        const result = await scraper.scrapePrice(token);
        priceCache.set(token, {
          ...result,
          timestamp: new Date().toISOString(),
          source: "ui_scrape",
          isStale: false,
        });
        log("info", "price_scraped", { token, price: result.price });
      } catch (error) {
        const existing = priceCache.get(token);
        if (existing) {
          existing.isStale = true;
          existing.error = error instanceof Error ? error.message : String(error);
        } else {
          priceCache.set(token, {
            token,
            price: 0,
            gasUsd: 0,
            priceImpact: 0,
            maxSlippage: "N/A",
            route: "none",
            timestamp: new Date().toISOString(),
            source: "ui_scrape",
            isStale: true,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        log("warn", "scrape_failed", {
          token,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  // Initial scrape
  await scrapeAll();

  // Periodic scraping
  setInterval(scrapeAll, SCRAPE_INTERVAL_MS);

  // Health endpoint
  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      service: "uniswap-scraper",
      timestamp: new Date().toISOString(),
      cachedTokens: Array.from(priceCache.keys()),
    });
  });

  // Get price for a token
  app.get("/price/:token", (req, res) => {
    const token = req.params.token.toUpperCase();
    const cached = priceCache.get(token);

    if (!cached) {
      res.status(404).json({
        error: `No price data for ${token}`,
        source: "ui_scrape",
      });
      return;
    }

    // Check staleness (> 30 seconds is stale)
    const age = Date.now() - new Date(cached.timestamp).getTime();
    if (age > 30000) {
      cached.isStale = true;
    }

    res.json(cached);
  });

  // Get all prices
  app.get("/prices", (req, res) => {
    const prices: Record<string, PriceData> = {};
    priceCache.forEach((value, key) => {
      prices[key] = value;
    });
    res.json(prices);
  });

  app.listen(PORT, () => {
    log("info", "server_started", { port: PORT });
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    log("info", "shutting_down");
    await scraper.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    log("info", "shutting_down");
    await scraper.close();
    process.exit(0);
  });
}

main().catch((error) => {
  log("error", "fatal_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
