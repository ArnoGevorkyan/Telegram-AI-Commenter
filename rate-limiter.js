/**
 * Rate Limiter Helper
 * 
 * This helper can be included in your Telegram auto-commenter scripts
 * to control the rate at which comments are posted, avoiding rate limits.
 */

class RateLimiter {
  constructor(options = {}) {
    // Maximum number of comments per hour
    this.maxPerHour = options.maxPerHour || 10;
    
    // Maximum number of comments per day
    this.maxPerDay = options.maxPerDay || 100;
    
    // Time window for hourly rate limiting (ms)
    this.hourWindow = 60 * 60 * 1000;
    
    // Time window for daily rate limiting (ms)
    this.dayWindow = 24 * 60 * 60 * 1000;
    
    // Comment history arrays with timestamps
    this.hourHistory = [];
    this.dayHistory = [];
    
    // Log settings
    this.verbose = options.verbose || false;
  }

  /**
   * Check if a new comment can be posted without exceeding rate limits
   * @returns {boolean} - Whether a new comment is allowed
   */
  canComment() {
    const now = Date.now();
    
    // Clean up old entries
    this.hourHistory = this.hourHistory.filter(time => now - time < this.hourWindow);
    this.dayHistory = this.dayHistory.filter(time => now - time < this.dayWindow);
    
    // Check if we're within limits
    const hourlyAllowed = this.hourHistory.length < this.maxPerHour;
    const dailyAllowed = this.dayHistory.length < this.maxPerDay;
    
    if (this.verbose) {
      console.log(`Rate limits: ${this.hourHistory.length}/${this.maxPerHour} hourly, ${this.dayHistory.length}/${this.maxPerDay} daily`);
    }
    
    return hourlyAllowed && dailyAllowed;
  }

  /**
   * Record a comment being posted
   */
  recordComment() {
    const now = Date.now();
    this.hourHistory.push(now);
    this.dayHistory.push(now);
    
    if (this.verbose) {
      console.log(`Comment recorded. New counts: ${this.hourHistory.length}/${this.maxPerHour} hourly, ${this.dayHistory.length}/${this.maxPerDay} daily`);
    }
  }

  /**
   * Calculate wait time until next comment is allowed
   * @returns {number} - Milliseconds to wait (0 if no wait needed)
   */
  getWaitTime() {
    if (this.canComment()) {
      return 0;
    }
    
    const now = Date.now();
    
    // Calculate time until a slot opens up in the hourly window
    let hourlyWait = 0;
    if (this.hourHistory.length >= this.maxPerHour) {
      hourlyWait = (this.hourHistory[0] + this.hourWindow) - now;
    }
    
    // Calculate time until a slot opens up in the daily window
    let dailyWait = 0;
    if (this.dayHistory.length >= this.maxPerDay) {
      dailyWait = (this.dayHistory[0] + this.dayWindow) - now;
    }
    
    // Return the longer wait time
    return Math.max(hourlyWait, dailyWait);
  }

  /**
   * Handle a new comment, waiting if necessary
   * @returns {Promise<boolean>} - Promise that resolves when comment can be made
   */
  async handleComment() {
    const waitTime = this.getWaitTime();
    
    if (waitTime > 0) {
      if (this.verbose) {
        console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
      }
      
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.handleComment(); // Recursively check again after waiting
    }
    
    this.recordComment();
    return true;
  }
}

export default RateLimiter; 