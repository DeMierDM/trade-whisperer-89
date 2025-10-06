/**
 * Helper functions for options data simulation
 * Used when paper trading accounts don't have access to real options data
 */

/**
 * Generate simulated options chain based on underlying stock price
 * Following Python's options chain structure
 */
export function generateSimulatedOptionsChain(
  symbol: string,
  stockPrice: number,
  targetExpiration?: string
): any[] {
  const contracts: any[] = [];
  const today = new Date();
  
  // Generate expirations (next 4 monthly expirations)
  const expirations: Date[] = [];
  if (targetExpiration) {
    expirations.push(new Date(targetExpiration));
  } else {
    for (let i = 0; i < 4; i++) {
      const expDate = new Date(today);
      expDate.setMonth(expDate.getMonth() + i + 1);
      // Set to third Friday of the month
      expDate.setDate(15);
      while (expDate.getDay() !== 5) {
        expDate.setDate(expDate.getDate() + 1);
      }
      expirations.push(expDate);
    }
  }
  
  // Generate strikes around current price (±20%)
  const strikeRange = stockPrice * 0.2;
  const strikeStep = stockPrice > 100 ? 5 : 1;
  const minStrike = Math.floor((stockPrice - strikeRange) / strikeStep) * strikeStep;
  const maxStrike = Math.ceil((stockPrice + strikeRange) / strikeStep) * strikeStep;
  
  for (const expiration of expirations) {
    const daysToExpiry = Math.floor((expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const expiryStr = expiration.toISOString().split('T')[0];
    
    for (let strike = minStrike; strike <= maxStrike; strike += strikeStep) {
      // Calculate theoretical option prices (Black-Scholes approximation)
      const moneyness = strike / stockPrice;
      const timeValue = Math.sqrt(daysToExpiry / 365) * stockPrice * 0.2; // Assume 20% IV
      
      // Call option
      const callValue = Math.max(0, stockPrice - strike) + timeValue * (2 - moneyness);
      contracts.push({
        symbol: `${symbol}${expiration.toISOString().slice(2, 10).replace(/-/g, '')}C${String(strike * 1000).padStart(8, '0')}`,
        underlying_symbol: symbol,
        expiration_date: expiryStr,
        strike_price: strike,
        option_type: 'call',
        contract_type: 'call',
        exercise_style: 'american',
        shares_per_contract: 100,
        primary_exchange: 'OPRA',
        open_interest: Math.floor(Math.random() * 10000) + 100,
        close_price: Math.max(0.05, callValue),
        tradable: true,
        simulated: true
      });
      
      // Put option
      const putValue = Math.max(0, strike - stockPrice) + timeValue * moneyness;
      contracts.push({
        symbol: `${symbol}${expiration.toISOString().slice(2, 10).replace(/-/g, '')}P${String(strike * 1000).padStart(8, '0')}`,
        underlying_symbol: symbol,
        expiration_date: expiryStr,
        strike_price: strike,
        option_type: 'put',
        contract_type: 'put',
        exercise_style: 'american',
        shares_per_contract: 100,
        primary_exchange: 'OPRA',
        open_interest: Math.floor(Math.random() * 10000) + 100,
        close_price: Math.max(0.05, putValue),
        tradable: true,
        simulated: true
      });
    }
  }
  
  return contracts;
}

/**
 * Generate simulated option bars from underlying stock bars
 * Following Python's option bars structure
 */
export function generateSimulatedOptionBars(
  optionSymbol: string,
  stockBars: any[]
): any[] {
  if (!stockBars || stockBars.length === 0) return [];
  
  // Extract strike price and type from OCC symbol
  const strikeMatch = optionSymbol.match(/[CP](\d{8})$/);
  if (!strikeMatch) return [];
  
  const strike = parseInt(strikeMatch[1]) / 1000;
  const isCall = optionSymbol.includes('C');
  
  return stockBars.map((bar: any) => {
    const stockPrice = bar.c || bar.close;
    
    // Calculate intrinsic value
    const intrinsic = isCall 
      ? Math.max(0, stockPrice - strike)
      : Math.max(0, strike - stockPrice);
    
    // Add time value (simplified)
    const timeValue = stockPrice * 0.03; // ~3% of stock price
    const optionPrice = intrinsic + timeValue;
    
    // Simulate option bar with spreads
    const spread = optionPrice * 0.02; // 2% spread
    
    return {
      t: bar.t || bar.timestamp,
      o: Math.max(0.05, optionPrice - spread / 2),
      h: Math.max(0.05, optionPrice + spread),
      l: Math.max(0.05, optionPrice - spread),
      c: Math.max(0.05, optionPrice),
      v: Math.floor((bar.v || 0) / 100), // Scale down volume
      n: bar.n || 1,
      vw: Math.max(0.05, optionPrice),
      simulated: true
    };
  });
}
