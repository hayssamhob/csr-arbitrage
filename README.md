# CSR/CSR25 Arbitrage Monitoring System (Lean MVP)

A crypto market-monitoring and **dry-run arbitrage** system for CSR and CSR25 tokens across LBank (CEX) and Uniswap (DEX).

> **⚠️ IMPORTANT: This MVP is for monitoring and dry-run decisioning only — NO live trading, NO withdrawals, NO fund movement.**

## Architecture Overview

```
│  LBank / Latoken  │────▶│  Strategy Engine │◀────│  Uniswap V4   │
│     Gateway       │     │     (Dry-Run)    │     │ PoolManager   │
│   (Redis Pub)     │     │    (Redis Sub)   │     │ (Flash Acct)  │
└────────┬──────────┘     └────────┬─────────┘     └───────┬───────┘
         │                         │                       │
         │ Redis Streams           │ Redis Streams         │ On-Chain
         │                         │                       │
         ▼                         ▼                       ▼
    Data Archiver           Execution Engine          Ethereum Mainnet
```

### Components

1.  **Market Data Gateways**
    *   **LBank Gateway** (`services/lbank-gateway`): Connects to LBank WebSocket.
    *   **Latoken Gateway** (`services/latoken-gateway`): Connects to Latoken WebSocket.
    *   **Role**: Normalize ticker/depth data and publish `market.tick` events to **Redis Streams**.

2.  **Uniswap V4 Gateway** (`services/uniswap-quote`)
    *   Interacts with Uniswap V4 PoolManager singleton.
    *   Uses `viem` for Flash Accounting checks and pricing.
    *   Publishes ticks to Redis.

2. **Uniswap Quote Service** (`services/uniswap-quote`)
   - Read-only quoting via AlphaRouter
   - Returns effective execution price (not spot)
   - Caches results with configurable TTL
   - **NO execution, NO signing**

3. **Strategy Engine** (`services/strategy`)
   - Computes raw spread and edge after costs
   - Emits `would_trade` decisions (dry-run only)
   - Logs all decisions with structured JSON
   - **NEVER executes trades in MVP**

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- RPC endpoint (Alchemy, Infura, Ankr) for Uniswap quotes

### Installation

```bash
# Install dependencies for each service
cd services/lbank-gateway && npm install
cd ../uniswap-quote && npm install
cd ../strategy && npm install
cd ../../packages/shared && npm install
```

### Configuration

Each service has a `.env.example` file. Copy and configure:

```bash
# LBank Gateway
cp services/lbank-gateway/.env.example services/lbank-gateway/.env

# Uniswap Quote (requires RPC_URL and token configs)
cp services/uniswap-quote/.env.example services/uniswap-quote/.env

# Strategy Engine
cp services/strategy/.env.example services/strategy/.env
```

**Critical configuration items:**
- `RPC_URL` - Your Ethereum RPC endpoint (Uniswap Quote)
- `TOKEN_IN_CONFIG` / `TOKEN_OUT_CONFIG` - Token addresses (JSON format)
- `SYMBOLS` - LBank symbols to subscribe to

### Running Services

Start each service in a separate terminal:

```bash
# Terminal 1: LBank Gateway
cd services/lbank-gateway
npm run dev

# Terminal 2: Uniswap Quote Service  
cd services/uniswap-quote
npm run dev

# Terminal 3: Strategy Engine
cd services/strategy
npm run dev
```

### Health Checks

```bash
# LBank Gateway
curl http://localhost:3001/health
curl http://localhost:3001/ready

# Uniswap Quote
curl http://localhost:3002/health
curl http://localhost:3002/ready

# Strategy Engine
curl http://localhost:3003/health
curl http://localhost:3003/ready
curl http://localhost:3003/decision  # Last decision
curl http://localhost:3003/state     # Current market state
```

## Environment Variables

### LBank Gateway (Port 3001)

| Variable | Default | Description |
|----------|---------|-------------|
| `LBANK_WS_URL` | `wss://www.lbkex.net/ws/V2/` | LBank WebSocket URL |
| `SYMBOLS` | `csr_usdt,csr25_usdt` | Symbols to subscribe |
| `INTERNAL_WS_PORT` | `8080` | Internal WS broadcast port |
| `HTTP_PORT` | `3001` | Health endpoint port |
| `MAX_STALENESS_SECONDS` | `10` | Staleness threshold |
| `LOG_LEVEL` | `info` | Log verbosity |

### Uniswap Quote (Port 3002)

| Variable | Default | Description |
|----------|---------|-------------|
| `CHAIN_ID` | `1` | Ethereum chain ID |
| `RPC_URL` | **Required** | Ethereum RPC endpoint |
| `TOKEN_IN_CONFIG` | **Required** | Input token JSON config |
| `TOKEN_OUT_CONFIG` | **Required** | Output token JSON config |
| `QUOTE_SIZES_USDT` | `100,500,1000` | Quote sizes |
| `QUOTE_CACHE_TTL_SECONDS` | `30` | Cache TTL |
| `HTTP_PORT` | `3002` | API port |
| `SLIPPAGE_TOLERANCE_PERCENT` | `0.5` | Slippage tolerance |

### Strategy Engine (Port 3003)

| Variable | Default | Description |
|----------|---------|-------------|
| `LBANK_GATEWAY_WS_URL` | `ws://localhost:8080` | Gateway WS URL |
| `UNISWAP_QUOTE_URL` | `http://localhost:3002` | Quote service URL |
| `SYMBOL` | `csr_usdt` | Symbol to monitor |
| `QUOTE_SIZE_USDT` | `1000` | Quote size |
| `MIN_EDGE_BPS` | `50` | Min edge threshold (bps) |
| `ESTIMATED_COST_BPS` | `30` | Estimated costs (bps) |
| `MAX_TRADE_SIZE_USDT` | `5000` | Max suggested size |
| `HTTP_PORT` | `3003` | Health endpoint port |

## Internal Data Schemas

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
```

### Strategy Decision (Dry-Run)
```json
{
  "type": "strategy.decision",
  "ts": "2025-12-26T00:00:00.000Z",
  "symbol": "csr_usdt",
  "lbank_bid": 0.0123,
  "lbank_ask": 0.0126,
  "uniswap_price": 0.0128,
  "raw_spread_bps": 15.87,
  "estimated_cost_bps": 30,
  "edge_after_costs_bps": -14.13,
  "would_trade": false,
  "direction": "none",
  "suggested_size_usdt": 0,
  "reason": "Edge -14.13bps below threshold 50bps"
}
```

## Security Model

- **No secrets in code** - All sensitive config via environment variables
- **No execution** - MVP is monitoring only
- **No withdrawals** - Fund movement is out of scope
- **Configurable tokens** - Never assume addresses or chain IDs
- `.env` files are gitignored - Never commit secrets

## Project Structure

```
.
├── docs.md                    # Authoritative documentation references
├── architecture.md            # System architecture
├── agents.md                  # Agent responsibilities
├── llms.md                    # LLM collaboration guide
├── packages/
│   └── shared/                # Shared schemas, logger, utilities
│       └── src/
│           ├── schemas.ts
│           ├── logger.ts
│           └── time.ts
└── services/
    ├── lbank-gateway/         # LBank WebSocket gateway
    │   └── src/
    │       ├── index.ts
    │       ├── lbankClient.ts
    │       ├── schemas.ts
    │       ├── health.ts
    │       └── config.ts
    ├── uniswap-quote/         # Uniswap quote service
    │   └── src/
    │       ├── index.ts
    │       ├── quoteService.ts
    │       ├── schemas.ts
    │       └── config.ts
    └── strategy/              # Strategy engine (dry-run)
        └── src/
            ├── index.ts
            ├── strategyEngine.ts
            ├── schemas.ts
            └── config.ts
```

## Logging

All services use structured JSON logging:

```json
{"level":"info","service":"lbank-gateway","event":"ticker_received","ts":"2025-12-26T00:00:00.000Z","symbol":"csr_usdt","last":0.0125}
```

## Troubleshooting

### LBank Gateway not receiving data
1. Check `LBANK_WS_URL` is correct
2. Verify symbols exist on LBank
3. Check logs for reconnection attempts

### Uniswap quotes failing
1. Verify `RPC_URL` is valid and has credits
2. Check token addresses are correct
3. Ensure `CHAIN_ID` matches your RPC

### Strategy showing stale data
1. Ensure all services are running
2. Check `MAX_STALENESS_SECONDS` thresholds
3. Verify WebSocket connections via `/ready` endpoints

## License

MIT
