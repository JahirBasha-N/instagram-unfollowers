import { RATE_LIMIT } from '../shared/constants.js';

export class RateLimiter {
  constructor(config = RATE_LIMIT) {
    this.maxTokens = config.MAX_REQUESTS_PER_WINDOW;
    this.windowMs = config.WINDOW_MS;
    this.minDelay = config.MIN_DELAY_MS;
    this.maxDelay = config.MAX_DELAY_MS;
    this.cooldownMs = config.COOLDOWN_PAUSE_MS;
    this.pagesBeforeCooldown = config.PAGES_BEFORE_COOLDOWN;

    this.tokens = this.maxTokens;
    this.windowStart = Date.now();
    this.pageCount = 0;
  }

  _refillTokens() {
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.tokens = this.maxTokens;
      this.windowStart = now;
    }
  }

  _jitteredDelay() {
    return this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
  }

  async waitForSlot(signal) {
    this._refillTokens();

    // Cooldown pause every N pages
    this.pageCount++;
    if (this.pageCount > 0 && this.pageCount % this.pagesBeforeCooldown === 0) {
      await this._sleep(this.cooldownMs, signal);
    }

    // Wait if no tokens available
    if (this.tokens <= 0) {
      const waitTime = this.windowMs - (Date.now() - this.windowStart);
      if (waitTime > 0) {
        await this._sleep(waitTime, signal);
      }
      this._refillTokens();
    }

    // Jittered delay between requests
    await this._sleep(this._jitteredDelay(), signal);

    this.tokens--;
  }

  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason || new DOMException('Aborted', 'AbortError'));
        return;
      }

      const timer = setTimeout(resolve, ms);

      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(signal.reason || new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  reset() {
    this.tokens = this.maxTokens;
    this.windowStart = Date.now();
    this.pageCount = 0;
  }
}
