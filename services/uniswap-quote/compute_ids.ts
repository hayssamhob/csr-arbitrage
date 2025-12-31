import { encodeAbiParameters, keccak256, parseAbiParameters } from 'viem';

const csrPoolKey = {
    currency0: '0x75Ecb52e403C617679FBd3e77A50f9d10A842387',
    currency1: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000'
};

const csr25PoolKey = {
    currency0: '0x502E7230E142A332DFEd1095F7174834b2548982',
    currency1: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    fee: 3000,
    tickSpacing: 60,
    hooks: '0x0000000000000000000000000000000000000000'
};

const idCsr = keccak256(encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address'),
    [csrPoolKey.currency0 as any, csrPoolKey.currency1 as any, csrPoolKey.fee, csrPoolKey.tickSpacing, csrPoolKey.hooks as any]
));

const idCsr25 = keccak256(encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address'),
    [csr25PoolKey.currency0 as any, csr25PoolKey.currency1 as any, csr25PoolKey.fee, csr25PoolKey.tickSpacing, csr25PoolKey.hooks as any]
));

console.log('CSR PoolID:', idCsr);
console.log('CSR25 PoolID:', idCsr25);
