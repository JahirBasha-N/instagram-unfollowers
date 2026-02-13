import { MSG, PORT_NAME } from '../shared/message-types.js';
import { SESSION, CACHE, IMAGE, STORAGE } from '../shared/constants.js';
import { escapeHtml, escapeAttr, formatNumber, timeAgo, csvEscape, exportCSV, exportJSON, isAllowedImageUrl, fetchImage } from '../shared/render-utils.js';
import { Toast } from './toast.js';

// ───── DOM References ─────
const panels = {
  auth: document.getElementById('panel-auth'),
  ready: document.getElementById('panel-ready'),
  scanning: document.getElementById('panel-scanning'),
  results: document.getElementById('panel-results'),
  error: document.getElementById('panel-error'),
};

const els = {
  btnScan: document.getElementById('btn-scan'),
  btnCancel: document.getElementById('btn-cancel'),
  btnRefresh: document.getElementById('btn-refresh'),
  btnExport: document.getElementById('btn-export'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  btnExportJson: document.getElementById('btn-export-json'),
  btnRetry: document.getElementById('btn-retry'),
  btnTheme: document.getElementById('btn-theme'),
  btnExpand: document.getElementById('btn-expand'),
  exportDropdown: document.getElementById('export-dropdown'),
  exportMenu: document.getElementById('export-menu'),
  cacheInfo: document.getElementById('cache-info'),
  progressBar: document.getElementById('progress-bar'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  countFollowing: document.getElementById('count-following'),
  countFollowers: document.getElementById('count-followers'),
  scanTimer: document.getElementById('scan-timer'),
  statNonFollowers: document.getElementById('stat-nonfollowers'),
  statFans: document.getElementById('stat-fans'),
  statMutuals: document.getElementById('stat-mutuals'),
  tabCountNonFollowers: document.getElementById('tab-count-nonfollowers'),
  tabCountFans: document.getElementById('tab-count-fans'),
  tabCountMutuals: document.getElementById('tab-count-mutuals'),
  tabCountChanges: document.getElementById('tab-count-changes'),
  tabChanges: document.getElementById('tab-changes'),
  filterChipNew: document.getElementById('filter-chip-new'),
  searchInput: document.getElementById('search-input'),
  sortSelect: document.getElementById('sort-select'),
  userList: document.getElementById('user-list'),
  errorMessage: document.getElementById('error-message'),
  errorDetails: document.getElementById('error-details'),
  whitelistIndicator: document.getElementById('whitelist-indicator'),
  whitelistCount: document.getElementById('whitelist-count'),
};

// ───── State ─────
let port = null;
let currentState = 'auth';
let activeTab = 'nonFollowers';
let results = null;
let renderedCount = 0;
const BATCH_SIZE = 100;
let searchTerm = '';
let sortKey = 'username-asc';
let debounceTimer = null;
let scanTimerInterval = null;
let scanStartTime = 0;

// Diff data
let diffData = null;
let newUnfollowerIds = null;

// Whitelist
let whitelistIds = new Set();

// Active filters
const activeFilters = { verified: false, private: false, new: false };

// Track blob URLs for cleanup
const activeBlobUrls = new Set();

// Theme
let currentTheme = 'system';

// ───── State Machine ─────
function setState(newState) {
  const wasScanning = currentState === 'scanning';
  currentState = newState;

  for (const [key, panel] of Object.entries(panels)) {
    panel.classList.toggle('active', key === newState);
  }
  els.exportDropdown.style.display = newState === 'results' ? '' : 'none';
  els.btnExpand.style.display = newState === 'results' ? '' : 'none';

  // Only start/stop timer on actual state transitions to prevent interval leaks
  if (newState === 'scanning' && !wasScanning) {
    startScanTimer();
  } else if (newState !== 'scanning' && wasScanning) {
    stopScanTimer();
  }
}

// ───── Port Connection ─────
function connectPort() {
  if (port) return; // Already connected

  port = chrome.runtime.connect({ name: PORT_NAME });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
      case MSG.SCAN_PROGRESS:
        handleProgress(msg);
        break;
      case MSG.SCAN_COMPLETE:
        handleComplete(msg);
        break;
      case MSG.SCAN_ERROR:
        handleError(msg.error);
        break;
      case MSG.SCAN_CANCELLED:
        setState('ready');
        break;
      case MSG.SETTINGS_UPDATED:
        handleSettingsUpdated(msg.settings);
        break;
      case MSG.WHITELIST_UPDATED:
        handleWhitelistUpdated(msg.whitelist);
        break;
      case MSG.GET_HISTORY_DIFF:
        handleDiffResponse(msg.diff);
        break;
      case MSG.USER_ACTION_SUCCESS:
        handleUserActionSuccess(msg);
        break;
      case MSG.USER_ACTION_ERROR:
        handleUserActionError(msg);
        break;
    }
  });

  port.onDisconnect.addListener(() => {
    port = null;
  });
}

function ensurePort() {
  if (!port) connectPort();
  return port;
}

// ───── Message Handlers ─────
function handleProgress(msg) {
  // On first progress message (transitioning to scanning), initialize the timer
  // using the elapsed time from the service worker so the timer is accurate
  // even when reconnecting to an in-progress scan.
  if (currentState !== 'scanning') {
    if (msg.elapsed) {
      scanStartTime = Date.now() - msg.elapsed;
    }
    setState('scanning');
  }

  const pct = msg.phase === 'following' ? 25 : msg.phase === 'followers' ? 65 : 90;
  els.progressFill.style.width = pct + '%';
  els.progressBar.setAttribute('aria-valuenow', pct);
  els.progressFill.classList.remove('progress-bar__fill--indeterminate');

  if (msg.phase === 'following') {
    els.countFollowing.textContent = msg.count;
    els.progressText.textContent = `Fetching following... (page ${msg.page})`;
  } else if (msg.phase === 'followers') {
    els.countFollowers.textContent = msg.count;
    els.progressText.textContent = `Fetching followers... (page ${msg.page})`;
  } else if (msg.phase === 'comparing') {
    els.progressText.textContent = 'Comparing lists...';
  }
}

function handleComplete(msg) {
  if (!msg.results) {
    setState('ready');
    els.cacheInfo.textContent = '';
    return;
  }

  results = msg.results;

  // Request diff data
  ensurePort().postMessage({ type: MSG.GET_HISTORY_DIFF });

  renderResults();
  setState('results');

  if (msg.results.timestamp) {
    els.cacheInfo.textContent = `Last scan: ${timeAgo(msg.results.timestamp)}`;
  }
}

function handleError(error) {
  if (error.name === 'AuthError') {
    setState('auth');
    return;
  }

  setState('error');
  els.errorMessage.textContent = error.message || 'An unexpected error occurred.';

  if (error.name === 'RateLimitError') {
    els.errorDetails.textContent = 'Instagram is rate limiting requests. Please wait a few minutes and try again.';
  } else {
    els.errorDetails.textContent = error.name || '';
  }
}

function handleSettingsUpdated(settings) {
  if (settings.theme && settings.theme !== currentTheme) {
    applyTheme(settings.theme);
  }
  if (settings.defaultSort) {
    sortKey = settings.defaultSort;
    els.sortSelect.value = sortKey;
  }
}

function handleWhitelistUpdated(whitelist) {
  whitelistIds = new Set(whitelist.map((u) => u.id));
  updateWhitelistIndicator(whitelist.length);
}

function handleDiffResponse(diff) {
  diffData = diff;
  if (diff) {
    newUnfollowerIds = new Set(diff.newUnfollowerIds);
    const totalChanges = diff.newUnfollowerIds.length + diff.regainedFollowerIds.length;

    if (totalChanges > 0) {
      els.tabChanges.style.display = '';
      els.tabCountChanges.textContent = formatNumber(totalChanges);
      els.filterChipNew.style.display = '';
    }

    // Re-render if already on results to show NEW badges
    if (currentState === 'results' && activeTab !== 'changes') {
      renderUserList();
    }
  }
}

// ───── Follow/Unfollow Handlers ─────

// Track which user IDs have pending actions to prevent double-clicks
const pendingActions = new Set();

function handleUserActionSuccess(msg) {
  pendingActions.delete(msg.targetUserId);
  const username = getUsernameById(msg.targetUserId);

  if (msg.action === 'unfollow') {
    // Remove from current tab's data
    if (msg.fromTab === 'nonFollowers' && results) {
      const user = removeUserFromList(results.nonFollowers, msg.targetUserId);
      results.stats.nonFollowersCount = results.nonFollowers.length;
      Toast.show(`Unfollowed @${username}`, { type: 'success', duration: 3000 });
    } else if (msg.fromTab === 'mutuals' && results) {
      const user = removeUserFromList(results.mutuals, msg.targetUserId);
      if (user) {
        results.fans.push(user);
        results.stats.fansCount = results.fans.length;
      }
      results.stats.mutualsCount = results.mutuals.length;
      Toast.show(`Unfollowed @${username} — moved to Fans`, { type: 'success', duration: 3000 });
    }
  } else if (msg.action === 'follow') {
    if (msg.fromTab === 'fans' && results) {
      const user = removeUserFromList(results.fans, msg.targetUserId);
      if (user) {
        results.mutuals.push(user);
        results.stats.mutualsCount = results.mutuals.length;
      }
      results.stats.fansCount = results.fans.length;
      Toast.show(`Followed @${username} — moved to Mutuals`, { type: 'success', duration: 3000 });
    }
  }

  if (results) {
    renderResults();
  }
}

function handleUserActionError(msg) {
  pendingActions.delete(msg.targetUserId);
  const username = getUsernameById(msg.targetUserId);

  // Re-enable the button in the card — restore icon + text
  const card = els.userList.querySelector(`[data-user-id="${msg.targetUserId}"]`);
  if (card) {
    const actionBtn = card.querySelector('.user-card__action-btn');
    if (actionBtn) {
      actionBtn.disabled = false;
      if (msg.action === 'unfollow') {
        actionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg><span>Unfollow</span>`;
      } else {
        actionBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg><span>Follow</span>`;
      }
    }
  }

  const actionLabel = msg.action === 'unfollow' ? 'unfollow' : 'follow';
  if (msg.error?.name === 'AuthError') {
    Toast.show(`Please log in to Instagram to ${actionLabel}`, { type: 'error', duration: 4000 });
  } else if (msg.error?.name === 'RateLimitError') {
    Toast.show(`Rate limited — wait a moment and try again`, { type: 'error', duration: 4000 });
  } else {
    Toast.show(`Failed to ${actionLabel} @${username}`, { type: 'error', duration: 3000 });
  }
}

function getUsernameById(userId) {
  if (!results) return userId;
  for (const list of [results.nonFollowers, results.fans, results.mutuals]) {
    const user = list.find((u) => u.id === userId);
    if (user) return user.username;
  }
  return userId;
}

function removeUserFromList(list, userId) {
  const idx = list.findIndex((u) => u.id === userId);
  if (idx !== -1) return list.splice(idx, 1)[0];
  return null;
}

function unfollowUser(user) {
  if (pendingActions.has(user.id)) return;
  pendingActions.add(user.id);

  // Optimistic UI — show loading state on button
  const card = els.userList.querySelector(`[data-user-id="${user.id}"]`);
  if (card) {
    const actionBtn = card.querySelector('.user-card__action-btn');
    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.innerHTML = '<span class="action-spinner"></span>';
    }
  }

  ensurePort().postMessage({
    type: MSG.UNFOLLOW_USER,
    targetUserId: user.id,
    fromTab: activeTab,
  });
}

function followUser(user) {
  if (pendingActions.has(user.id)) return;
  pendingActions.add(user.id);

  const card = els.userList.querySelector(`[data-user-id="${user.id}"]`);
  if (card) {
    const actionBtn = card.querySelector('.user-card__action-btn');
    if (actionBtn) {
      actionBtn.disabled = true;
      actionBtn.innerHTML = '<span class="action-spinner"></span>';
    }
  }

  ensurePort().postMessage({
    type: MSG.FOLLOW_USER,
    targetUserId: user.id,
    fromTab: activeTab,
  });
}

// ───── Scan Timer ─────
function startScanTimer() {
  // Guard against duplicate intervals
  if (scanTimerInterval) return;

  // Only reset scanStartTime if it wasn't already set by handleProgress
  if (!scanStartTime) {
    scanStartTime = Date.now();
  }
  updateScanTimer();
  scanTimerInterval = setInterval(updateScanTimer, 1000);
}

function stopScanTimer() {
  if (scanTimerInterval) {
    clearInterval(scanTimerInterval);
    scanTimerInterval = null;
  }
  scanStartTime = 0;
  els.scanTimer.textContent = '';
}

function updateScanTimer() {
  const elapsed = Math.floor((Date.now() - scanStartTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  els.scanTimer.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
}

// ───── Theme ─────
function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
}

function cycleTheme() {
  const order = ['light', 'dark', 'system'];
  const idx = order.indexOf(currentTheme);
  const next = order[(idx + 1) % order.length];
  applyTheme(next);

  // Persist via storage directly (faster, no port roundtrip needed)
  chrome.storage.local.get(STORAGE.SETTINGS_KEY, (data) => {
    const settings = data[STORAGE.SETTINGS_KEY] || {};
    settings.theme = next;
    chrome.storage.local.set({ [STORAGE.SETTINGS_KEY]: settings });
  });

  Toast.show(`Theme: ${next.charAt(0).toUpperCase() + next.slice(1)}`, { type: 'info', duration: 1500 });
}

// ───── Whitelist ─────
function hideUser(user) {
  ensurePort().postMessage({ type: MSG.ADD_TO_WHITELIST, user: { id: user.id, username: user.username } });

  Toast.show(`Hid @${user.username}`, {
    type: 'info',
    duration: 4000,
    action: {
      label: 'Undo',
      onClick: () => {
        ensurePort().postMessage({ type: MSG.REMOVE_FROM_WHITELIST, userId: user.id });
      },
    },
  });

  // Immediately remove from local results for snappy UI
  if (results) {
    results.nonFollowers = results.nonFollowers.filter((u) => u.id !== user.id);
    results.fans = results.fans.filter((u) => u.id !== user.id);
    results.stats.nonFollowersCount = results.nonFollowers.length;
    results.stats.fansCount = results.fans.length;
    renderResults();
  }
}

function updateWhitelistIndicator(count) {
  if (count > 0) {
    els.whitelistIndicator.style.display = '';
    els.whitelistCount.textContent = count;
  } else {
    els.whitelistIndicator.style.display = 'none';
  }
}

// ───── Results Rendering ─────
function renderResults() {
  if (!results) return;

  const { stats } = results;

  els.statNonFollowers.textContent = formatNumber(stats.nonFollowersCount);
  els.statFans.textContent = formatNumber(stats.fansCount);
  els.statMutuals.textContent = formatNumber(stats.mutualsCount);

  els.tabCountNonFollowers.textContent = formatNumber(stats.nonFollowersCount);
  els.tabCountFans.textContent = formatNumber(stats.fansCount);
  els.tabCountMutuals.textContent = formatNumber(stats.mutualsCount);

  renderUserList();
}

function renderSkeletons(count = 5) {
  revokeAllBlobUrls();
  els.userList.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const skel = document.createElement('div');
    skel.className = 'user-card--skeleton';
    skel.setAttribute('aria-hidden', 'true');
    skel.innerHTML = `
      <div class="skeleton skeleton--circle"></div>
      <div class="skeleton__info">
        <div class="skeleton skeleton--text skeleton--text-long"></div>
        <div class="skeleton skeleton--text skeleton--text-short"></div>
      </div>
      <div class="skeleton skeleton--text-btn"></div>
    `;
    els.userList.appendChild(skel);
  }
}

function getFilteredSortedUsers() {
  if (!results) return [];

  if (activeTab === 'changes') return []; // changes tab has custom rendering

  let users = [...(results[activeTab] || [])];

  // Apply filters
  if (activeFilters.verified) users = users.filter((u) => u.isVerified);
  if (activeFilters.private) users = users.filter((u) => u.isPrivate);
  if (activeFilters.new && newUnfollowerIds) users = users.filter((u) => newUnfollowerIds.has(u.id));

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    users = users.filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        u.fullName.toLowerCase().includes(term)
    );
  }

  const [field, dir] = sortKey.split('-');
  const multiplier = dir === 'asc' ? 1 : -1;
  users.sort((a, b) => {
    const aVal = field === 'name' ? a.fullName : a.username;
    const bVal = field === 'name' ? b.fullName : b.username;
    return multiplier * aVal.localeCompare(bVal);
  });

  return users;
}

function renderUserList() {
  revokeAllBlobUrls();
  els.userList.innerHTML = '';
  renderedCount = 0;

  if (activeTab === 'changes') {
    renderChangesTab();
    return;
  }

  const users = getFilteredSortedUsers();

  if (users.length === 0) {
    renderEmptyState();
    return;
  }

  appendBatch(users);
}

function renderEmptyState() {
  const messages = {
    nonFollowers: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      text: searchTerm ? 'No matching users found' : "Everyone you follow follows you back!",
      cta: searchTerm ? null : null,
    },
    fans: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      text: searchTerm ? 'No matching users found' : 'No fan-only followers found',
      cta: null,
    },
    mutuals: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      text: searchTerm ? 'No matching users found' : 'No mutual follows found',
      cta: null,
    },
    changes: {
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
      text: 'No changes since your last scan',
      cta: 'runScan',
    },
  };

  const state = messages[activeTab] || messages.nonFollowers;

  let ctaHtml = '';
  if (state.cta === 'runScan') {
    ctaHtml = '<button class="empty-state__cta" id="empty-cta-scan">Run New Scan</button>';
  }

  // Check if filters are active
  const hasActiveFilters = Object.values(activeFilters).some(Boolean);
  if (hasActiveFilters && !searchTerm) {
    state.text = 'No users match the active filters';
    ctaHtml = '<button class="empty-state__cta" id="empty-cta-clear-filters">Clear Filters</button>';
  }

  els.userList.innerHTML = `
    <div class="empty-state">
      ${state.icon}
      <span>${state.text}</span>
      ${ctaHtml}
    </div>
  `;

  // Bind CTA buttons
  const ctaScan = els.userList.querySelector('#empty-cta-scan');
  if (ctaScan) ctaScan.addEventListener('click', startScan);

  const ctaClearFilters = els.userList.querySelector('#empty-cta-clear-filters');
  if (ctaClearFilters) {
    ctaClearFilters.addEventListener('click', () => {
      clearAllFilters();
      renderUserList();
    });
  }
}

function renderChangesTab() {
  if (!diffData || !results) {
    renderEmptyState();
    return;
  }

  const html = [];

  // Header: compared to scan from
  html.push(`<div class="changes-compared">Compared to scan from ${timeAgo(diffData.previousTimestamp)}</div>`);

  // New Unfollowers section
  if (diffData.newUnfollowerIds.length > 0) {
    html.push('<div class="changes-section">');
    html.push(`<div class="changes-section__header changes-section__header--unfollowed">New Unfollowers (${diffData.newUnfollowerIds.length})</div>`);
    html.push('</div>');
  }

  // Regained Followers section
  if (diffData.regainedFollowerIds.length > 0) {
    html.push('<div class="changes-section">');
    html.push(`<div class="changes-section__header changes-section__header--returned">Now Following Back (${diffData.regainedFollowerIds.length})</div>`);
    html.push('</div>');
  }

  els.userList.innerHTML = html.join('');

  // Build a user lookup from all results
  const allUsers = new Map();
  for (const u of [...(results.nonFollowers || []), ...(results.fans || []), ...(results.mutuals || [])]) {
    allUsers.set(u.id, u);
  }

  // Render new unfollower cards
  if (diffData.newUnfollowerIds.length > 0) {
    const section = els.userList.querySelectorAll('.changes-section')[0];
    for (const id of diffData.newUnfollowerIds) {
      const user = allUsers.get(id);
      if (user) {
        const card = createUserCard(user, 'new');
        section.appendChild(card);
      }
    }
  }

  // Render regained follower cards
  if (diffData.regainedFollowerIds.length > 0) {
    const sections = els.userList.querySelectorAll('.changes-section');
    const section = sections[sections.length - 1];
    for (const id of diffData.regainedFollowerIds) {
      const user = allUsers.get(id);
      if (user) {
        const card = createUserCard(user, 'returned');
        section.appendChild(card);
      }
    }
  }

  // Load images
  const images = els.userList.querySelectorAll('.user-card__avatar[data-src]');
  loadImagesThrottled(images);
}

function appendBatch(users) {
  if (!users) users = getFilteredSortedUsers();

  const batch = users.slice(renderedCount, renderedCount + BATCH_SIZE);
  if (batch.length === 0) return;

  const fragment = document.createDocumentFragment();

  for (const user of batch) {
    const badge = (activeTab === 'nonFollowers' && newUnfollowerIds?.has(user.id)) ? 'new' : null;
    const card = createUserCard(user, badge);
    fragment.appendChild(card);
  }

  const oldSentinel = els.userList.querySelector('.load-more-sentinel');
  if (oldSentinel) oldSentinel.remove();

  els.userList.appendChild(fragment);
  renderedCount += batch.length;

  // Load images for this batch
  const images = els.userList.querySelectorAll('.user-card__avatar[data-src]');
  loadImagesThrottled(images);

  if (renderedCount < users.length) {
    const sentinel = document.createElement('div');
    sentinel.className = 'load-more-sentinel';
    els.userList.appendChild(sentinel);
    observeSentinel(sentinel, users);
  }
}

function createUserCard(user, badgeType = null) {
  const card = document.createElement('div');
  card.className = 'user-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.dataset.userId = user.id;

  const verifiedHtml = user.isVerified
    ? `<span class="verified-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg></span>`
    : '';

  const badgeHtml = badgeType === 'new'
    ? '<span class="badge badge--new">NEW</span>'
    : badgeType === 'returned'
      ? '<span class="badge badge--returned">RETURNED</span>'
      : '';

  const initial = escapeHtml(user.username[0] || '?').toUpperCase();
  const fallbackSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect fill="#efefef" width="40" height="40"/><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="#8e8e8e" font-size="16">${initial}</text></svg>`)}`;

  const validPicUrl = isAllowedImageUrl(user.profilePicUrl) ? escapeAttr(user.profilePicUrl) : '';

  // Determine the contextual action button
  const showUnfollow = activeTab === 'nonFollowers' || activeTab === 'mutuals';
  const showFollow = activeTab === 'fans';
  let actionBtnHtml = '';
  if (showUnfollow) {
    actionBtnHtml = `<button class="user-card__action-btn user-card__action-btn--unfollow" title="Unfollow ${escapeAttr(user.username)}" aria-label="Unfollow ${escapeAttr(user.username)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      <span>Unfollow</span>
    </button>`;
  } else if (showFollow) {
    actionBtnHtml = `<button class="user-card__action-btn user-card__action-btn--follow" title="Follow ${escapeAttr(user.username)}" aria-label="Follow ${escapeAttr(user.username)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      <span>Follow</span>
    </button>`;
  }

  card.innerHTML = `
    <img class="user-card__avatar" src="${fallbackSvg}" ${validPicUrl ? `data-src="${validPicUrl}"` : ''} alt="" loading="lazy">
    <div class="user-card__info">
      <div class="user-card__username" data-username="${escapeAttr(user.username)}">${escapeHtml(user.username)}${verifiedHtml}${badgeHtml}</div>
      <div class="user-card__name">${escapeHtml(user.fullName)}</div>
    </div>
    <div class="user-card__actions">
      <button class="user-card__hide-btn" title="Hide user" aria-label="Hide ${escapeAttr(user.username)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      </button>
      ${actionBtnHtml}
      <a class="user-card__link" href="https://www.instagram.com/${escapeAttr(user.username)}/" target="_blank" rel="noopener noreferrer" title="View profile on Instagram">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
    </div>
  `;

  // Copy username on click
  const usernameEl = card.querySelector('.user-card__username');
  usernameEl.addEventListener('click', (e) => {
    e.preventDefault();
    navigator.clipboard.writeText(user.username).then(() => {
      Toast.show(`Copied @${user.username}`, { type: 'success', duration: 1500 });
    });
  });

  // Hide button
  const hideBtn = card.querySelector('.user-card__hide-btn');
  hideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideUser(user);
  });

  // Follow/Unfollow action button
  const actionBtn = card.querySelector('.user-card__action-btn');
  if (actionBtn) {
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (actionBtn.classList.contains('user-card__action-btn--unfollow')) {
        unfollowUser(user);
      } else if (actionBtn.classList.contains('user-card__action-btn--follow')) {
        followUser(user);
      }
    });
  }

  return card;
}

// ───── Image Loading ─────

const imageQueue = [];
let activeImageFetches = 0;

function loadImagesThrottled(imgElements) {
  for (const img of imgElements) {
    const url = img.dataset.src;
    if (!url) continue;
    img.removeAttribute('data-src');
    imageQueue.push({ img, url });
  }
  drainImageQueue();
}

function drainImageQueue() {
  while (activeImageFetches < IMAGE.CONCURRENCY && imageQueue.length > 0) {
    const { img, url } = imageQueue.shift();
    activeImageFetches++;

    fetchImage(url)
      .then((blobUrl) => {
        if (blobUrl && img.isConnected) {
          img.src = blobUrl;
          activeBlobUrls.add(blobUrl);
        } else if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
        }
      })
      .finally(() => {
        activeImageFetches--;
        drainImageQueue();
      });
  }
}

function revokeAllBlobUrls() {
  for (const url of activeBlobUrls) {
    URL.revokeObjectURL(url);
  }
  activeBlobUrls.clear();
  imageQueue.length = 0;
}

// ───── Infinite Scroll ─────

let scrollObserver = null;

function observeSentinel(sentinel, users) {
  if (scrollObserver) scrollObserver.disconnect();

  scrollObserver = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) {
        appendBatch(users);
      }
    },
    { root: els.userList, threshold: 0.1 }
  );

  scrollObserver.observe(sentinel);
}

// ───── Tabs ─────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    activeTab = tab.dataset.tab;
    searchTerm = '';
    els.searchInput.value = '';
    clearAllFilters();
    renderUserList();
  });
});

// ───── Filter Chips ─────
document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    activeFilters[filter] = !activeFilters[filter];
    chip.classList.toggle('active', activeFilters[filter]);
    chip.setAttribute('aria-pressed', String(activeFilters[filter]));
    renderUserList();
  });
});

function clearAllFilters() {
  for (const key of Object.keys(activeFilters)) {
    activeFilters[key] = false;
  }
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.classList.remove('active');
    chip.setAttribute('aria-pressed', 'false');
  });
}

// ───── Search ─────
els.searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchTerm = els.searchInput.value.trim();
    renderUserList();
  }, 200);
});

// ───── Sort ─────
els.sortSelect.addEventListener('change', () => {
  sortKey = els.sortSelect.value;
  renderUserList();
});

// ───── Export Menu ─────
els.btnExport.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = els.exportMenu.classList.toggle('open');
  els.btnExport.setAttribute('aria-expanded', String(isOpen));
});

// Close export menu when clicking outside
document.addEventListener('click', () => {
  els.exportMenu.classList.remove('open');
  els.btnExport.setAttribute('aria-expanded', 'false');
});

els.btnExportCsv.addEventListener('click', () => {
  if (!results) return;
  const users = results[activeTab] || [];
  const label = getTabLabel(activeTab);
  exportCSV(users, label);
  Toast.show(`Exported ${users.length} users as CSV`, { type: 'success' });
  els.exportMenu.classList.remove('open');
});

els.btnExportJson.addEventListener('click', () => {
  if (!results) return;
  const users = results[activeTab] || [];
  const label = getTabLabel(activeTab);
  exportJSON(users, label, results.stats);
  Toast.show(`Exported ${users.length} users as JSON`, { type: 'success' });
  els.exportMenu.classList.remove('open');
});

function getTabLabel(tab) {
  const labels = {
    nonFollowers: "Don't Follow Back",
    fans: 'Fans',
    mutuals: 'Mutuals',
    changes: 'Changes',
  };
  return labels[tab] || tab;
}

// ───── Buttons ─────
function startScan() {
  ensurePort().postMessage({ type: MSG.START_SCAN });
  setState('scanning');
  els.countFollowing.textContent = '0';
  els.countFollowers.textContent = '0';
  els.progressFill.style.width = '0%';
  els.progressBar.setAttribute('aria-valuenow', '0');
  els.progressText.textContent = 'Preparing...';
}

els.btnScan.addEventListener('click', startScan);

els.btnCancel.addEventListener('click', () => {
  if (port) port.postMessage({ type: MSG.CANCEL_SCAN });
});

els.btnRefresh.addEventListener('click', () => {
  ensurePort().postMessage({ type: MSG.CLEAR_CACHE });
  setState('ready');
  els.cacheInfo.textContent = '';
});

els.btnRetry.addEventListener('click', startScan);

els.btnTheme.addEventListener('click', cycleTheme);

els.btnExpand.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/expanded/expanded.html') });
});

// Whitelist indicator click -> open settings
els.whitelistIndicator.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ───── Keyboard Navigation ─────
document.addEventListener('keydown', (e) => {
  // Only handle shortcuts when not typing in an input
  const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA';

  if (e.key === '/' && !isInput && currentState === 'results') {
    e.preventDefault();
    els.searchInput.focus();
    return;
  }

  if (e.key === 'Escape') {
    if (isInput) {
      e.target.blur();
      if (e.target === els.searchInput) {
        searchTerm = '';
        els.searchInput.value = '';
        renderUserList();
      }
    }
    // Close export menu
    els.exportMenu.classList.remove('open');
    return;
  }

  if (!isInput && currentState === 'results') {
    // Number keys switch tabs
    const tabMap = { '1': 'nonFollowers', '2': 'fans', '3': 'mutuals', '4': 'changes' };
    if (tabMap[e.key]) {
      const tabEl = document.querySelector(`[data-tab="${tabMap[e.key]}"]`);
      if (tabEl && tabEl.style.display !== 'none') {
        tabEl.click();
      }
      return;
    }

    // Arrow keys navigate user cards
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const cards = [...els.userList.querySelectorAll('.user-card')];
      if (cards.length === 0) return;

      const focused = document.activeElement;
      const idx = cards.indexOf(focused);

      if (e.key === 'ArrowDown') {
        const next = idx < cards.length - 1 ? idx + 1 : 0;
        cards[next].focus();
      } else {
        const prev = idx > 0 ? idx - 1 : cards.length - 1;
        cards[prev].focus();
      }
    }
  }
});

// ───── Init ─────
async function init() {
  Toast.init();

  // Connect port early so we receive SCAN_PROGRESS from any in-progress scan.
  // The service worker will immediately send current progress if a scan is running.
  connectPort();

  try {
    // Load settings
    const settingsData = await chrome.storage.local.get(STORAGE.SETTINGS_KEY);
    const settings = settingsData[STORAGE.SETTINGS_KEY] || {};
    if (settings.theme) {
      applyTheme(settings.theme);
    }
    if (settings.defaultSort) {
      sortKey = settings.defaultSort;
      els.sortSelect.value = sortKey;
    }

    // Load whitelist count
    const whitelistData = await chrome.storage.local.get(STORAGE.WHITELIST_KEY);
    const whitelist = whitelistData[STORAGE.WHITELIST_KEY] || [];
    whitelistIds = new Set(whitelist.map((u) => u.id));
    updateWhitelistIndicator(whitelist.length);

    // If a scan progress message already arrived while we were loading settings/whitelist,
    // the state will have transitioned to 'scanning'. Don't override it.
    if (currentState === 'scanning' || currentState === 'results') return;

    // Try to restore cached results directly from storage
    const cacheData = await chrome.storage.local.get(CACHE.STORAGE_KEY);
    const cached = cacheData[CACHE.STORAGE_KEY];

    // Re-check: state may have changed during the await
    if (currentState === 'scanning' || currentState === 'results') return;

    if (cached && (Date.now() - cached.timestamp <= CACHE.TTL_MS)) {
      results = cached;

      // Show skeletons briefly for smooth transition
      renderSkeletons();
      setState('results');

      // Then render actual results
      setTimeout(() => {
        renderResults();
        els.cacheInfo.textContent = `Last scan: ${timeAgo(cached.timestamp)}`;

        // Request diff
        ensurePort().postMessage({ type: MSG.GET_HISTORY_DIFF });
      }, 150);

      return;
    }

    // Re-check state
    if (currentState === 'scanning' || currentState === 'results') return;

    // No valid cache — check auth
    const sessionData = await chrome.storage.session.get([SESSION.USER_ID_KEY, SESSION.CSRF_KEY]);
    const hasAuth = sessionData[SESSION.USER_ID_KEY] && sessionData[SESSION.CSRF_KEY];

    if (!hasAuth) {
      setState('auth');
      return;
    }

    // Final check: if a scan started between our awaits, don't override to ready
    if (currentState === 'scanning' || currentState === 'results') return;

    setState('ready');
    if (cached?.timestamp) {
      els.cacheInfo.textContent = 'Last scan expired';
    }
  } catch {
    // Only fall back to auth if we haven't already transitioned to a real state
    if (currentState === 'auth') {
      setState('auth');
    }
  }
}

init();
