import { CACHE, IMAGE, STORAGE } from '../shared/constants.js';
import { MSG, PORT_NAME } from '../shared/message-types.js';
import { escapeHtml, escapeAttr, formatNumber, isAllowedImageUrl, fetchImage } from '../shared/render-utils.js';

// ───── State ─────
let results = null;
let activeTab = 'nonFollowers';
let searchTerm = '';
let sortKey = 'username-asc';
let debounceTimer = null;
const activeFilters = { verified: false, private: false };
const pendingActions = new Set();

// DOM
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const userGrid = document.getElementById('user-grid');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const emptyText = document.getElementById('empty-text');
const btnSettings = document.getElementById('btn-settings');
const toastContainer = document.getElementById('toast-container');

// Blob tracking
const activeBlobUrls = new Set();

// ───── Port Communication ─────
let port = null;

function connectPort() {
  if (port) return;
  port = chrome.runtime.connect({ name: PORT_NAME });

  port.onMessage.addListener((msg) => {
    switch (msg.type) {
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

// ───── Toast (lightweight for expanded view) ─────
function showToast(message, type = 'info') {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `expanded-toast expanded-toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('expanded-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('expanded-toast--visible');
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

// ───── Theme ─────
async function loadTheme() {
  const data = await chrome.storage.local.get(STORAGE.SETTINGS_KEY);
  const settings = data[STORAGE.SETTINGS_KEY] || {};
  if (settings.theme) {
    document.documentElement.dataset.theme = settings.theme;
  }
}

// ───── Data Loading ─────
async function loadData() {
  const cacheData = await chrome.storage.local.get(CACHE.STORAGE_KEY);
  const cached = cacheData[CACHE.STORAGE_KEY];

  loadingState.style.display = 'none';

  if (!cached || (Date.now() - cached.timestamp > CACHE.TTL_MS)) {
    emptyState.style.display = '';
    emptyText.textContent = 'No cached results. Run a scan from the extension popup first.';
    return;
  }

  results = cached;
  renderStats();
  renderUserGrid();
  userGrid.style.display = '';
}

function renderStats() {
  if (!results) return;
  const { stats } = results;
  document.getElementById('stat-nonfollowers').textContent = formatNumber(stats.nonFollowersCount);
  document.getElementById('stat-fans').textContent = formatNumber(stats.fansCount);
  document.getElementById('stat-mutuals').textContent = formatNumber(stats.mutualsCount);
  document.getElementById('side-count-nonfollowers').textContent = formatNumber(stats.nonFollowersCount);
  document.getElementById('side-count-fans').textContent = formatNumber(stats.fansCount);
  document.getElementById('side-count-mutuals').textContent = formatNumber(stats.mutualsCount);
}

function getFilteredSortedUsers() {
  if (!results) return [];

  let users = [...(results[activeTab] || [])];

  if (activeFilters.verified) users = users.filter((u) => u.isVerified);
  if (activeFilters.private) users = users.filter((u) => u.isPrivate);

  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    users = users.filter(
      (u) => u.username.toLowerCase().includes(term) || u.fullName.toLowerCase().includes(term)
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

function renderUserGrid() {
  // Cleanup
  for (const url of activeBlobUrls) URL.revokeObjectURL(url);
  activeBlobUrls.clear();
  userGrid.innerHTML = '';

  const users = getFilteredSortedUsers();

  if (users.length === 0) {
    userGrid.style.display = 'none';
    emptyState.style.display = '';
    emptyText.textContent = searchTerm ? 'No matching users found' : 'No users in this category';
    return;
  }

  emptyState.style.display = 'none';
  userGrid.style.display = '';

  const fragment = document.createDocumentFragment();

  for (const user of users) {
    const card = createUserCard(user);
    fragment.appendChild(card);
  }

  userGrid.appendChild(fragment);

  // Load images
  const images = userGrid.querySelectorAll('.user-card__avatar[data-src]');
  loadImages(images);
}

function createUserCard(user) {
  const card = document.createElement('div');
  card.className = 'user-card';
  card.setAttribute('role', 'listitem');
  card.dataset.userId = user.id;

  const verifiedHtml = user.isVerified
    ? `<span class="verified-badge"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg></span>`
    : '';

  const initial = escapeHtml(user.username[0] || '?').toUpperCase();
  const fallbackSvg = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56"><rect fill="#efefef" width="56" height="56"/><text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="#8e8e8e" font-size="20">${initial}</text></svg>`)}`;
  const validPicUrl = isAllowedImageUrl(user.profilePicUrl) ? escapeAttr(user.profilePicUrl) : '';

  // Determine the contextual action button
  const showUnfollow = activeTab === 'nonFollowers' || activeTab === 'mutuals';
  const showFollow = activeTab === 'fans';
  let actionBtnHtml = '';
  if (showUnfollow) {
    actionBtnHtml = `<button class="user-card__action-btn user-card__action-btn--unfollow" title="Unfollow ${escapeAttr(user.username)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      <span>Unfollow</span>
    </button>`;
  } else if (showFollow) {
    actionBtnHtml = `<button class="user-card__action-btn user-card__action-btn--follow" title="Follow ${escapeAttr(user.username)}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      <span>Follow</span>
    </button>`;
  }

  card.innerHTML = `
    <img class="user-card__avatar" src="${fallbackSvg}" ${validPicUrl ? `data-src="${validPicUrl}"` : ''} alt="" loading="lazy">
    <div class="user-card__info">
      <div class="user-card__username">${escapeHtml(user.username)}${verifiedHtml}</div>
      <div class="user-card__name">${escapeHtml(user.fullName)}</div>
    </div>
    <div class="user-card__actions">
      ${actionBtnHtml}
      <a class="user-card__link" href="https://www.instagram.com/${escapeAttr(user.username)}/" target="_blank" rel="noopener noreferrer" title="View profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
    </div>
  `;

  // Follow/Unfollow action button
  const actionBtn = card.querySelector('.user-card__action-btn');
  if (actionBtn) {
    actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (actionBtn.classList.contains('user-card__action-btn--unfollow')) {
        doUnfollow(user);
      } else if (actionBtn.classList.contains('user-card__action-btn--follow')) {
        doFollow(user);
      }
    });
  }

  return card;
}

// ───── Follow/Unfollow Actions ─────

function doUnfollow(user) {
  if (pendingActions.has(user.id)) return;
  pendingActions.add(user.id);

  const card = userGrid.querySelector(`[data-user-id="${user.id}"]`);
  if (card) {
    const btn = card.querySelector('.user-card__action-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="action-spinner"></span>';
    }
  }

  ensurePort().postMessage({
    type: MSG.UNFOLLOW_USER,
    targetUserId: user.id,
    fromTab: activeTab,
  });
}

function doFollow(user) {
  if (pendingActions.has(user.id)) return;
  pendingActions.add(user.id);

  const card = userGrid.querySelector(`[data-user-id="${user.id}"]`);
  if (card) {
    const btn = card.querySelector('.user-card__action-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="action-spinner"></span>';
    }
  }

  ensurePort().postMessage({
    type: MSG.FOLLOW_USER,
    targetUserId: user.id,
    fromTab: activeTab,
  });
}

function handleUserActionSuccess(msg) {
  pendingActions.delete(msg.targetUserId);
  const username = getUsernameById(msg.targetUserId);

  if (msg.action === 'unfollow' && results) {
    if (msg.fromTab === 'nonFollowers') {
      removeUserFromList(results.nonFollowers, msg.targetUserId);
      results.stats.nonFollowersCount = results.nonFollowers.length;
      showToast(`Unfollowed @${username}`, 'success');
    } else if (msg.fromTab === 'mutuals') {
      const user = removeUserFromList(results.mutuals, msg.targetUserId);
      if (user) {
        results.fans.push(user);
        results.stats.fansCount = results.fans.length;
      }
      results.stats.mutualsCount = results.mutuals.length;
      showToast(`Unfollowed @${username} — moved to Fans`, 'success');
    }
  } else if (msg.action === 'follow' && results) {
    if (msg.fromTab === 'fans') {
      const user = removeUserFromList(results.fans, msg.targetUserId);
      if (user) {
        results.mutuals.push(user);
        results.stats.mutualsCount = results.mutuals.length;
      }
      results.stats.fansCount = results.fans.length;
      showToast(`Followed @${username} — moved to Mutuals`, 'success');
    }
  }

  if (results) {
    renderStats();
    renderUserGrid();
  }
}

function handleUserActionError(msg) {
  pendingActions.delete(msg.targetUserId);
  const username = getUsernameById(msg.targetUserId);

  const card = userGrid.querySelector(`[data-user-id="${msg.targetUserId}"]`);
  if (card) {
    const btn = card.querySelector('.user-card__action-btn');
    if (btn) {
      btn.disabled = false;
      if (msg.action === 'unfollow') {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/></svg><span>Unfollow</span>`;
      } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg><span>Follow</span>`;
      }
    }
  }

  const label = msg.action === 'unfollow' ? 'unfollow' : 'follow';
  if (msg.error?.name === 'RateLimitError') {
    showToast(`Rate limited — wait a moment and try again`, 'error');
  } else {
    showToast(`Failed to ${label} @${username}`, 'error');
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

// ───── Image Loading ─────
const imageQueue = [];
let activeImageFetches = 0;

function loadImages(imgs) {
  for (const img of imgs) {
    const url = img.dataset.src;
    if (!url) continue;
    img.removeAttribute('data-src');
    imageQueue.push({ img, url });
  }
  drainQueue();
}

function drainQueue() {
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
        drainQueue();
      });
  }
}

// ───── Sidebar Tabs ─────
document.querySelectorAll('.sidebar-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    activeTab = tab.dataset.tab;
    searchTerm = '';
    searchInput.value = '';
    renderUserGrid();
  });
});

// ───── Filters ─────
document.querySelectorAll('.filter-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    activeFilters[filter] = !activeFilters[filter];
    chip.classList.toggle('active', activeFilters[filter]);
    chip.setAttribute('aria-pressed', String(activeFilters[filter]));
    renderUserGrid();
  });
});

// ───── Search & Sort ─────
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    searchTerm = searchInput.value.trim();
    renderUserGrid();
  }, 200);
});

sortSelect.addEventListener('change', () => {
  sortKey = sortSelect.value;
  renderUserGrid();
});

// ───── Buttons ─────
btnSettings.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// ───── Init ─────
connectPort();
loadTheme();
loadData();
