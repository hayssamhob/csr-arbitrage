# Authoritative Documentation References

This file defines the **primary documentation sources** that all code,
LLM-generated changes, and architectural decisions must rely on.

If behavior is unclear or conflicting, these sources take precedence.

---

## 1. LBank (CEX)

### Official API Documentation

- <https://www.lbank.com/en-US/docs/>

Scope:

- WebSocket market data (ticker, depth, trades)
- REST API (account, orders – read-only for MVP)
- Rate limits, reconnect rules, error codes

Notes:

- WebSocket payload formats MUST be validated against live messages.
- Assume disconnects, heartbeats, and symbol-specific quirks.
- No withdrawal or fund movement APIs are used in MVP.

---

### LBank API GitHub (Reference Implementations)

- <https://github.com/LBank-exchange>

Scope:

- Example WebSocket subscriptions
- Request signing patterns (future use)
- Symbol naming conventions

Notes:

- Code is reference-only; do not blindly copy.
- Prefer explicit typing and validation.

---

## 2. Uniswap (DEX)

### Uniswap v3 Documentation

- <https://docs.uniswap.org/>

Scope:

- Core concepts (concentrated liquidity, fee tiers)
- Pool mechanics
- Price impact vs spot price

---

### Uniswap Smart Order Router (AlphaRouter)

- <https://docs.uniswap.org/sdk/smart-order-router>

Scope:

- Computing executable quotes
- Route selection
- Gas estimation
- Slippage handling

Rules:

- Quotes must reflect **effective execution price**, not pool spot price.
- Read-only quoting only for MVP (no execution).

---

### Uniswap Subgraph (Context / Analytics Only)

- <https://thegraph.com/hosted-service/subgraph/uniswap/uniswap-v3>

Scope:

- Pool liquidity
- Volume
- Historical data

Warnings:

- Subgraph data is NOT authoritative for real-time execution prices.
- Use for context and dashboard display only.

---

## 3. Ethereum / EVM

### ethers.js

- <https://docs.ethers.org/>

Scope:

- Provider management
- BigNumber handling
- Transaction simulation (later)
- Signing (later)

---

### RPC Providers (generic)

Examples:

- Alchemy
- Infura
- Ankr

Rules:

- RPC failures must be handled gracefully.
- No hard dependency on a single provider.

---

## 4. Application & Infrastructure

### Node.js

- <https://nodejs.org/en/docs>

### TypeScript

- <https://www.typescriptlang.org/docs/>

### WebSocket (ws)

- <https://github.com/websockets/ws>

Scope:

- WS reconnect logic
- Heartbeats
- Backpressure handling

---

## 5. Security & Operational Rules (Non-negotiable)

- Secrets are never stored in repo.
- `.env` is local dev only.
- No automatic withdrawals or bridging in MVP.
- Any trading/execution code must be behind a feature flag.
- All prices must include units and timestamps.

---

## 6. When Documentation Is Missing or Ambiguous

If required behavior is not clearly specified:

1) Log raw inputs
2) Mark feature as **experimental**
3) Require human confirmation before execution
4) Document assumptions inline

Never guess silently.
