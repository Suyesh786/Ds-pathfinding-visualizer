// ── Helpers ────────────────────────────────────────────

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Deep-clone a 2-D array
export function clone2D(arr) {
  return arr.map(row => [...row]);
}

// Convert row, col to key string
export function cellKey(r, c) {
  return `${r},${c}`;
}

// Smooth-scroll to an element with optional top offset
export function scrollTo(el, offset = 80) {
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: 'smooth' });
}

// ── Toast notification ─────────────────────────────────
let _toastTimer = null;

export function showToast(msg, icon = '💡', duration = 2500) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id        = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  clearTimeout(_toastTimer);
  toast.classList.remove('hide');
  toast.innerHTML =
    `<span class="toast-icon">${icon}</span><span>${msg}</span>`;

  _toastTimer = setTimeout(() => toast.classList.add('hide'), duration);
}