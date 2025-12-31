import { ethers } from 'ethers';
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

// Define window.ethereum type
declare global {
    interface Window {
        ethereum?: any;
    }
}

interface WalletState {
    address: string | null;
    chainId: number | null;
    balance: string | null;
    isConnecting: boolean;
    error: string | null;
    walletName: string | null;
}

interface WalletContextType extends WalletState {
    connect: () => Promise<void>;
    disconnect: () => void;
    isConnected: boolean;
    provider: ethers.providers.Web3Provider | null;
    signer: ethers.Signer | null;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<WalletState>({
        address: null,
        chainId: null,
        balance: null,
        isConnecting: false,
        error: null,
        walletName: null,
    });

    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);

    const isWalletAvailable = typeof window !== "undefined" && typeof window.ethereum !== "undefined";

    const getWalletName = (): string => {
        if (!window.ethereum) return "Unknown";
        if (window.ethereum.isRabby) return "Rabby";
        if (window.ethereum.isMetaMask) return "MetaMask";
        if (window.ethereum.isCoinbaseWallet) return "Coinbase";
        return "Wallet";
    };

    const updateWalletState = useCallback(async (ethereum: any) => {
        try {
            const web3Provider = new ethers.providers.Web3Provider(ethereum, "any");
            const web3Signer = web3Provider.getSigner();
            const address = await web3Signer.getAddress();
            const network = await web3Provider.getNetwork();
            const balance = await web3Provider.getBalance(address);
            const walletName = getWalletName();

            setProvider(web3Provider);
            setSigner(web3Signer);

            setState({
                address,
                chainId: network.chainId,
                balance: ethers.utils.formatEther(balance),
                isConnecting: false,
                error: null,
                walletName,
            });

            // Save for auto-connect
            localStorage.setItem('wallet_auto_connect', 'true');
        } catch (err) {
            console.error("Failed to update wallet state:", err);
            disconnect();
        }
    }, []);

    const connect = async () => {
        if (!isWalletAvailable) {
            setState(prev => ({ ...prev, error: "No wallet detected. Please install MetaMask or Rabby." }));
            return;
        }

        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        try {
            let ethereum = window.ethereum;
            if (ethereum.providers && ethereum.providers.length > 0) {
                ethereum = ethereum.providers.find((p: any) => p.isRabby) ||
                    ethereum.providers.find((p: any) => p.isMetaMask && !p.isRabby) ||
                    ethereum.providers[0];
            }

            await ethereum.request({ method: "eth_requestAccounts" });
            await updateWalletState(ethereum);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to connect wallet";
            setState(prev => ({ ...prev, isConnecting: false, error: message }));
        }
    };

    const disconnect = () => {
        setProvider(null);
        setSigner(null);
        setState({
            address: null,
            chainId: null,
            balance: null,
            isConnecting: false,
            error: null,
            walletName: null,
        });
        localStorage.removeItem('wallet_auto_connect');
    };

    useEffect(() => {
        if (isWalletAvailable && localStorage.getItem('wallet_auto_connect') === 'true') {
            // Check if already authorized
            window.ethereum.request({ method: 'eth_accounts' })
                .then((accounts: string[]) => {
                    if (accounts.length > 0) {
                        updateWalletState(window.ethereum);
                    }
                })
                .catch(console.error);
        }

        if (isWalletAvailable) {
            const handleAccountsChanged = (accounts: string[]) => {
                if (accounts.length === 0) {
                    disconnect();
                } else {
                    updateWalletState(window.ethereum);
                }
            };

            const handleChainChanged = () => {
                window.location.reload();
            };

            window.ethereum.on("accountsChanged", handleAccountsChanged);
            window.ethereum.on("chainChanged", handleChainChanged);

            return () => {
                window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
                window.ethereum.removeListener("chainChanged", handleChainChanged);
            };
        }
    }, [isWalletAvailable, updateWalletState]);

    return (
        <WalletContext.Provider value={{
            ...state,
            connect,
            disconnect,
            isConnected: !!state.address,
            provider,
            signer
        }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWalletContext = () => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWalletContext must be used within a WalletProvider');
    }
    return context;
};
