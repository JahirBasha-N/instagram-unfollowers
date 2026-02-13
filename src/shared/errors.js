export class AuthError extends Error {
  constructor(message = 'Not authenticated with Instagram') {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(retryAfter = null) {
    super('Rate limited by Instagram');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Network request failed', status = null) {
    super(message);
    this.name = 'NetworkError';
    this.status = status;
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Scan was cancelled');
    this.name = 'CancelledError';
  }
}

export function serializeError(err) {
  return {
    name: err.name || 'Error',
    message: err.message,
    retryAfter: err.retryAfter || null,
    status: err.status || null,
  };
}
