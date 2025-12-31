
// ============================================================================
// Uniswap v4 Subgraph Reader
// Fetches pool data from Uniswap v4 subgraph
// ============================================================================

const V4_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/id/6XvRX3WHSvzBVTiPdF66XSBVbxWuHqijWANbjJxRDyzr';

interface PoolData {
  id: string;
  token0: {
    id: string;
    symbol: string;
    decimals: string;
  };
  token1: {
    id: string;
    symbol: string;
    decimals: string;
  };
  sqrtPrice: string;
  liquidity: string;
  token0Price: string;
  token1Price: string;
  feeTier: string;
  fee: number; // Added to match broader interface if needed
}

export class V4SubgraphReader {
  async fetchPoolData(poolId: string): Promise<{
    price: number;
    exists: boolean;
    liquidity: string;
    token0: string;
    token1: string;
  }> {
    try {
      // GraphQL query
      const query = `
        query getPool($poolId: ID!) {
          pool(id: $poolId) {
            id
            token0 {
              id
              symbol
              decimals
            }
            token1 {
              id
              symbol
              decimals
            }
            sqrtPrice
            liquidity
            token0Price
            token1Price
            feeTier
          }
        }
      `;

      const response = await fetch(V4_SUBGRAPH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables: { poolId },
        }),
      });

      const result: any = await response.json();

      if (result.errors || !result.data || !result.data.pool) {
        console.error('Subgraph query failed:', result.errors);
        return {
          price: 0,
          exists: false,
          liquidity: '0',
          token0: '',
          token1: '',
        };
      }

      const pool: PoolData = result.data.pool;

      // The subgraph provides token0Price and token1Price directly
      // We need to determine which is USDT and which is the token
      const isToken0USDT = pool.token0.symbol.toLowerCase() === 'usdt';
      const price = isToken0USDT ? parseFloat(pool.token1Price) : parseFloat(pool.token0Price);

      return {
        price,
        exists: true,
        liquidity: pool.liquidity,
        token0: pool.token0.symbol,
        token1: pool.token1.symbol,
      };

    } catch (error) {
      console.error('Failed to fetch from subgraph:', error);
      return {
        price: 0,
        exists: false,
        liquidity: '0',
        token0: '',
        token1: '',
      };
    }
  }
}
