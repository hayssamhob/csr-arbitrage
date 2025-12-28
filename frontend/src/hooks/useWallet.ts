import { ethers } from 'ethers';
import { useCallback, useEffect, useState } from 'react';

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
    };
  }
}

interface WalletState {
  address: string | null;
  chainId: number | null;
  balance: string | null;
  isConnecting: boolean;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    balance: null,
    isConnecting: false,
    error: null,
  });

  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<ethers.Signer | null>(null);

  // Check if MetaMask is installed
  const isMetaMaskInstalled = typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';

  // Connect wallet
  const connect = useCallback(async () => {
    if (!isMetaMaskInstalled) {
      setState(prev => ({ ...prev, error: 'MetaMask not installed' }));
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const ethereum = window.ethereum!;
      await ethereum.request({ method: 'eth_requestAccounts' });

      const web3Provider = new ethers.providers.Web3Provider(ethereum);
      const web3Signer = web3Provider.getSigner();
      const address = await web3Signer.getAddress();
      const network = await web3Provider.getNetwork();
      const balance = await web3Provider.getBalance(address);

      setProvider(web3Provider);
      setSigner(web3Signer);

      setState({
        address,
        chainId: network.chainId,
        balance: ethers.utils.formatEther(balance),
        isConnecting: false,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet';
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: message,
      }));
    }
  }, [isMetaMaskInstalled]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setState({
      address: null,
      chainId: null,
      balance: null,
      isConnecting: false,
      error: null,
    });
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (!isMetaMaskInstalled) return;

    const ethereum = window.ethereum!;

    const handleAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (accounts.length === 0) {
        disconnect();
      } else if (accounts[0] !== state.address) {
        connect();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    ethereum.on('accountsChanged', handleAccountsChanged);
    ethereum.on('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener('accountsChanged', handleAccountsChanged);
      ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [isMetaMaskInstalled, state.address, connect, disconnect]);

  return {
    ...state,
    provider,
    signer,
    isMetaMaskInstalled,
    connect,
    disconnect,
    isConnected: !!state.address,
  };
}
