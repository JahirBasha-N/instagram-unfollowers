export const API_BASE = 'https://www.instagram.com/api/v1/friendships';
export const IG_APP_ID = '936619743392459';

export const RATE_LIMIT = {
  MAX_REQUESTS_PER_WINDOW: 180,
  WINDOW_MS: 15 * 60 * 1000,
  MIN_DELAY_MS: 800,
  MAX_DELAY_MS: 2000,
  COOLDOWN_PAUSE_MS: 30_000,
  PAGES_BEFORE_COOLDOWN: 40,
};

export const RETRY = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 2000,
  RETRYABLE_STATUS_CODES: [500, 502, 503, 504, 0],
};

export const FETCH = {
  BATCH_SIZE: 50,
  TIMEOUT_MS: 15_000,
};

export const CACHE = {
  TTL_MS: 30 * 60 * 1000,
  STORAGE_KEY: 'instaunfollowers_results',
  PROGRESS_KEY: 'instaunfollowers_progress',
  MAX_STORAGE_BYTES: 8 * 1024 * 1024, // 8MB safety margin under 10MB limit
};

export const SESSION = {
  USER_ID_KEY: 'ig_user_id',
  CSRF_KEY: 'ig_csrf_token',
};

export const IMAGE = {
  CONCURRENCY: 6,
  ALLOWED_PROTOCOLS: ['https:'],
  ALLOWED_HOSTS_PATTERN: /\.(fbcdn\.net|cdninstagram\.com|instagram\.com)$/,
};

export const KEEPALIVE = {
  ALARM_NAME: 'instaunfollowers_keepalive',
  INTERVAL_MINUTES: 0.4, // ~24 seconds, under the 30s SW timeout
};

export const STORAGE = {
  SETTINGS_KEY: 'instaunfollowers_settings',
  WHITELIST_KEY: 'instaunfollowers_whitelist',
  HISTORY_KEY: 'instaunfollowers_history',
};

export const HISTORY = {
  MAX_SNAPSHOTS: 20,
  // Store only IDs per snapshot (~100KB for 10k users vs ~2MB with full objects)
};
