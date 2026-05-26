export const GAME_NAME = '120-cell-adventure';
export const GAME_VERSION = '0.1.0-dev';
export const SAVE_SCHEMA = 1;
export const STORAGE_KEY = '120-cell-adventure.save.v1';

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSave(payload) {
  const body = JSON.stringify({
    game: GAME_NAME,
    version: GAME_VERSION,
    schema: SAVE_SCHEMA,
    savedAt: new Date().toISOString(),
    payload
  });
  const checksum = fnv1a(body);
  return `${GAME_NAME}:${SAVE_SCHEMA}:${checksum}:${toBase64(body)}`;
}

export function decodeSave(text) {
  const raw = String(text || '').trim();
  const parts = raw.split(':');
  if (parts.length !== 4 || parts[0] !== GAME_NAME) throw new Error('This is not a 120-cell-adventure save string.');
  const schema = Number(parts[1]);
  if (schema !== SAVE_SCHEMA) throw new Error(`Unsupported save schema: ${parts[1]}.`);
  const checksum = parts[2];
  const body = fromBase64(parts[3]);
  if (fnv1a(body) !== checksum) throw new Error('Save checksum did not match.');
  const parsed = JSON.parse(body);
  if (parsed.game !== GAME_NAME || parsed.schema !== SAVE_SCHEMA) throw new Error('Save metadata did not match this game.');
  return parsed.payload;
}

export function saveLocal(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, encodeSave(payload));
    return true;
  } catch (err) {
    console.warn('Unable to save locally:', err);
    return false;
  }
}

export function loadLocal() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return null;
    return decodeSave(text);
  } catch (err) {
    console.warn('Unable to load local save:', err);
    return null;
  }
}

export function clearLocal() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
