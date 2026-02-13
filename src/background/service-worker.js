import { MSG, PORT_NAME } from '../shared/message-types.js';
import { KEEPALIVE } from '../shared/constants.js';
import { CancelledError, serializeError } from '../shared/errors.js';
import { InstagramAPI } from './instagram-api.js';
import { CacheManager } from './cache-manager.js';
import { StorageManager } from './storage-manager.js';
import { HistoryManager } from './history-manager.js';
import { generateResults } from './comparison-engine.js';

const api = new InstagramAPI();
const cache = new CacheManager();
const storage = new StorageManager();
const history = new HistoryManager();
let activeScan = false;
let scanStartTime = 0;

// Track the most recently connected popup port.
// All scan-related messages (progress, completion, error) are sent to this port
// so that reconnecting popups automatically receive updates.
let activePort = null;

// Track last scan progress so we can immediately send it to reconnecting popups.
let lastScanProgress = null;

// Grant content scripts access to chrome.storage.session.
// Scoped only to instagram.com via manifest content_scripts.matches.
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });

// ───── Keepalive ─────
// MV3 service workers are terminated after ~30s of inactivity.
// During long scans with rate-limit sleeps, we need to keep it alive.

function startKeepalive() {
  chrome.alarms.create(KEEPALIVE.ALARM_NAME, {
    periodInMinutes: KEEPALIVE.INTERVAL_MINUTES,
  });
}

function stopKeepalive() {
  chrome.alarms.clear(KEEPALIVE.ALARM_NAME);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEPALIVE.ALARM_NAME) {
    // No-op — the alarm firing is enough to wake/keep-alive the SW
  }
});

// ───── Port Communication ─────

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;

  // Always track the latest popup port so scan messages reach it.
  activePort = port;

  // If a scan is in progress, immediately send current progress to the new popup.
  if (activeScan && lastScanProgress) {
    send(port, MSG.SCAN_PROGRESS, lastScanProgress);
  }

  port.onMessage.addListener(async (msg) => {
    switch (msg.type) {
      case MSG.START_SCAN:
        // If a scan is already running, send current progress instead of erroring.
        // The popup will transition to scanning state.
        if (activeScan) {
          if (lastScanProgress) {
            send(port, MSG.SCAN_PROGRESS, lastScanProgress);
          }
          return;
        }
        await handleStartScan();
        break;
      case MSG.CANCEL_SCAN:
        handleCancelScan();
        break;
      case MSG.GET_CACHED_RESULTS:
        await handleGetCached(port);
        break;
      case MSG.CLEAR_CACHE:
        await handleClearCache(port);
        break;

      // Settings
      case MSG.GET_SETTINGS:
        await handleGetSettings(port);
        break;
      case MSG.UPDATE_SETTINGS:
        await handleUpdateSettings(port, msg);
        break;

      // Whitelist
      case MSG.GET_WHITELIST:
        await handleGetWhitelist(port);
        break;
      case MSG.ADD_TO_WHITELIST:
        await handleAddToWhitelist(port, msg);
        break;
      case MSG.REMOVE_FROM_WHITELIST:
        await handleRemoveFromWhitelist(port, msg);
        break;

      // History
      case MSG.GET_HISTORY:
        await handleGetHistory(port);
        break;
      case MSG.GET_HISTORY_DIFF:
        await handleGetHistoryDiff(port);
        break;
      case MSG.CLEAR_HISTORY:
        await handleClearHistory(port);
        break;

      // Follow/Unfollow
      case MSG.UNFOLLOW_USER:
        await handleUnfollowUser(port, msg);
        break;
      case MSG.FOLLOW_USER:
        await handleFollowUser(port, msg);
        break;

      // Storage
      case MSG.GET_STORAGE_USAGE:
        await handleGetStorageUsage(port);
        break;
      case MSG.CLEAR_ALL_DATA:
        await handleClearAllData(port);
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    // Clear activePort if this is the one that disconnected.
    // Don't cancel scan — let it finish in background.
    if (activePort === port) {
      activePort = null;
    }
  });
});

// ───── Scan Orchestration ─────

async function handleStartScan() {
  activeScan = true;
  scanStartTime = Date.now();
  startKeepalive();

  try {
    const { userId, csrfToken } = await api.getSessionData();
    const signal = api.startScan();

    // Load whitelist for filtering
    const whitelistArr = await storage.getWhitelist();
    const whitelist = new Set(whitelistArr.map((u) => u.id));

    // Check for cached results first
    const cached = await cache.getResults();
    if (cached) {
      sendToActivePort(MSG.SCAN_COMPLETE, { results: cached, fromCache: true });
      return;
    }

    // Check for resumable partial progress
    const progress = await cache.getProgress();

    // ── Phase 1: Fetch following ──
    let following = progress?.following || [];
    let followingComplete = progress?.followingComplete || false;

    sendScanProgress({
      phase: 'following',
      count: following.length,
      page: 0,
      resumed: following.length > 0,
      elapsed: Date.now() - scanStartTime,
    });

    if (!followingComplete) {
      // Resume from cursor if available
      const cursor = progress?.followingCursor || null;
      const result = await api.fetchUsersFrom(
        userId, csrfToken, 'following', cursor, signal,
        (p) => sendScanProgress({
          phase: 'following',
          count: following.length + p.count,
          page: p.page,
          elapsed: Date.now() - scanStartTime,
        }),
      );

      following = [...following, ...result.users];
      followingComplete = result.complete;

      // Persist progress with cursor for crash resilience
      await cache.saveProgress({
        following,
        followingComplete,
        followingCursor: result.nextMaxId,
        followers: [],
        followersComplete: false,
        followersCursor: null,
      });
    }

    // ── Phase 2: Fetch followers ──
    let followers = progress?.followers || [];
    let followersComplete = progress?.followersComplete || false;

    sendScanProgress({
      phase: 'followers',
      count: followers.length,
      page: 0,
      resumed: followers.length > 0,
      elapsed: Date.now() - scanStartTime,
    });

    if (!followersComplete) {
      const cursor = progress?.followersCursor || null;
      const result = await api.fetchUsersFrom(
        userId, csrfToken, 'followers', cursor, signal,
        (p) => sendScanProgress({
          phase: 'followers',
          count: followers.length + p.count,
          page: p.page,
          elapsed: Date.now() - scanStartTime,
        }),
      );

      followers = [...followers, ...result.users];
      followersComplete = result.complete;

      await cache.saveProgress({
        following,
        followingComplete: true,
        followingCursor: null,
        followers,
        followersComplete,
        followersCursor: result.nextMaxId,
      });
    }

    // ── Phase 3: Compare ──
    sendScanProgress({ phase: 'comparing', elapsed: Date.now() - scanStartTime });
    const results = generateResults(following, followers, whitelist);

    // Cache final results, clear progress
    await cache.setResults(results);
    await cache.clearProgress();

    // Save history snapshot
    try {
      await history.saveSnapshot(results);
    } catch {
      // Non-critical — don't fail the scan if history save fails
    }

    const scanDuration = Date.now() - scanStartTime;
    sendToActivePort(MSG.SCAN_COMPLETE, { results, fromCache: false, scanDuration });
  } catch (err) {
    if (err.name === 'AbortError' || err instanceof CancelledError) {
      sendToActivePort(MSG.SCAN_CANCELLED, {});
    } else {
      sendToActivePort(MSG.SCAN_ERROR, { error: serializeError(err) });
    }
  } finally {
    activeScan = false;
    lastScanProgress = null;
    stopKeepalive();
  }
}

function handleCancelScan() {
  api.cancelScan();
  activeScan = false;
  lastScanProgress = null;
  stopKeepalive();
  sendToActivePort(MSG.SCAN_CANCELLED, {});
}

async function handleGetCached(port) {
  try {
    const cached = await cache.getResults();
    send(port, MSG.SCAN_COMPLETE, {
      results: cached || null,
      fromCache: Boolean(cached),
    });
  } catch (err) {
    send(port, MSG.SCAN_ERROR, { error: serializeError(err) });
  }
}

async function handleClearCache(port) {
  await cache.clearAll();
  send(port, MSG.SCAN_COMPLETE, { results: null, fromCache: false });
}

// ───── Settings Handlers ─────

async function handleGetSettings(port) {
  const settings = await storage.getSettings();
  send(port, MSG.SETTINGS_UPDATED, { settings });
}

async function handleUpdateSettings(port, msg) {
  const settings = await storage.updateSettings(msg.settings);
  send(port, MSG.SETTINGS_UPDATED, { settings });
}

// ───── Whitelist Handlers ─────

async function handleGetWhitelist(port) {
  const whitelist = await storage.getWhitelist();
  send(port, MSG.WHITELIST_UPDATED, { whitelist });
}

async function handleAddToWhitelist(port, msg) {
  const whitelist = await storage.addToWhitelist(msg.user);
  send(port, MSG.WHITELIST_UPDATED, { whitelist });
}

async function handleRemoveFromWhitelist(port, msg) {
  const whitelist = await storage.removeFromWhitelist(msg.userId);
  send(port, MSG.WHITELIST_UPDATED, { whitelist });
}

// ───── History Handlers ─────

async function handleGetHistory(port) {
  const snapshots = await history.getHistory();
  send(port, MSG.GET_HISTORY, { snapshots });
}

async function handleGetHistoryDiff(port) {
  const diff = await history.getDiff();
  send(port, MSG.GET_HISTORY_DIFF, { diff });
}

async function handleClearHistory(port) {
  await history.clearHistory();
  send(port, MSG.GET_HISTORY, { snapshots: [] });
}

// ───── Follow/Unfollow Handlers ─────

async function handleUnfollowUser(port, msg) {
  try {
    const { csrfToken } = await api.getSessionData();
    await api.unfollowUser(msg.targetUserId, csrfToken);

    // Update cached results locally
    const cached = await cache.getResults();
    if (cached) {
      const user = findAndRemoveUser(cached, msg.targetUserId);
      if (user) {
        // If they were a mutual, they become a fan (they still follow us)
        if (msg.fromTab === 'mutuals') {
          cached.fans.push(user);
          cached.stats.fansCount = cached.fans.length;
        }
        cached.stats.nonFollowersCount = cached.nonFollowers.length;
        cached.stats.mutualsCount = cached.mutuals.length;
        await cache.setResults(cached);
      }
    }

    send(port, MSG.USER_ACTION_SUCCESS, {
      action: 'unfollow',
      targetUserId: msg.targetUserId,
      fromTab: msg.fromTab,
    });
  } catch (err) {
    send(port, MSG.USER_ACTION_ERROR, {
      action: 'unfollow',
      targetUserId: msg.targetUserId,
      error: serializeError(err),
    });
  }
}

async function handleFollowUser(port, msg) {
  try {
    const { csrfToken } = await api.getSessionData();
    await api.followUser(msg.targetUserId, csrfToken);

    // Update cached results locally
    const cached = await cache.getResults();
    if (cached) {
      const user = findAndRemoveUser(cached, msg.targetUserId);
      if (user) {
        // If they were a fan, they become a mutual (we now both follow each other)
        if (msg.fromTab === 'fans') {
          cached.mutuals.push(user);
          cached.stats.mutualsCount = cached.mutuals.length;
        }
        cached.stats.fansCount = cached.fans.length;
        cached.stats.nonFollowersCount = cached.nonFollowers.length;
        await cache.setResults(cached);
      }
    }

    send(port, MSG.USER_ACTION_SUCCESS, {
      action: 'follow',
      targetUserId: msg.targetUserId,
      fromTab: msg.fromTab,
    });
  } catch (err) {
    send(port, MSG.USER_ACTION_ERROR, {
      action: 'follow',
      targetUserId: msg.targetUserId,
      error: serializeError(err),
    });
  }
}

/**
 * Find a user across all result arrays and remove them.
 * Returns the user object if found, null otherwise.
 */
function findAndRemoveUser(cached, userId) {
  for (const list of ['nonFollowers', 'fans', 'mutuals']) {
    const idx = cached[list].findIndex((u) => u.id === userId);
    if (idx !== -1) {
      return cached[list].splice(idx, 1)[0];
    }
  }
  return null;
}

// ───── Storage Handlers ─────

async function handleGetStorageUsage(port) {
  const usage = await storage.getStorageUsage();
  send(port, MSG.GET_STORAGE_USAGE, { usage });
}

async function handleClearAllData(port) {
  await storage.clearAllData();
  send(port, MSG.CLEAR_ALL_DATA, {});
}

// ───── Helpers ─────

/**
 * Send a message to a specific port (for request-response handlers).
 */
function send(port, type, data) {
  try {
    port.postMessage({ type, ...data });
  } catch {
    // Port disconnected — ignore for request-response messages
  }
}

/**
 * Send a scan-related message to the active port (the most recently connected popup).
 * If the port is disconnected, fires a notification for completed scans.
 */
function sendToActivePort(type, data) {
  if (!activePort) {
    // No popup connected — fire notification if scan completed
    if (type === MSG.SCAN_COMPLETE && data?.results && !data?.fromCache) {
      fireCompletionNotification(data.results.stats);
    }
    return;
  }
  try {
    activePort.postMessage({ type, ...data });
  } catch {
    activePort = null;
    if (type === MSG.SCAN_COMPLETE && data?.results && !data?.fromCache) {
      fireCompletionNotification(data.results.stats);
    }
  }
}

/**
 * Send scan progress — stores it in lastScanProgress for reconnecting popups.
 */
function sendScanProgress(data) {
  lastScanProgress = data;
  sendToActivePort(MSG.SCAN_PROGRESS, data);
}

async function fireCompletionNotification(stats) {
  try {
    const settings = await storage.getSettings();
    if (!settings.notifyOnComplete) return;

    chrome.notifications.create('scan-complete', {
      type: 'basic',
      iconUrl: 'src/assets/icons/icon128.png',
      title: 'Scan Complete',
      message: `Found ${stats.nonFollowersCount} who don't follow you back.`,
    });
  } catch {
    // Notifications permission may not be granted
  }
}
