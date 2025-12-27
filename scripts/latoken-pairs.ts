import ccxt from 'ccxt';

async function main() {
  const exchange = new ccxt.latoken({ enableRateLimit: true });
  
  console.log('Loading LATOKEN markets...');
  const markets = await exchange.loadMarkets();
  
  const symbols = Object.keys(markets);
  console.log(`Total markets: ${symbols.length}`);
  
  // Find CSR-related pairs
  const csrPairs = symbols.filter(s => /csr/i.test(s));
  console.log('\nCSR-related pairs:', csrPairs);
  
  // Show details for CSR pairs
  for (const symbol of csrPairs) {
    const market = markets[symbol];
    console.log(`\n${symbol}:`, {
      id: market.id,
      base: market.base,
      quote: market.quote,
      active: market.active,
    });
  }
  
  // Show first 20 USDT pairs for reference
  const usdtPairs = symbols.filter(s => /\/USDT$/i.test(s)).slice(0, 20);
  console.log('\nFirst 20 USDT pairs:', usdtPairs);
}

main().catch(console.error);
