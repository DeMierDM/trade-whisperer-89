// Time and date formatting utilities for trading application

export interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Format a timestamp to Eastern Time (ET) time string
 * @param timestamp - ISO timestamp or Date object
 * @returns Formatted time string (e.g., "09:30 AM ET")
 */
export const formatTimeET = (timestamp: string | Date): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

  return date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }) + ' ET';
};

/**
 * Format a timestamp to Eastern Time (ET) date string
 * @param timestamp - ISO timestamp or Date object
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export const formatDateET = (timestamp: string | Date): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

  return date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

/**
 * Format a timestamp to full Eastern Time (ET) datetime string
 * @param timestamp - ISO timestamp or Date object
 * @returns Formatted datetime string (e.g., "Jan 15, 2024 09:30 AM ET")
 */
export const formatDateTimeET = (timestamp: string | Date): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;

  const dateStr = date.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return `${dateStr} ${timeStr} ET`;
};

/**
 * Check if market is open (9:30 AM - 4:00 PM ET on weekdays)
 * @param timestamp - ISO timestamp or Date object (defaults to now)
 * @returns True if market is open
 */
export const isMarketOpen = (timestamp?: string | Date): boolean => {
  const date = timestamp
    ? (typeof timestamp === 'string' ? new Date(timestamp) : timestamp)
    : new Date();

  // Get day of week in ET
  const dayOfWeek = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();

  // Weekend check (0 = Sunday, 6 = Saturday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }

  // Get time in ET
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });

  const [hours, minutes] = timeStr.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;

  // Market hours: 9:30 AM (570 minutes) to 4:00 PM (960 minutes)
  return timeInMinutes >= 570 && timeInMinutes <= 960;
};

/**
 * Normalize timestamp to minute epoch (round down to nearest minute)
 * @param timestamp - ISO timestamp or Date object
 * @returns ISO timestamp rounded to nearest minute
 */
export const normalizeToMinute = (timestamp: string | Date): string => {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const normalized = new Date(Math.floor(date.getTime() / 60000) * 60000);
  return normalized.toISOString();
};
