# LLM Collaboration Guide (Windsurf / AI Assist)

This repository builds a Lean MVP for a CSR/CSR25 inventory-arbitrage monitoring & execution system:
- LBank market data → normalized gateway
- Uniswap pricing/quotes (read-only first)
- Dashboard to monitor spreads, inventory, health
- Dry-run strategy engine (decision logs)
- Execution later (opt-in)

## Ground Rules
- Security first: never place secrets in frontend code or in committed files.
- Never log API keys, signatures, private keys, or raw auth headers.
- Favor small, reviewable PR-sized changes.
- Add minimal tests or “self-check” scripts for each new module (smoke tests are fine).
- Prefer deterministic behavior: explicit configs, explicit timestamps, explicit units.

## What the LLM Should Do
- Generate and modify code in small steps.
- Always explain assumptions in comments near the code.
- When integrating an external API:
  - implement retries with backoff
  - handle disconnects/reconnects
  - validate payloads
  - detect stale data
- Provide a “dry-run” mode for any trading logic.

## What the LLM Must Not Do
- Do not add any dependency that enables secret exfiltration or remote code execution.
- Do not implement withdrawals or automatic transfers as part of MVP.
- Do not assume token addresses, chain, or pool fee tiers unless explicitly configured.
- Do not add long-running cron jobs without health endpoints and restart behavior.

## Standard Conventions
- Time: always use ISO 8601 timestamps and store in UTC.
- Money/price: store numeric values with explicit units:
  - `price_usdt` (float or decimal)
  - `size_token` / `size_usdt`
- Config: `.env` for local dev only; production via environment variables.
- Logging:
  - single-line JSON logs preferred
  - always include `service`, `event`, `ts`, `request_id` if available

## MVP Milestones
1) LBank WS → internal WS gateway + health endpoints
2) Uniswap quoting module (read-only)
3) Dashboard consuming internal WS + showing spread/edge
4) Dry-run strategy engine (no execution)
5) Execution modules (separate feature flag, later)
