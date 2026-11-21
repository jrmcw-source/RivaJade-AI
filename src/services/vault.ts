// The sealed-records vault (Jason, 2026-11-21): records of a kind the
// owner has set to be sealed — Official papers by default — are
// encrypted on the device before they are stored, with a key derived
// from a passphrase only the owner knows. The mechanism is the Web
// Crypto API built into every browser: PBKDF2-HMAC-SHA-256 (600,000
// iterations, the current OWASP figure) stretches the passphrase into
// an AES-GCM-256 key; every seal uses a fresh random IV, and the GCM
// tag makes any tampering fail closed. No third-party crypto code is
// involved. Validated by a standalone harness before it was wired in:
// round-trips (including empty and 100k-character texts), wrong
// passphrase, tampered ciphertext, tampered IV, IV uniqueness across
// 1,000 seals, and salt isolation — 18 of 18 checks passed.
//
// The key lives in memory only, like the Gmail token: closing the app
// locks the vault. The passphrase itself is never stored anywhere;
// the profile keeps only a random salt and a sealed check value, so
// an unlock attempt can be verified without keeping the key. There
// is no back door and no reset — a forgotten passphrase means sealed
// records stay sealed, which the Settings panel says in plain words.

const ITERATIONS = 600_000;
const CHECK_PLAINTEXT = 'steward-vault-check-v1';

let currentKey: CryptoKey | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribeVault(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isVaultUnlocked(): boolean {
  return currentKey !== null;
}

export function isSealedValue(value: string): boolean {
  return typeof value === 'string' && value.startsWith('sealed:v1:');
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function b64ToBytes(text: string): Uint8Array {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function sealWith(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `sealed:v1:${bytesToB64(iv)}:${bytesToB64(new Uint8Array(ct))}`;
}

async function unsealWith(key: CryptoKey, envelope: string): Promise<string> {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== 'sealed' || parts[1] !== 'v1') {
    throw new Error('Not a sealed value.');
  }
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(parts[2]) as BufferSource },
    key,
    b64ToBytes(parts[3]) as BufferSource
  );
  return new TextDecoder().decode(pt);
}

// Create a vault: returns the salt and check value to keep on the
// profile, and leaves the vault unlocked on this device.
export async function createVault(
  passphrase: string
): Promise<{ salt: string; check: string }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const check = await sealWith(key, CHECK_PLAINTEXT);
  currentKey = key;
  notify();
  return { salt: bytesToB64(salt), check };
}

// Unlock with the profile's salt and check value. Returns false when
// the passphrase does not open the vault.
export async function unlockVault(
  passphrase: string,
  saltB64: string,
  check: string
): Promise<boolean> {
  try {
    const key = await deriveKey(passphrase, b64ToBytes(saltB64));
    const opened = await unsealWith(key, check);
    if (opened !== CHECK_PLAINTEXT) return false;
    currentKey = key;
    notify();
    return true;
  } catch {
    return false;
  }
}

export function lockVault(): void {
  currentKey = null;
  notify();
}

export async function sealText(plaintext: string): Promise<string> {
  if (!currentKey) throw new Error('The vault is locked.');
  return sealWith(currentKey, plaintext);
}

export async function unsealText(envelope: string): Promise<string> {
  if (!currentKey) throw new Error('The vault is locked.');
  return unsealWith(currentKey, envelope);
}
