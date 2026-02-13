import { IMAGE } from './constants.js';

// ───── XSS Prevention ─────

export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function escapeAttr(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ───── Formatting ─────

export function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

export function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ───── CSV Export Helpers ─────

const CSV_FORMULA_CHARS = new Set(['=', '+', '-', '@', '\t', '\r']);

export function csvEscape(str) {
  if (!str) return '';
  let safe = str;
  if (CSV_FORMULA_CHARS.has(safe[0])) {
    safe = "'" + safe;
  }
  if (safe.includes(',') || safe.includes('"') || safe.includes('\n') || safe.includes("'")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function exportCSV(users, tabLabel) {
  let csv = 'Username,Full Name,Verified,Private,Profile URL\n';
  for (const u of users) {
    csv += `${csvEscape(u.username)},${csvEscape(u.fullName)},${u.isVerified},${u.isPrivate},https://www.instagram.com/${u.username}/\n`;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `instaunfollowers_${tabLabel.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportJSON(users, tabLabel, stats) {
  const data = {
    exportedAt: new Date().toISOString(),
    tab: tabLabel,
    count: users.length,
    stats,
    users: users.map((u) => ({
      username: u.username,
      fullName: u.fullName,
      isVerified: u.isVerified,
      isPrivate: u.isPrivate,
      profileUrl: `https://www.instagram.com/${u.username}/`,
    })),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `instaunfollowers_${tabLabel.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ───── Image Utilities ─────

export function isAllowedImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!IMAGE.ALLOWED_PROTOCOLS.includes(parsed.protocol)) return false;
    return IMAGE.ALLOWED_HOSTS_PATTERN.test(parsed.hostname);
  } catch {
    return false;
  }
}

export async function fetchImage(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}
