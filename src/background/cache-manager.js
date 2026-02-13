import { CACHE } from '../shared/constants.js';

export class CacheManager {
  constructor() {
    this.resultsKey = CACHE.STORAGE_KEY;
    this.progressKey = CACHE.PROGRESS_KEY;
    this.ttlMs = CACHE.TTL_MS;
    this.maxBytes = CACHE.MAX_STORAGE_BYTES;
  }

  async getResults() {
    const data = await chrome.storage.local.get(this.resultsKey);
    const entry = data[this.resultsKey];
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      await this.clearResults();
      return null;
    }

    return entry;
  }

  async setResults(results) {
    const payload = { ...results, timestamp: Date.now() };

    if (!this._checkSize(payload)) {
      // Strip profilePicUrl to fit under quota
      const stripped = this._stripHeavyFields(payload);
      await chrome.storage.local.set({ [this.resultsKey]: stripped });
      return;
    }

    await chrome.storage.local.set({ [this.resultsKey]: payload });
  }

  async clearResults() {
    await chrome.storage.local.remove(this.resultsKey);
  }

  /**
   * Save progress with cursor for mid-list resume.
   * Shape: { following, followingComplete, followingCursor,
   *          followers, followersComplete, followersCursor, timestamp }
   */
  async saveProgress(progress) {
    const payload = { ...progress, timestamp: Date.now() };

    if (!this._checkSize(payload)) {
      // Strip pic URLs from partial progress to fit
      const stripped = this._stripHeavyFields(payload);
      await chrome.storage.local.set({ [this.progressKey]: stripped });
      return;
    }

    await chrome.storage.local.set({ [this.progressKey]: payload });
  }

  async getProgress() {
    const data = await chrome.storage.local.get(this.progressKey);
    const entry = data[this.progressKey];
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      await this.clearProgress();
      return null;
    }

    return entry;
  }

  async clearProgress() {
    await chrome.storage.local.remove(this.progressKey);
  }

  async clearAll() {
    await chrome.storage.local.remove([this.resultsKey, this.progressKey]);
  }

  _checkSize(obj) {
    try {
      const json = JSON.stringify(obj);
      return json.length * 2 < this.maxBytes; // UTF-16 ≈ 2 bytes/char
    } catch {
      return false;
    }
  }

  _stripHeavyFields(payload) {
    const strip = (users) =>
      users?.map((u) => ({ ...u, profilePicUrl: '' })) ?? [];

    return {
      ...payload,
      following: strip(payload.following),
      followers: strip(payload.followers),
      nonFollowers: strip(payload.nonFollowers),
      fans: strip(payload.fans),
      mutuals: strip(payload.mutuals),
    };
  }
}
