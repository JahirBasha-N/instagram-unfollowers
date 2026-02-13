import { STORAGE } from '../shared/constants.js';
import { timeAgo } from '../shared/render-utils.js';

const DEFAULT_SETTINGS = {
  theme: 'system',
  notifyOnComplete: true,
  historyMaxSnapshots: 20,
  defaultTab: 'nonFollowers',
  defaultSort: 'username-asc',
};

// ───── DOM ─────
const themeSelect = document.getElementById('theme-select');
const notifyToggle = document.getElementById('notify-toggle');
const whitelistContainer = document.getElementById('whitelist-container');
const whitelistEmpty = document.getElementById('whitelist-empty');
const historyContainer = document.getElementById('history-container');
const historyEmpty = document.getElementById('history-empty');
const storageFill = document.getElementById('storage-fill');
const storageLabel = document.getElementById('storage-label');
const storageBreakdown = document.getElementById('storage-breakdown');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnClearCache = document.getElementById('btn-clear-cache');
const btnExportAll = document.getElementById('btn-export-all');
const btnClearAll = document.getElementById('btn-clear-all');

// ───── Load Settings ─────
async function loadSettings() {
  const data = await chrome.storage.local.get(STORAGE.SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE.SETTINGS_KEY] || {}) };

  themeSelect.value = settings.theme;
  notifyToggle.checked = settings.notifyOnComplete;
  applyTheme(settings.theme);
}

async function saveSetting(key, value) {
  const data = await chrome.storage.local.get(STORAGE.SETTINGS_KEY);
  const settings = { ...DEFAULT_SETTINGS, ...(data[STORAGE.SETTINGS_KEY] || {}) };
  settings[key] = value;
  await chrome.storage.local.set({ [STORAGE.SETTINGS_KEY]: settings });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

// ───── Settings Events ─────
themeSelect.addEventListener('change', () => {
  const theme = themeSelect.value;
  applyTheme(theme);
  saveSetting('theme', theme);
});

notifyToggle.addEventListener('change', () => {
  saveSetting('notifyOnComplete', notifyToggle.checked);
});

// ───── Whitelist ─────
async function loadWhitelist() {
  const data = await chrome.storage.local.get(STORAGE.WHITELIST_KEY);
  const list = data[STORAGE.WHITELIST_KEY] || [];
  renderWhitelist(list);
}

function renderWhitelist(list) {
  // Remove old items (keep the empty text)
  whitelistContainer.querySelectorAll('.whitelist-item').forEach((el) => el.remove());

  if (list.length === 0) {
    whitelistEmpty.style.display = '';
    return;
  }

  whitelistEmpty.style.display = 'none';

  for (const user of list) {
    const item = document.createElement('div');
    item.className = 'whitelist-item';
    item.innerHTML = `
      <span class="whitelist-item__username">@${escapeHtml(user.username)}</span>
      <button class="whitelist-item__remove" data-id="${escapeAttr(user.id)}">Remove</button>
    `;
    item.querySelector('.whitelist-item__remove').addEventListener('click', async () => {
      const data = await chrome.storage.local.get(STORAGE.WHITELIST_KEY);
      let updated = (data[STORAGE.WHITELIST_KEY] || []).filter((u) => u.id !== user.id);
      await chrome.storage.local.set({ [STORAGE.WHITELIST_KEY]: updated });
      renderWhitelist(updated);
    });
    whitelistContainer.appendChild(item);
  }
}

// ───── History ─────
async function loadHistory() {
  const data = await chrome.storage.local.get(STORAGE.HISTORY_KEY);
  const snapshots = data[STORAGE.HISTORY_KEY] || [];
  renderHistory(snapshots);
}

function renderHistory(snapshots) {
  historyContainer.querySelectorAll('.history-item').forEach((el) => el.remove());

  if (snapshots.length === 0) {
    historyEmpty.style.display = '';
    return;
  }

  historyEmpty.style.display = 'none';

  for (const snap of [...snapshots].reverse()) {
    const item = document.createElement('div');
    item.className = 'history-item';

    const date = new Date(snap.timestamp);
    const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    item.innerHTML = `
      <span class="history-item__time">${dateStr} (${timeAgo(snap.timestamp)})</span>
      <span class="history-item__stats">${snap.stats?.nonFollowersCount || 0} unfollowers, ${snap.stats?.fansCount || 0} fans</span>
    `;
    historyContainer.appendChild(item);
  }
}

btnClearHistory.addEventListener('click', async () => {
  if (!confirm('Clear all scan history? This cannot be undone.')) return;
  await chrome.storage.local.remove(STORAGE.HISTORY_KEY);
  renderHistory([]);
});

// ───── Storage Usage ─────
async function loadStorageUsage() {
  const bytesInUse = await chrome.storage.local.getBytesInUse(null);
  const maxBytes = 10 * 1024 * 1024;
  const pct = Math.min((bytesInUse / maxBytes) * 100, 100);

  storageFill.style.width = pct.toFixed(1) + '%';
  storageLabel.textContent = `${formatBytes(bytesInUse)} / ${formatBytes(maxBytes)} used (${pct.toFixed(1)}%)`;

  const keys = [
    { key: 'instaunfollowers_results', label: 'Cached Results' },
    { key: 'instaunfollowers_progress', label: 'Scan Progress' },
    { key: STORAGE.SETTINGS_KEY, label: 'Settings' },
    { key: STORAGE.WHITELIST_KEY, label: 'Whitelist' },
    { key: STORAGE.HISTORY_KEY, label: 'History' },
  ];

  let html = '';
  for (const { key, label } of keys) {
    const bytes = await chrome.storage.local.getBytesInUse(key);
    if (bytes > 0) {
      html += `<div class="storage-breakdown__item"><span>${label}</span><span>${formatBytes(bytes)}</span></div>`;
    }
  }
  storageBreakdown.innerHTML = html;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// ───── Data Management Buttons ─────
btnClearCache.addEventListener('click', async () => {
  await chrome.storage.local.remove(['instaunfollowers_results', 'instaunfollowers_progress']);
  loadStorageUsage();
});

btnExportAll.addEventListener('click', async () => {
  const data = await chrome.storage.local.get(null);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `instaunfollowers_backup_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

btnClearAll.addEventListener('click', async () => {
  if (!confirm('This will delete ALL extension data including settings, cache, history, and whitelist. Continue?')) return;
  await chrome.storage.local.clear();
  loadSettings();
  loadWhitelist();
  loadHistory();
  loadStorageUsage();
});

// ───── XSS Helpers ─────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ───── Init ─────
loadSettings();
loadWhitelist();
loadHistory();
loadStorageUsage();
