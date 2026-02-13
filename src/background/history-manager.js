import { STORAGE, HISTORY } from '../shared/constants.js';

export class HistoryManager {
  // ───── Save Snapshot ─────

  async saveSnapshot(results) {
    const snapshots = await this._getSnapshots();

    const snapshot = {
      timestamp: Date.now(),
      nonFollowerIds: results.nonFollowers.map((u) => u.id),
      fanIds: results.fans.map((u) => u.id),
      mutualIds: results.mutuals.map((u) => u.id),
      stats: { ...results.stats },
    };

    snapshots.push(snapshot);

    // Keep only the most recent N snapshots
    while (snapshots.length > HISTORY.MAX_SNAPSHOTS) {
      snapshots.shift();
    }

    await chrome.storage.local.set({ [STORAGE.HISTORY_KEY]: snapshots });
    return snapshot;
  }

  // ───── Get History ─────

  async getHistory() {
    return this._getSnapshots();
  }

  // ───── Diff Computation ─────

  async getDiff() {
    const snapshots = await this._getSnapshots();
    if (snapshots.length < 2) return null;

    const current = snapshots[snapshots.length - 1];
    const previous = snapshots[snapshots.length - 2];

    return this._computeDiff(current, previous);
  }

  getDiffBetween(currentSnapshot, previousSnapshot) {
    return this._computeDiff(currentSnapshot, previousSnapshot);
  }

  _computeDiff(current, previous) {
    const prevNonFollowers = new Set(previous.nonFollowerIds);
    const currNonFollowers = new Set(current.nonFollowerIds);
    const prevFans = new Set(previous.fanIds);
    const currFans = new Set(current.fanIds);

    return {
      // Users who are now non-followers but weren't before
      newUnfollowerIds: current.nonFollowerIds.filter((id) => !prevNonFollowers.has(id)),
      // Users who were non-followers but now aren't (they followed back)
      regainedFollowerIds: previous.nonFollowerIds.filter((id) => !currNonFollowers.has(id)),
      // Users who are now fans but weren't before
      newFanIds: current.fanIds.filter((id) => !prevFans.has(id)),
      // Users who were fans but aren't anymore
      lostFanIds: previous.fanIds.filter((id) => !currFans.has(id)),
      previousTimestamp: previous.timestamp,
      currentTimestamp: current.timestamp,
      previousStats: previous.stats,
      currentStats: current.stats,
    };
  }

  // ───── Clear ─────

  async clearHistory() {
    await chrome.storage.local.remove(STORAGE.HISTORY_KEY);
  }

  // ───── Internal ─────

  async _getSnapshots() {
    const data = await chrome.storage.local.get(STORAGE.HISTORY_KEY);
    return data[STORAGE.HISTORY_KEY] || [];
  }
}
