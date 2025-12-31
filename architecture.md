# Architecture (Lean MVP)

## Goal
Provide a simple, stable foundation for monitoring CSR/CSR25 price divergence between:
- LBank (CEX) orderbook/ticker
- LaToken (CEX) orderbook/ticker
- Uniswap (DEX) effective quote price

…and support a future upgrade to inventory arbitrage execution.

## Non-Goals (for MVP) but goals after MVP
- Automated withdrawals / cross-venue transfers
- Fully automated trading execution
- Complex route optimization beyond basic quoting
- Multi-chain support

---

## System Overview

### Components
1) **Market Data Gateways (Node/TS)**
   - **LBank Gateway**: Connects to LBank WebSocket.
   - **Latoken Gateway**: Connects to Latoken WebSocket.
   - **Role**: Normalize to standard `MarketTick` schema and publish to **Redis Streams**.
   - **Tech**: `ioredis`, `ws` (or protocol specific lib).
   - **Health**: Exposes HTTP health endpoints for Docker `healthcheck`.

2) **Uniswap Quote Service (Node/TS)**
   - Read-only module that returns effective execution prices for given sizes
   - Can be called on interval by Strategy Engine
   - Cached results and stale detection

3) **Strategy Engine (Dry-run, Node/TS)**
   - Computes “edge after costs” and decides:
     - would_trade = true/false
     - suggested_direction
     - suggested_size (bounded)
   - Logs decisions to console + optional persistence later

4) **Dashboard (Next.js, later)**
   - Shows:
     - LBank best bid/ask + timestamp
     - Uniswap quote for configured sizes
     - spread and “edge after costs”
     - system health, staleness, reconnect count
   - Sends control commands (later; initially read-only)

---

## Data Flows

### Market Data (LBank → Gateway → Consumers)
- LBank WS → parse/validate → internal event bus → internal WS broadcast
- Consumers subscribe to internal WS:
  - dashboard
  - strategy engine

### DEX Quotes
- Strategy/Dashboard calls Quote Service on a schedule:
  - request: tokenIn/tokenOut, amountIn, chainId, slippage config
  - response: effective price, estimated gas, route metadata, timestamp

---

## Internal Data Schemas (MVP)

### LBank Ticker Event
```json
{
  "type": "lbank.ticker",
  "symbol": "csr_usdt",
  "ts": "2025-12-26T00:00:00.000Z",
  "bid": 0.0123,
  "ask": 0.0126,
  "last": 0.0125,
  "source_ts": "2025-12-26T00:00:00.000Z"
}


###Uniswap Quote Result
{
  "type": "uniswap.quote",
  "pair": "CSR/USDT",
  "chain_id": 1,
  "ts": "2025-12-26T00:00:00.000Z",
  "amount_in": "1000.0",
  "amount_in_unit": "USDT",
  "amount_out": "80000.0",
  "amount_out_unit": "CSR",
  "effective_price_usdt": 0.0125,
  "estimated_gas": 180000,
  "route": { "summary": "..." }
}

Staleness & Health
	•	Each service maintains:
	•	last_message_ts
	•	reconnect_count
	•	errors_last_5m
	•	Circuit breaker (MVP):
	•	If LBank feed stale > X seconds → mark unhealthy
	•	If Uniswap quote fails N times → mark degraded

⸻

Security Model (MVP)
	•	No secret in frontend. Ever.
	•	No trading keys required for MVP.
	•	Env vars:
	•	LBANK_WS_URL
	•	INTERNAL_WS_PORT
	•	HTTP_PORT
	•	LOG_LEVEL
	•	Later (execution):
	•	exchange API keys live only in execution service
	•	wallet keys stored securely, with hot-wallet limits

⸻

Repo Layout (suggested)
	•	/services/lbank-gateway
	•	/services/uniswap-quote
	•	/services/strategy
	•	/apps/dashboard (later)
	•	/packages/shared (types, validators, helpers)

⸻

Operational Expectations
	•	Services run under a process manager (PM2/systemd) or Docker.
	•	Restart on crash.
	•	Expose health endpoints for monitoring.
