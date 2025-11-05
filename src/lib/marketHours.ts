// Market hours utility for US stock market (NYSE/NASDAQ)
export interface MarketStatus {
  isOpen: boolean;
  status: 'open' | 'closed' | 'pre-market' | 'after-hours';
  nextOpen?: Date;
  nextClose?: Date;
}

export const getMarketStatus = (): MarketStatus => {
  const now = new Date();
  
  // Convert to ET timezone
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const day = etTime.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) {
    return {
      isOpen: false,
      status: 'closed',
    };
  }
  
  const currentMinutes = hours * 60 + minutes;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  const preMarketStart = 4 * 60; // 4:00 AM
  const afterHoursEnd = 20 * 60; // 8:00 PM
  
  if (currentMinutes >= marketOpen && currentMinutes < marketClose) {
    return {
      isOpen: true,
      status: 'open',
    };
  } else if (currentMinutes >= preMarketStart && currentMinutes < marketOpen) {
    return {
      isOpen: false,
      status: 'pre-market',
    };
  } else if (currentMinutes >= marketClose && currentMinutes < afterHoursEnd) {
    return {
      isOpen: false,
      status: 'after-hours',
    };
  }
  
  return {
    isOpen: false,
    status: 'closed',
  };
};

export const getLastTradingDay = (daysBack: number = 0): Date => {
  const date = new Date();
  let count = 0;
  
  while (count < daysBack + 1) {
    date.setDate(date.getDate() - 1);
    const day = date.getDay();
    // Skip weekends
    if (day !== 0 && day !== 6) {
      count++;
    }
  }
  
  return date;
};

export const getMarketOpenTime = (date: Date = new Date()): Date => {
  const marketDate = new Date(date);
  marketDate.setHours(9, 30, 0, 0);
  return new Date(marketDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
};

export const getMarketCloseTime = (date: Date = new Date()): Date => {
  const marketDate = new Date(date);
  marketDate.setHours(16, 0, 0, 0);
  return new Date(marketDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
};
