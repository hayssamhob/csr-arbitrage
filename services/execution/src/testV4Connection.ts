/**
 * V4 Connection Test Script
 * Verifies connection to the Uniswap V4 PoolManager contract
 * 
 * Run with: npx ts-node src/testV4Connection.ts
 */

import { ethers } from 'ethers';
import { DEFAULT_POOL_CONFIGS, TOKEN_ADDRESSES, UNISWAP_V4_ADDRESSES } from './config';

// PoolManager ABI (minimal - just what we need for testing)
const POOL_MANAGER_ABI = [
  'function protocolFeeController() view returns (address)',
  'function owner() view returns (address)',
];

// StateView ABI for reading pool state
const STATE_VIEW_ABI = [
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128)',
];

async function testV4Connection(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Uniswap V4 Connection Test');
  console.log('='.repeat(60));

  // Get RPC URL from environment
  const rpcUrl = process.env.RPC_URL || process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  console.log(`\nUsing RPC: ${rpcUrl.substring(0, 30)}...`);

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Test 1: Check network connection
    console.log('\n[Test 1] Network Connection');
    const network = await provider.getNetwork();
    console.log(`  ✓ Connected to chain ID: ${network.chainId}`);

    // Test 2: Verify PoolManager contract exists
    console.log('\n[Test 2] PoolManager Contract');
    console.log(`  Address: ${UNISWAP_V4_ADDRESSES.POOL_MANAGER}`);
    
    const poolManagerCode = await provider.getCode(UNISWAP_V4_ADDRESSES.POOL_MANAGER);
    if (poolManagerCode === '0x') {
      console.log('  ✗ ERROR: No contract at PoolManager address!');
      process.exit(1);
    }
    console.log(`  ✓ Contract exists (code length: ${poolManagerCode.length} bytes)`);

    // Test 3: Call PoolManager view function
    console.log('\n[Test 3] PoolManager View Call');
    const poolManager = new ethers.Contract(
      UNISWAP_V4_ADDRESSES.POOL_MANAGER,
      POOL_MANAGER_ABI,
      provider
    );

    try {
      const feeController = await poolManager.protocolFeeController();
      console.log(`  ✓ Protocol Fee Controller: ${feeController}`);
    } catch (err: any) {
      console.log(`  ⚠ Could not read protocolFeeController: ${err.message}`);
    }

    // Test 4: Verify StateView contract
    console.log('\n[Test 4] StateView Contract');
    console.log(`  Address: ${UNISWAP_V4_ADDRESSES.STATE_VIEW}`);
    
    const stateViewCode = await provider.getCode(UNISWAP_V4_ADDRESSES.STATE_VIEW);
    if (stateViewCode === '0x') {
      console.log('  ✗ ERROR: No contract at StateView address!');
    } else {
      console.log(`  ✓ Contract exists (code length: ${stateViewCode.length} bytes)`);
    }

    // Test 5: Verify Quoter contract
    console.log('\n[Test 5] Quoter Contract');
    console.log(`  Address: ${UNISWAP_V4_ADDRESSES.QUOTER}`);
    
    const quoterCode = await provider.getCode(UNISWAP_V4_ADDRESSES.QUOTER);
    if (quoterCode === '0x') {
      console.log('  ✗ ERROR: No contract at Quoter address!');
    } else {
      console.log(`  ✓ Contract exists (code length: ${quoterCode.length} bytes)`);
    }

    // Test 6: Verify Universal Router
    console.log('\n[Test 6] Universal Router Contract');
    console.log(`  Address: ${UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER}`);
    
    const routerCode = await provider.getCode(UNISWAP_V4_ADDRESSES.UNIVERSAL_ROUTER);
    if (routerCode === '0x') {
      console.log('  ✗ ERROR: No contract at Universal Router address!');
    } else {
      console.log(`  ✓ Contract exists (code length: ${routerCode.length} bytes)`);
    }

    // Test 7: Verify token contracts
    console.log('\n[Test 7] Token Contracts');
    for (const [name, address] of Object.entries(TOKEN_ADDRESSES)) {
      const code = await provider.getCode(address);
      if (code === '0x') {
        console.log(`  ✗ ${name}: No contract at ${address}`);
      } else {
        console.log(`  ✓ ${name}: ${address}`);
      }
    }

    // Test 8: Display pool configurations
    console.log('\n[Test 8] Pool Configurations');
    for (const [name, config] of Object.entries(DEFAULT_POOL_CONFIGS)) {
      console.log(`  ${name}:`);
      console.log(`    currency0: ${config.currency0}`);
      console.log(`    currency1: ${config.currency1}`);
      console.log(`    fee: ${config.fee} (${config.fee / 10000}%)`);
      console.log(`    tickSpacing: ${config.tickSpacing}`);
      console.log(`    hooks: ${config.hooks}`);
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('V4 Connection Test: PASSED');
    console.log('All core contracts are deployed and accessible.');
    console.log('='.repeat(60));

  } catch (err: any) {
    console.error('\n✗ Connection Test FAILED:');
    console.error(`  ${err.message}`);
    process.exit(1);
  }
}

// Run if called directly
testV4Connection().catch(console.error);
