import { useWalletContext } from '../contexts/WalletContext';

/**
 * useWallet - Consumer hook for global WalletContext
 * Replaces the previous local state implementation to ensure
 * wallet connectivity is shared across all pages.
 */
export function useWallet() {
  return useWalletContext();
}
