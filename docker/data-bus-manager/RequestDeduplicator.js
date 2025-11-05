/**
 * RequestDeduplicator
 * Prevents duplicate API requests by caching and queuing
 */

class RequestDeduplicator {
  constructor(options = {}) {
    this.pendingRequests = new Map();
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 30000; // 30 seconds default
    this.maxCacheSize = options.maxCacheSize || 1000;

    // Periodically clean up old cache entries
    this.cleanupInterval = setInterval(() => this.cleanupCache(), 60000);

    console.log('✅ RequestDeduplicator initialized with TTL:', this.cacheTTL, 'ms');
  }

  /**
   * Generate a unique key for a request
   */
  generateKey(method, params) {
    return `${method}:${JSON.stringify(params)}`;
  }

  /**
   * Check if request is currently pending
   */
  isPending(key) {
    return this.pendingRequests.has(key);
  }

  /**
   * Wait for a pending request to complete
   */
  async waitFor(key) {
    if (this.pendingRequests.has(key)) {
      console.log('⏳ Waiting for pending request:', key.substring(0, 50));
      return this.pendingRequests.get(key);
    }
    return null;
  }

  /**
   * Execute a request with deduplication
   */
  async execute(key, requestFn) {
    // Check cache first
    if (this.cache.has(key)) {
      const cached = this.cache.get(key);
      const age = Date.now() - cached.timestamp;

      if (age < this.cacheTTL) {
        console.log(`💾 Cache hit for ${key.substring(0, 50)} (age: ${age}ms)`);
        return cached.data;
      } else {
        // Remove stale cache entry
        this.cache.delete(key);
      }
    }

    // Check if request is already pending
    if (this.pendingRequests.has(key)) {
      console.log(`🔄 Request already pending: ${key.substring(0, 50)}`);
      return this.pendingRequests.get(key);
    }

    // Execute new request
    console.log(`🚀 Executing new request: ${key.substring(0, 50)}`);

    const promise = requestFn()
      .then(result => {
        // Cache the result
        this.cacheResult(key, result);
        return result;
      })
      .catch(error => {
        console.error(`❌ Request failed: ${key.substring(0, 50)}`, error.message);
        throw error;
      })
      .finally(() => {
        // Remove from pending
        this.pendingRequests.delete(key);
      });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Cache a result
   */
  cacheResult(key, data) {
    // Enforce max cache size
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clean up stale cache entries
   */
  cleanupCache() {
    const now = Date.now();
    let removed = 0;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`🧹 Cleaned up ${removed} stale cache entries`);
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      pendingRequests: this.pendingRequests.size,
      cachedEntries: this.cache.size,
      cacheTTL: this.cacheTTL,
      maxCacheSize: this.maxCacheSize
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
    this.pendingRequests.clear();
    console.log('🛑 RequestDeduplicator destroyed');
  }
}

module.exports = RequestDeduplicator;
