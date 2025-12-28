/**
 * Error Parser - Convert raw blockchain/ethers errors into user-friendly messages
 * 
 * This addresses the requirement: "Never dump raw ethers error blob.
 * Show a friendly parsed message."
 */

interface ParsedError {
  title: string;
  message: string;
  suggestion?: string;
  isRecoverable: boolean;
}

/**
 * Parse ethers.js and blockchain errors into friendly messages
 */
export function parseBlockchainError(error: unknown): ParsedError {
  const errorStr = error instanceof Error ? error.message : String(error);
  const errorLower = errorStr.toLowerCase();

  // Gas estimation failed
  if (errorLower.includes('cannot estimate gas') || errorLower.includes('unpredictable_gas_limit')) {
    return {
      title: 'Gas Estimation Failed',
      message: 'The transaction simulation failed. This usually means the swap would revert.',
      suggestion: 'Check that you have sufficient token allowance, or try a smaller amount.',
      isRecoverable: true,
    };
  }

  // Insufficient allowance
  if (errorLower.includes('allowance') || errorLower.includes('erc20: insufficient allowance')) {
    return {
      title: 'Insufficient Allowance',
      message: 'You need to approve the token before swapping.',
      suggestion: 'Click "Approve USDT" first, then try the swap again.',
      isRecoverable: true,
    };
  }

  // Insufficient balance
  if (errorLower.includes('insufficient') && errorLower.includes('balance')) {
    return {
      title: 'Insufficient Balance',
      message: 'Your wallet doesn\'t have enough tokens for this trade.',
      suggestion: 'Reduce the trade amount or add more tokens to your wallet.',
      isRecoverable: true,
    };
  }

  // User rejected transaction
  if (errorLower.includes('user rejected') || errorLower.includes('user denied')) {
    return {
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction in your wallet.',
      suggestion: 'Click the button again if you want to proceed.',
      isRecoverable: true,
    };
  }

  // Network/RPC errors
  if (errorLower.includes('network') || errorLower.includes('rpc') || errorLower.includes('provider')) {
    return {
      title: 'Network Error',
      message: 'Failed to connect to the blockchain network.',
      suggestion: 'Check your internet connection and try again.',
      isRecoverable: true,
    };
  }

  // Slippage / price movement
  if (errorLower.includes('slippage') || errorLower.includes('price') && errorLower.includes('moved')) {
    return {
      title: 'Price Changed',
      message: 'The price moved too much during the transaction.',
      suggestion: 'Try again with a higher slippage tolerance or a smaller amount.',
      isRecoverable: true,
    };
  }

  // Deadline exceeded
  if (errorLower.includes('deadline') || errorLower.includes('expired')) {
    return {
      title: 'Transaction Expired',
      message: 'The transaction took too long and expired.',
      suggestion: 'Try submitting the transaction again.',
      isRecoverable: true,
    };
  }

  // Contract execution reverted
  if (errorLower.includes('execution reverted') || errorLower.includes('revert')) {
    return {
      title: 'Transaction Would Fail',
      message: 'The smart contract rejected this transaction.',
      suggestion: 'The trade may not be valid. Check the amounts and try again.',
      isRecoverable: true,
    };
  }

  // Nonce issues
  if (errorLower.includes('nonce')) {
    return {
      title: 'Transaction Sequence Error',
      message: 'There\'s a pending transaction that needs to complete first.',
      suggestion: 'Wait for pending transactions or reset your wallet nonce.',
      isRecoverable: true,
    };
  }

  // Default fallback - extract first meaningful part
  const shortMessage = extractShortMessage(errorStr);
  return {
    title: 'Transaction Error',
    message: shortMessage,
    suggestion: 'Please try again or contact support if the issue persists.',
    isRecoverable: false,
  };
}

/**
 * Extract a short, meaningful message from a long error string
 */
function extractShortMessage(errorStr: string): string {
  // Remove JSON blobs
  let cleaned = errorStr.replace(/\{[\s\S]*\}/g, '').trim();
  
  // Remove long hex strings
  cleaned = cleaned.replace(/0x[a-fA-F0-9]{40,}/g, '(address)');
  
  // Remove URLs
  cleaned = cleaned.replace(/https?:\/\/\S+/g, '');
  
  // Take first sentence or first 100 chars
  const firstSentence = cleaned.split(/[.!?]/)[0];
  if (firstSentence && firstSentence.length > 10) {
    return firstSentence.slice(0, 150) + (firstSentence.length > 150 ? '...' : '');
  }
  
  return cleaned.slice(0, 100) || 'An unexpected error occurred.';
}

/**
 * Format error for display in UI
 */
export function formatErrorForDisplay(error: unknown): string {
  const parsed = parseBlockchainError(error);
  let display = `${parsed.title}: ${parsed.message}`;
  if (parsed.suggestion) {
    display += ` ${parsed.suggestion}`;
  }
  return display;
}
