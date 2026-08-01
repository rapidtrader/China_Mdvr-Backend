/**
 * Backend base URL resolver (browser-safe):
 * - Default empty string → same-origin `/api/*` (works with nginx reverse-proxy)
 * - Optional `VITE_API_BASE_URL` override (must not break HTTPS pages)
 */

const rawBase =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).replace(/\/$/, '')
    : '';

let insecureBaseWarned = false;

const getEffectiveBase = () => {
  if (!rawBase) return '';

  if (
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    rawBase.startsWith('http://')
  ) {
    if (!insecureBaseWarned) {
      insecureBaseWarned = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[api] VITE_API_BASE_URL is http:// while page is https:// — using same-origin /api. Remove VITE_API_BASE_URL or set it to https://...'
      );
    }
    return '';
  }

  return rawBase;
};

export const getApiBaseUrl = () => getEffectiveBase();

export const apiUrl = (path) => {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${getEffectiveBase()}${p}`;
};

/**
 * Socket.IO server URL.
 * - Dev:  VITE_SOCKET_URL (e.g. http://localhost:3001) — proxy doesn't handle WS upgrade
 * - Prod: VITE_SOCKET_URL = VITE_API_BASE_URL = same origin
 * - Fallback: window.location.origin (works when frontend + backend on same server)
 */
export const getSocketUrl = () => {
  const explicit =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOCKET_URL
      ? String(import.meta.env.VITE_SOCKET_URL).replace(/\/$/, '')
      : '';
  if (explicit) return explicit;
  const base = getEffectiveBase();
  if (base) return base;
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3001';
};
