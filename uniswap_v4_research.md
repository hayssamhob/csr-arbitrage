# Uniswap V4 Research Summary

This document summarizes the technical findings regarding Uniswap V4 for the CSR Arbitrage project.

## Core Infrastructure (Ethereum Mainnet)

| Component | Address |
|-----------|---------|
| **PoolManager** | `0x000000000004444c5dc75cb358380d2e3de08a90` |
| **V4 Quoter** | `0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203` |

## Pool Configurations

### CSR / USDT Pool
- **Pool ID**: `0x6c76bb9f364e72fcb57819d2920550768cf43e09e819daa40fabe9c7ab057f9e`
- **Token 0**: CSR (`0x75ecb52e403C617679FBd3e77A50f9d10A842387`) [18 Decimals]
- **Token 1**: USDT (`0xdac17f958d2ee523a2206206994597c13d831ec7`) [6 Decimals]
- **Fee**: 3000 (0.3%)
- **Tick Spacing**: 60
- **Hooks**: `0x0000000000000000000000000000000000000000` (None)

### CSR25 / USDT Pool
- **Pool ID**: `0x46afcc847653fa391320b2bde548c59cf384b029933667c541fb730c5641778e`
- **Token 0**: CSR25 (`0x502E7230E142A332DFEd1095F7174834b2548982`) [18 Decimals]
- **Token 1**: USDT (`0xdac17f958d2ee523a2206206994597c13d831ec7`) [6 Decimals]
- **Fee**: 3000 (0.3%)
- **Tick Spacing**: 60
- **Hooks**: `0x0000000000000000000000000000000000000000` (None)

## Quoting Implementation Details

### PoolKey Structure
To fetch quotes from the V4 Quoter, a `PoolKey` must be constructed:
```typescript
{
    currency0: address,
    currency1: address,
    fee: uint24,
    tickSpacing: int24,
    hooks: address
}
```

### Quoter Method
The primary method for single-hop quotes is `quoteExactInputSingle`:
```solidity
function quoteExactInputSingle(
    PoolKey memory key,
    bool zeroForOne,
    uint128 amountIn,
    bytes memory hookData
) external returns (uint128 amountOut, uint256 gasEstimate);
```

### Fallback Price Indicator
The `PoolManager.getSlot0(poolId)` can be used to fetch the `sqrtPriceX96` for a baseline mid-price calculation without a full quoter simulation.

## Token Metadata
- **CSR**: Standard ERC-20, 18 decimals.
- **CSR25**: Standard ERC-20, 18 decimals.
- **USDT**: Standard ERC-20, 6 decimals.
