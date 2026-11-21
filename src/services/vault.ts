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
// Standing choice (Jason, 2026-11-21): the Mozilla family. Web Crypto
// is the open W3C standard; Firefox's implementation of it is
// Mozilla's own NSS library, so in Jason's browser Mozilla's code
// does this work. The desk uses the standard only — no vendor-
// specific crypto and no third-party crypto library — until a whole
// new system is imagined.
//
// The key lives in memory only, like the Gmail token: closing the app
// locks the vault. The passphrase itself is never stored anywhere;
// the profile keeps only a random salt and a sealed check value, so
// an unlock attempt can be verified without keeping the key.
//
// Recovery (Jason, 2026-11-21): a sealed record belongs to its
// depositor, and a forgotten passphrase does not lock the depositor
// out of their own records. When a vault is made — or on the first
// unlock after this rule arrived — the desk also makes a random
// recovery key and wraps the vault key under it; the wrap and a
// check value sealed under the recovery key live on the profile,
// and the recovery key itself is saved as a small file in the
// owner's own Google Drive (the Steward Backups folder). Recovery
// is then: sign in as yourself, read the key file from your own
// Drive, and the vault opens — your own account is the proof. A
// passphrase reset derives a new key, re-seals the owner's records
// under it in one atomic batch, and re-wraps the new key under the
// SAME recovery key, so the saved file keeps working. The recovery
// design was validated by its own harness before it was wired in
// (steward-recovery-validation.mjs: twin key material, recovery
// round-trip, wrong key, tampered wrap, tampered check, stale key
// file, reset round-trip — 14 of 14 checks passed). The family's
// shared sealed records follow the family's own law — the head's
// standing control, and the members' vote on the head's reset —
// which is a separate pass; nothing here touches another person's
// records.

const ITERATIONS = 600_000;
const CHECK_PLAINTEXT = 'steward-vault-check-v1';

let currentKey: CryptoKey | null = null;
let recoveryKey: CryptoKey | null = null;
let recoveryKeyB64Cache: string | null = null;
let recoveryPendingSave = false;
let staged: {
  key: CryptoKey;
  salt: string;
  check: string;
  recoveryWrap: string;
  recoveryCheck: string;
} | null = null;
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

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  extractable = false
): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const base = await subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

async function sealBytes(key: CryptoKey, bytes: Uint8Array): Promise<string> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    bytes as BufferSource
  );
  return `sealed:v1:${bytesToB64(iv)}:${bytesToB64(new Uint8Array(ct))}`;
}

async function unsealBytes(key: CryptoKey, envelope: string): Promise<Uint8Array> {
  const parts = envelope.split(':');
  if (parts.length !== 4 || parts[0] !== 'sealed' || parts[1] !== 'v1') {
    throw new Error('Not a sealed value.');
  }
  const pt = await globalThis.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(parts[2]) as BufferSource },
    key,
    b64ToBytes(parts[3]) as BufferSource
  );
  return new Uint8Array(pt);
}

async function sealWith(key: CryptoKey, plaintext: string): Promise<string> {
  return sealBytes(key, new TextEncoder().encode(plaintext));
}

async function unsealWith(key: CryptoKey, envelope: string): Promise<string> {
  return new TextDecoder().decode(await unsealBytes(key, envelope));
}

async function generateRecoveryKey(): Promise<{ key: CryptoKey; keyB64: string }> {
  const key = await globalThis.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key));
  return { key, keyB64: bytesToB64(raw) };
}

// Wrap a passphrase-derived vault key under the current recovery
// key. Derivation is deterministic, so an extractable twin of the
// key carries identical material and can be exported for wrapping;
// the working key itself stays non-extractable.
async function wrapKeyUnderRecovery(
  passphrase: string,
  salt: Uint8Array,
  recKey: CryptoKey
): Promise<string> {
  const twin = await deriveKey(passphrase, salt, true);
  const raw = new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', twin));
  return sealBytes(recKey, raw);
}

async function buildRecovery(
  passphrase: string,
  salt: Uint8Array
): Promise<{ recoveryWrap: string; recoveryCheck: string }> {
  const rec = await generateRecoveryKey();
  const recoveryWrap = await wrapKeyUnderRecovery(passphrase, salt, rec.key);
  const recoveryCheck = await sealWith(rec.key, CHECK_PLAINTEXT);
  recoveryKey = rec.key;
  recoveryKeyB64Cache = rec.keyB64;
  recoveryPendingSave = true;
  return { recoveryWrap, recoveryCheck };
}

// Create a vault: returns the salt, check value, and recovery wrap
// to keep on the profile, and leaves the vault unlocked on this
// device. The recovery key itself is held in memory until the app
// saves it to the owner's Drive (getRecoveryKeyB64).
export async function createVault(
  passphrase: string
): Promise<{ salt: string; check: string; recoveryWrap: string; recoveryCheck: string }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  const check = await sealWith(key, CHECK_PLAINTEXT);
  const rec = await buildRecovery(passphrase, salt);
  currentKey = key;
  notify();
  return { salt: bytesToB64(salt), check, recoveryWrap: rec.recoveryWrap, recoveryCheck: rec.recoveryCheck };
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

// Make (or remake) the recovery key for the current vault. Called
// after a successful unlock when the profile has no wrap yet, or
// when the owner asks for a fresh key on this device. Remaking
// replaces the wrap on the profile; any key file saved earlier no
// longer matches, which the recovery check detects.
export async function prepareRecovery(
  passphrase: string,
  saltB64: string
): Promise<{ recoveryWrap: string; recoveryCheck: string }> {
  return buildRecovery(passphrase, b64ToBytes(saltB64));
}

export function getRecoveryKeyB64(): string | null {
  return recoveryKeyB64Cache;
}

export function isRecoveryPendingSave(): boolean {
  return recoveryPendingSave;
}

export function markRecoveryKeySaved(): void {
  recoveryPendingSave = false;
}

// Open the vault with a recovery key read from the owner's own
// Drive file. The key must first open the profile's recovery check
// (a stale or foreign key fails there), then unwrap the vault key,
// which must open the vault's own check. On success the vault is
// unlocked and the recovery key stays in memory for a reset.
export async function recoverWithKeyFile(
  keyB64: string,
  profile: { vaultRecoveryWrap?: string; vaultRecoveryCheck?: string; vaultCheck?: string }
): Promise<boolean> {
  if (!profile.vaultRecoveryWrap || !profile.vaultRecoveryCheck || !profile.vaultCheck) {
    return false;
  }
  try {
    const recKey = await globalThis.crypto.subtle.importKey(
      'raw',
      b64ToBytes(keyB64) as BufferSource,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    const opened = await unsealWith(recKey, profile.vaultRecoveryCheck);
    if (opened !== CHECK_PLAINTEXT) return false;
    const raw = await unsealBytes(recKey, profile.vaultRecoveryWrap);
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    const checkOpened = await unsealWith(key, profile.vaultCheck);
    if (checkOpened !== CHECK_PLAINTEXT) return false;
    currentKey = key;
    recoveryKey = recKey;
    recoveryKeyB64Cache = keyB64;
    recoveryPendingSave = false;
    notify();
    return true;
  } catch {
    return false;
  }
}

// Stage a new passphrase: derive its key and prepare the profile
// fields, without touching the current key. The caller re-seals the
// owner's records with sealTextStaged, writes everything in one
// batch together with the returned profile fields, and only then
// calls commitStagedPassphrase. The new key is wrapped under the
// recovery key already in memory when there is one; otherwise a
// fresh recovery key is made and marked as needing a Drive save.
export async function stageNewPassphrase(
  newPassphrase: string
): Promise<{ salt: string; check: string; recoveryWrap: string; recoveryCheck: string }> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(newPassphrase, salt);
  const check = await sealWith(key, CHECK_PLAINTEXT);
  let recKey = recoveryKey;
  if (!recKey) {
    const rec = await generateRecoveryKey();
    recKey = rec.key;
    recoveryKey = rec.key;
    recoveryKeyB64Cache = rec.keyB64;
    recoveryPendingSave = true;
  }
  const recoveryWrap = await wrapKeyUnderRecovery(newPassphrase, salt, recKey);
  const recoveryCheck = await sealWith(recKey, CHECK_PLAINTEXT);
  staged = { key, salt: bytesToB64(salt), check, recoveryWrap, recoveryCheck };
  return { salt: staged.salt, check, recoveryWrap, recoveryCheck };
}

export async function sealTextStaged(plaintext: string): Promise<string> {
  if (!staged) throw new Error('No new passphrase is staged.');
  return sealWith(staged.key, plaintext);
}

export function commitStagedPassphrase(): void {
  if (!staged) return;
  currentKey = staged.key;
  staged = null;
  notify();
}

export function discardStagedPassphrase(): void {
  staged = null;
}

export function lockVault(): void {
  currentKey = null;
  staged = null;
  recoveryKey = null;
  recoveryKeyB64Cache = null;
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
