import { ethers } from 'ethers';
import { TokenConfig } from './config';

// ============================================================================
// Uniswap v4 StateView Reader
// Reads pool state using the StateView contract
// ============================================================================

// StateView contract ABI
const STATE_VIEW_ABI = [
  'function getSlot0(bytes32[] poolIds) external view returns (uint160[] sqrtPriceX96s, int24[] ticks, uint16[] protocolFees, uint16[] lpFees)',
  'function getLiquidity(bytes32[] poolIds) external view returns (uint128[] liquidities)'
];

export class V4StateViewReader {
  private provider: ethers.providers.JsonRpcProvider;
  private stateViewContract: ethers.Contract;
  
  constructor(provider: ethers.providers.JsonRpcProvider, stateViewAddress: string) {
    this.provider = provider;
    this.stateViewContract = new ethers.Contract(stateViewAddress, STATE_VIEW_ABI, provider);
  }

  async readPoolState(
    poolId: string,
    tokenIn: TokenConfig,
    tokenOut: TokenConfig
  ): Promise<{
    price: number;
    exists: boolean;
    liquidity: string;
    sqrtPriceX96: string;
  }> {
    try {
      // Query StateView for pool state
      const poolIds = [poolId];
      const [sqrtPriceX96s, ticks, protocolFees, lpFees] = await this.stateViewContract.getSlot0(poolIds);
      const [liquidities] = await this.stateViewContract.getLiquidity(poolIds);
      
      const sqrtPriceX96 = sqrtPriceX96s[0];
      const liquidity = liquidities[0];
      
      // Check if pool exists (liquidity > 0 or sqrtPriceX96 > 0)
      if (liquidity.eq(0) && sqrtPriceX96.eq(0)) {
        return {
          price: 0,
          exists: false,
          liquidity: '0',
          sqrtPriceX96: '0'
        };
      }
      
      // Calculate price from sqrtPriceX96
      // price = (sqrtPriceX96 / 2^96)^2
      const price = (Number(sqrtPriceX96.toString()) / (2 ** 96)) ** 2;
      
      // Determine token order and adjust price
      // We need to determine which token is token0/token1 in the pool
      const isToken0InPool = tokenIn.address.toLowerCase() < tokenOut.address.toLowerCase();
      
      let effectivePriceUsdtPerToken: number;
      
      if (isToken0InPool) {
        // token0 is USDT, token1 is TOKEN
        // price is token1/token0, so we need 1/price
        effectivePriceUsdtPerToken = 1 / price;
      } else {
        // token0 is TOKEN, token1 is USDT
        // price is token1/token0 = USDT/TOKEN, which is what we want
        effectivePriceUsdtPerToken = price;
      }
      
      // Apply decimal adjustments
      const decimalAdjustment = 10 ** (tokenIn.decimals - tokenOut.decimals);
      effectivePriceUsdtPerToken *= decimalAdjustment;
      
      return {
        price: effectivePriceUsdtPerToken,
        exists: true,
        liquidity: liquidity.toString(),
        sqrtPriceX96: sqrtPriceX96.toString()
      };
      
    } catch (error) {
      console.error('Failed to read v4 pool state from StateView:', error);
      return {
        price: 0,
        exists: false,
        liquidity: '0',
        sqrtPriceX96: '0'
      };
    }
  }
}
