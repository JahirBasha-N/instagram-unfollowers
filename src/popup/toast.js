/**
 * Lightweight toast notification system.
 * Usage: Toast.show('Message', { type: 'success', duration: 3000, action: { label: 'Undo', onClick: fn } })
 */

let container = null;

function init() {
  if (container) return;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('role', 'status');
  document.body.appendChild(container);
}

function show(message, { type = 'info', duration = 3000, action = null } = {}) {
  init();

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const text = document.createElement('span');
  text.className = 'toast__message';
  text.textContent = message;
  toast.appendChild(text);

  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast__action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => {
      action.onClick?.();
      dismiss(toast);
    });
    toast.appendChild(btn);
  }

  container.appendChild(toast);

  // Trigger reflow then add visible class for animation
  toast.offsetHeight; // eslint-disable-line no-unused-expressions
  toast.classList.add('toast--visible');

  const timer = setTimeout(() => dismiss(toast), duration);
  toast._timer = timer;

  return toast;
}

function dismiss(toast) {
  if (!toast || !toast.parentNode) return;
  clearTimeout(toast._timer);
  toast.classList.remove('toast--visible');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  // Fallback removal if transitionend doesn't fire
  setTimeout(() => toast.remove(), 400);
}

export const Toast = { init, show, dismiss };
