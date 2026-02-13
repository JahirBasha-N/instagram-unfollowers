import { STORAGE } from '../shared/constants.js';

const DEFAULT_SETTINGS = {
  theme: 'system',
  notifyOnComplete: true,
  historyMaxSnapshots: 20,
  defaultTab: 'nonFollowers',
  defaultSort: 'username-asc',
};

export class StorageManager {
  // ───── Settings ─────

  async getSettings() {
    const data = await chrome.storage.local.get(STORAGE.SETTINGS_KEY);
    return { ...DEFAULT_SETTINGS, ...(data[STORAGE.SETTINGS_KEY] || {}) };
  }

  async updateSettings(partial) {
    const current = await this.getSettings();
    const updated = { ...current, ...partial };
    await chrome.storage.local.set({ [STORAGE.SETTINGS_KEY]: updated });
    return updated;
  }

  // ───── Whitelist ─────

  async getWhitelist() {
    const data = await chrome.storage.local.get(STORAGE.WHITELIST_KEY);
    // Array of { id, username }
    return data[STORAGE.WHITELIST_KEY] || [];
  }

  async addToWhitelist(user) {
    const list = await this.getWhitelist();
    if (list.some((u) => u.id === user.id)) return list;
    list.push({ id: user.id, username: user.username });
    await chrome.storage.local.set({ [STORAGE.WHITELIST_KEY]: list });
    return list;
  }

  async removeFromWhitelist(userId) {
    let list = await this.getWhitelist();
    list = list.filter((u) => u.id !== userId);
    await chrome.storage.local.set({ [STORAGE.WHITELIST_KEY]: list });
    return list;
  }

  // ───── Storage Usage ─────

  async getStorageUsage() {
    const bytesInUse = await chrome.storage.local.getBytesInUse(null);
    const keys = [
      STORAGE.SETTINGS_KEY,
      STORAGE.WHITELIST_KEY,
      STORAGE.HISTORY_KEY,
      'instaunfollowers_results',
      'instaunfollowers_progress',
    ];

    const breakdown = {};
    for (const key of keys) {
      breakdown[key] = await chrome.storage.local.getBytesInUse(key);
    }

    return {
      totalBytes: bytesInUse,
      maxBytes: 10 * 1024 * 1024, // chrome.storage.local quota
      breakdown,
    };
  }

  // ───── Clear All ─────

  async clearAllData() {
    await chrome.storage.local.clear();
  }
}
