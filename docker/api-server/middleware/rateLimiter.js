/**
 * Rate Limiting Middleware
 * Prevents API abuse and protects against DDoS attacks
 */

const { RateLimitError } = require('./errorHandler');

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60000; // 1 minute default
    this.maxRequests = options.maxRequests || 200; // 200 requests per minute default
    this.store = new Map();
    this.enabled = options.enabled !== false;
    
    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  middleware() {
    return (req, res, next) => {
      if (!this.enabled) {
        return next();
      }

      const key = this.getKey(req);
      const now = Date.now();
      const windowStart = now - this.windowMs;

      // Get or create client record
      let clientData = this.store.get(key);
      if (!clientData) {
        clientData = { requests: [], blocked: false };
        this.store.set(key, clientData);
      }

      // Remove requests outside the time window
      clientData.requests = clientData.requests.filter(
        timestamp => timestamp > windowStart
      );

      // Check if rate limit exceeded
      if (clientData.requests.length >= this.maxRequests) {
        console.warn(`⚠️ [RATE LIMIT] ${key} exceeded limit (${clientData.requests.length}/${this.maxRequests})`);
        
        // Block for 5 minutes after exceeding limit
        clientData.blocked = true;
        setTimeout(() => {
          clientData.blocked = false;
        }, 300000);

        throw new RateLimitError(
          `Too many requests. Limit: ${this.maxRequests} requests per ${this.windowMs / 1000} seconds`
        );
      }

      // Check if client is blocked
      if (clientData.blocked) {
        throw new RateLimitError('Client temporarily blocked due to rate limit violation');
      }

      // Record this request
      clientData.requests.push(now);

      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', this.maxRequests - clientData.requests.length);
      res.setHeader('X-RateLimit-Reset', new Date(now + this.windowMs).toISOString());

      next();
    };
  }

  getKey(req) {
    // Use IP address as key (could also use user ID for authenticated requests)
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0] : req.socket.remoteAddress;
    return ip || 'unknown';
  }

  cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    for (const [key, clientData] of this.store.entries()) {
      // Remove old requests
      clientData.requests = clientData.requests.filter(
        timestamp => timestamp > windowStart
      );

      // Remove empty entries
      if (clientData.requests.length === 0 && !clientData.blocked) {
        this.store.delete(key);
      }
    }
  }

  reset(key) {
    this.store.delete(key);
  }

  resetAll() {
    this.store.clear();
  }
}

// Create default rate limiter instances
const globalLimiter = new RateLimiter({
  windowMs: 60000,      // 1 minute
  maxRequests: 200,     // 200 requests per minute
  enabled: true
});

const strictLimiter = new RateLimiter({
  windowMs: 60000,      // 1 minute
  maxRequests: 30,      // 30 requests per minute (for expensive operations)
  enabled: true
});

const websocketLimiter = new RateLimiter({
  windowMs: 1000,       // 1 second
  maxRequests: 100,     // 100 messages per second
  enabled: true
});

module.exports = {
  RateLimiter,
  globalLimiter,
  strictLimiter,
  websocketLimiter
};
