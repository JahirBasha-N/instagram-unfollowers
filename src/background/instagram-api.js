import { API_BASE, IG_APP_ID, FETCH, SESSION, RETRY } from '../shared/constants.js';
import { AuthError, RateLimitError, NetworkError } from '../shared/errors.js';
import { RateLimiter } from './rate-limiter.js';

export class InstagramAPI {
  constructor() {
    this.rateLimiter = new RateLimiter();
    this.scanAbortController = null;
  }

  async getSessionData() {
    const data = await chrome.storage.session.get([
      SESSION.USER_ID_KEY,
      SESSION.CSRF_KEY,
    ]);
    const userId = data[SESSION.USER_ID_KEY];
    const csrfToken = data[SESSION.CSRF_KEY];

    if (!userId || !csrfToken) {
      throw new AuthError('Session data not found. Please open Instagram and log in.');
    }

    return { userId, csrfToken };
  }

  _buildHeaders(csrfToken) {
    return {
      'X-IG-App-ID': IG_APP_ID,
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json',
    };
  }

  async _fetchPage(url, csrfToken, scanSignal) {
    await this.rateLimiter.waitForSlot(scanSignal);

    // Per-request abort controller — timeout kills only this request, not the scan
    const requestAbort = new AbortController();
    const timeoutId = setTimeout(() => requestAbort.abort(), FETCH.TIMEOUT_MS);

    // Also abort this request if the scan is cancelled
    const onScanAbort = () => requestAbort.abort();
    scanSignal?.addEventListener('abort', onScanAbort, { once: true });

    try {
      const response = await fetch(url, {
        headers: this._buildHeaders(csrfToken),
        credentials: 'include',
        signal: requestAbort.signal,
      });

      clearTimeout(timeoutId);
      scanSignal?.removeEventListener('abort', onScanAbort);

      if (response.status === 401 || response.status === 403) {
        throw new AuthError('Instagram session expired. Please log in again.');
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : null);
      }
      if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status}`, response.status);
      }

      const json = await response.json();
      this._validateResponse(json);
      return json;
    } catch (err) {
      clearTimeout(timeoutId);
      scanSignal?.removeEventListener('abort', onScanAbort);

      // If the scan was cancelled, throw AbortError for the scan signal
      if (scanSignal?.aborted) {
        throw new DOMException('Scan cancelled', 'AbortError');
      }
      // Per-request timeout — rethrow as NetworkError (retryable)
      if (err.name === 'AbortError') {
        throw new NetworkError('Request timed out', 0);
      }
      if (err instanceof AuthError || err instanceof RateLimitError || err instanceof NetworkError) {
        throw err;
      }
      throw new NetworkError(err.message);
    }
  }

  _validateResponse(json) {
    if (json === null || typeof json !== 'object') {
      throw new NetworkError('Invalid API response: not an object');
    }
    // Instagram returns { users: [...], next_max_id?: string, status: "ok" }
    // `users` must be an array if present
    if ('users' in json && !Array.isArray(json.users)) {
      throw new NetworkError('Invalid API response: users is not an array');
    }
  }

  async _fetchPageWithRetry(url, csrfToken, scanSignal) {
    let lastError;

    for (let attempt = 1; attempt <= RETRY.MAX_ATTEMPTS; attempt++) {
      try {
        return await this._fetchPage(url, csrfToken, scanSignal);
      } catch (err) {
        lastError = err;

        // Never retry auth errors, rate limits, or cancellations
        if (
          err instanceof AuthError ||
          err instanceof RateLimitError ||
          err.name === 'AbortError' ||
          scanSignal?.aborted
        ) {
          throw err;
        }

        // Retry on transient network/server errors
        const isRetryable =
          err instanceof NetworkError &&
          RETRY.RETRYABLE_STATUS_CODES.includes(err.status);

        if (!isRetryable || attempt === RETRY.MAX_ATTEMPTS) {
          throw err;
        }

        // Exponential backoff with jitter
        const delay = RETRY.BASE_DELAY_MS * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5);
        await this._sleep(delay, scanSignal);
      }
    }

    throw lastError;
  }

  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    });
  }

  async fetchAllUsers(userId, csrfToken, type, scanSignal, onProgress) {
    const users = [];
    let maxId = null;
    let page = 0;

    const endpoint = type === 'following' ? 'following' : 'followers';

    while (true) {
      if (scanSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

      let url = `${API_BASE}/${userId}/${endpoint}/?count=${FETCH.BATCH_SIZE}`;
      if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;

      const data = await this._fetchPageWithRetry(url, csrfToken, scanSignal);

      const batch = data.users || [];
      for (const user of batch) {
        users.push(this._normalizeUser(user));
      }

      page++;
      if (onProgress) {
        onProgress({ type, count: users.length, page });
      }

      if (!data.next_max_id) break;
      maxId = data.next_max_id;
    }

    return users;
  }

  /**
   * Resume-capable fetch: starts from a given maxId cursor.
   * Returns { users, nextMaxId, complete }.
   */
  async fetchUsersFrom(userId, csrfToken, type, startMaxId, scanSignal, onProgress) {
    const users = [];
    let maxId = startMaxId || null;
    let page = 0;

    const endpoint = type === 'following' ? 'following' : 'followers';

    while (true) {
      if (scanSignal?.aborted) throw new DOMException('Aborted', 'AbortError');

      let url = `${API_BASE}/${userId}/${endpoint}/?count=${FETCH.BATCH_SIZE}`;
      if (maxId) url += `&max_id=${encodeURIComponent(maxId)}`;

      const data = await this._fetchPageWithRetry(url, csrfToken, scanSignal);

      const batch = data.users || [];
      for (const user of batch) {
        users.push(this._normalizeUser(user));
      }

      page++;
      if (onProgress) {
        onProgress({ type, count: users.length, page });
      }

      if (!data.next_max_id) {
        return { users, nextMaxId: null, complete: true };
      }
      maxId = data.next_max_id;
    }
  }

  _normalizeUser(user) {
    return {
      id: String(user.pk ?? user.id ?? ''),
      username: String(user.username ?? ''),
      fullName: String(user.full_name ?? ''),
      profilePicUrl: String(user.profile_pic_url ?? ''),
      isVerified: Boolean(user.is_verified),
      isPrivate: Boolean(user.is_private),
    };
  }

  /**
   * Unfollow a user. POST to /friendships/destroy/{userId}/
   */
  async unfollowUser(targetUserId, csrfToken) {
    const url = `${API_BASE}/destroy/${targetUserId}/`;
    return this._postAction(url, csrfToken);
  }

  /**
   * Follow a user. POST to /friendships/create/{userId}/
   */
  async followUser(targetUserId, csrfToken) {
    const url = `${API_BASE}/create/${targetUserId}/`;
    return this._postAction(url, csrfToken);
  }

  async _postAction(url, csrfToken) {
    const requestAbort = new AbortController();
    const timeoutId = setTimeout(() => requestAbort.abort(), FETCH.TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this._buildHeaders(csrfToken),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        credentials: 'include',
        signal: requestAbort.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401 || response.status === 403) {
        throw new AuthError('Instagram session expired. Please log in again.');
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : null);
      }
      if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status}`, response.status);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new NetworkError('Request timed out', 0);
      }
      if (err instanceof AuthError || err instanceof RateLimitError || err instanceof NetworkError) {
        throw err;
      }
      throw new NetworkError(err.message);
    }
  }

  startScan() {
    this.scanAbortController = new AbortController();
    this.rateLimiter.reset();
    return this.scanAbortController.signal;
  }

  cancelScan() {
    if (this.scanAbortController) {
      this.scanAbortController.abort();
      this.scanAbortController = null;
    }
  }
}
