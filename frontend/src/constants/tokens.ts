export interface TokenDefinition {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
}

export const PRESET_TOKENS: TokenDefinition[] = [
    {
        symbol: 'CSR',
        name: 'CSR Plastic Credit',
        address: '0x6bba316c48b49bd1eac44573c5c871ff02958469',
        decimals: 18,
    },
    {
        symbol: 'CSR25',
        name: 'CSR Year 2025',
        address: '0x0f5c78f152152dda52a2ea45b0a8c10733010748',
        decimals: 18,
    },
    // Future proofing: Easy to add CSR26, CSR27 here
];

// Standard addresses
export const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
export const USDT_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7';
export const UNISWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564'; // Uniswap V3 Router (Mainnet)
