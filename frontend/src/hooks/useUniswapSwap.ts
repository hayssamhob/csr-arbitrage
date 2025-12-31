import { useState } from 'react';
import { ethers } from 'ethers';
import { UNISWAP_ROUTER_ADDRESS, WETH_ADDRESS } from '../constants/tokens';

// Minimal ABI for Uniswap V3 SwapRouter
const ROUTER_ABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

// Minimal ABI for ERC20 Approve
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)'
];

export const useUniswapSwap = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const executeSwap = async (amount: string, tokenAddress: string, direction: 'buy' | 'sell') => {
    setIsLoading(true);
    setError(null);
    setTxHash(null);

    try {
      if (!window.ethereum) throw new Error("No crypto wallet found");

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const router = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, ROUTER_ABI, signer);

      const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
      const fee = 3000; // 0.3% pool fee tier

      let tx;

      if (direction === 'buy') {
        // ETH -> Token
        const params = {
          tokenIn: WETH_ADDRESS,
          tokenOut: tokenAddress,
          fee: fee,
          recipient: await signer.getAddress(),
          deadline: deadline,
          amountIn: ethers.parseEther(amount),
          amountOutMinimum: 0, // In production, calculate slippage!
          sqrtPriceLimitX96: 0
        };

        tx = await router.exactInputSingle(params, { value: ethers.parseEther(amount) });
      } else {
        // Token -> ETH
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
        const amountInWei = ethers.parseEther(amount); // Assuming 18 decimals

        // 1. Approve
        const approvalTx = await tokenContract.approve(UNISWAP_ROUTER_ADDRESS, amountInWei);
        await approvalTx.wait();

        // 2. Swap
        const params = {
          tokenIn: tokenAddress,
          tokenOut: WETH_ADDRESS,
          fee: fee,
          recipient: await signer.getAddress(),
          deadline: deadline,
          amountIn: amountInWei,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0
        };

        tx = await router.exactInputSingle(params);
      }

      setTxHash(tx.hash);
      await tx.wait();

    } catch (err: any) {
      console.error(err);
      setError(err.reason || err.message || "Swap failed");
    } finally {
      setIsLoading(false);
    }
  };

  return { executeSwap, isLoading, error, txHash };
};

