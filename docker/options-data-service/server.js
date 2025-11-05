const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const redis = require('redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3003;

// Initialize Redis client for caching
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => {
    console.log('Redis Client Error', err);
});

// Connect to Redis
redisClient.connect().catch(console.error);

// Middleware
app.use(cors());
app.use(express.json());

// Alpaca API configuration
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

// Default tickers for options data
const DEFAULT_TICKERS = ['SPY', 'IWM', 'QQQ'];

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'options-data-service',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// Get option chains for specific ticker
app.get('/api/options/chain/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const cacheKey = `options_chain_${ticker}`;
        
        // Try to get from cache first
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // Fetch from Alpaca API
        const response = await fetch(`${ALPACA_DATA_URL}/v1beta1/options/meta/exchanges`, {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Alpaca API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Cache for 5 minutes
        await redisClient.setEx(cacheKey, 300, JSON.stringify(data));
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching option chain:', error);
        res.status(500).json({ error: 'Failed to fetch option chain' });
    }
});

// Get historical options data
app.get('/api/options/bars/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const { start, end, strikes } = req.query;
        
        const cacheKey = `options_bars_${ticker}_${start}_${end}`;
        
        // Try to get from cache first
        const cached = await redisClient.get(cacheKey);
        if (cached) {
            return res.json(JSON.parse(cached));
        }

        // Build Alpaca options bars URL
        const url = new URL(`${ALPACA_DATA_URL}/v1beta1/options/bars`);
        url.searchParams.append('symbols', ticker);
        if (start) url.searchParams.append('start', start);
        if (end) url.searchParams.append('end', end);
        if (strikes) url.searchParams.append('strikes', strikes);

        const response = await fetch(url.toString(), {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Alpaca API error: ${response.status}`);
        }

        const data = await response.json();
        
        // Cache for 1 hour
        await redisClient.setEx(cacheKey, 3600, JSON.stringify(data));
        
        res.json(data);
    } catch (error) {
        console.error('Error fetching options bars:', error);
        res.status(500).json({ error: 'Failed to fetch options bars' });
    }
});

// Get real-time options quotes
app.get('/api/options/quotes/:ticker', async (req, res) => {
    try {
        const { ticker } = req.params;
        const { strikes } = req.query;
        
        // Build Alpaca options quotes URL
        const url = new URL(`${ALPACA_DATA_URL}/v1beta1/options/latest/quotes`);
        url.searchParams.append('symbols', ticker);
        if (strikes) url.searchParams.append('strikes', strikes);

        const response = await fetch(url.toString(), {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
            }
        });

        if (!response.ok) {
            throw new Error(`Alpaca API error: ${response.status}`);
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching options quotes:', error);
        res.status(500).json({ error: 'Failed to fetch options quotes' });
    }
});

// Bulk data endpoint for multiple tickers
app.post('/api/options/bulk', async (req, res) => {
    try {
        const { tickers = DEFAULT_TICKERS, dataType = 'quotes' } = req.body;
        
        const results = {};
        
        for (const ticker of tickers) {
            try {
                let endpoint;
                switch (dataType) {
                    case 'quotes':
                        endpoint = `/api/options/quotes/${ticker}`;
                        break;
                    case 'chain':
                        endpoint = `/api/options/chain/${ticker}`;
                        break;
                    case 'bars':
                        endpoint = `/api/options/bars/${ticker}`;
                        break;
                    default:
                        throw new Error(`Invalid data type: ${dataType}`);
                }
                
                // Make internal request to our own endpoints
                const response = await fetch(`http://localhost:${PORT}${endpoint}`);
                results[ticker] = await response.json();
            } catch (error) {
                results[ticker] = { error: error.message };
            }
        }
        
        res.json(results);
    } catch (error) {
        console.error('Error in bulk options request:', error);
        res.status(500).json({ error: 'Failed to process bulk request' });
    }
});

// Cache management endpoints
app.delete('/api/cache/:pattern', async (req, res) => {
    try {
        const { pattern } = req.params;
        const keys = await redisClient.keys(pattern);
        
        if (keys.length > 0) {
            await redisClient.del(keys);
        }
        
        res.json({ 
            message: `Cleared ${keys.length} cache entries`,
            pattern: pattern 
        });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Options Data Service running on port ${PORT}`);
    console.log(`📊 Serving data for: ${DEFAULT_TICKERS.join(', ')}`);
    console.log(`🔴 Environment: ${process.env.NODE_ENV || 'development'}`);
});