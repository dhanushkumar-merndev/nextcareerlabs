/**
 * secure-storage.ts
 *
 * A drop-in encrypted wrapper around localStorage.
 * - Keys   → SHA-256 hashed  (unreadable in DevTools)
 * - Values → AES-256 encrypted with a derived passphrase
 *
 * The passphrase is a build-time constant.  Because it lives in the
 * JavaScript bundle it does NOT protect against a determined attacker
 * who can read the source, but it DOES prevent:
 *   • Casual inspection of DevTools → Application → Local Storage
 *   • Browser extensions that scan localStorage for sensitive strings
 *   • Automated bots/scrapers reading user data from localStorage
 *
 * API mirrors localStorage but is synchronous (crypto-js is sync):
 *   secureStorage.setItem(key, value)
 *   secureStorage.getItem(key)  → string | null
 *   secureStorage.removeItem(key)
 *   secureStorage.clear(prefix?) – clears all or only keys matching prefix
 *   secureStorage.keys(prefix?)  – returns decrypted keys with given prefix
 */

"use client";

import CryptoJS from "crypto-js";

// ─── Passphrase ────────────────────────────────────────────────────────────
// Change this to any random string.  Rotating it invalidates existing cache
// (users get a cold-cache experience once, then it re-populates).
const PASSPHRASE = "ncl_cache_secret_v1_!xQ9#mP2@kR5";

// ─── Key hashing ──────────────────────────────────────────────────────────
// We store keys as "ncl_" + SHA256(originalKey) so they're unreadable
// but deterministic (same key always maps to the same hash).
const KEY_PREFIX = "ncl_";

function hashKey(key: string): string {
  return KEY_PREFIX + CryptoJS.SHA256(key).toString(CryptoJS.enc.Hex).slice(0, 32);
}

// ─── Value encryption / decryption ────────────────────────────────────────
function encrypt(plaintext: string): string {
  return CryptoJS.AES.encrypt(plaintext, PASSPHRASE).toString();
}

function decrypt(ciphertext: string): string | null {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, PASSPHRASE);
    const result = bytes.toString(CryptoJS.enc.Utf8);
    return result || null;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────
export const secureStorage = {
  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(hashKey(key), encrypt(value));
    } catch (e) {
      console.warn("[secureStorage] setItem failed:", e);
    }
  },

  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      const encrypted = localStorage.getItem(hashKey(key));
      if (!encrypted) return null;
      return decrypt(encrypted);
    } catch {
      return null;
    }
  },

  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(hashKey(key));
    } catch {}
  },

  /**
   * Returns all original (plaintext) keys that are stored under the ncl_ prefix.
   * Because keys are hashed we cannot reverse them — instead we maintain a
   * separate key-map entry that stores the mapping.
   *
   * For our use-case (cache invalidation by prefix) we use a stored key registry.
   */
  clear(prefix?: string): void {
    if (typeof window === "undefined") return;
    if (!prefix) {
      // Remove only our own keys (ncl_ prefix) — don't nuke unrelated storage
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } else {
      // We can't reverse the hash, so we track hashed keys by prefix in a registry
      const registry = secureStorage._getRegistry();
      const toRemove = Object.keys(registry).filter((origKey) =>
        origKey.startsWith(prefix)
      );
      toRemove.forEach((origKey) => {
        localStorage.removeItem(registry[origKey]);
        delete registry[origKey];
      });
      secureStorage._saveRegistry(registry);
    }
  },

  // ── Key Registry ──────────────────────────────────────────────────────
  // Maps originalKey → hashedKey so we can support prefix-based clearing
  // and Object.keys() iteration over our own namespace.
  _registryKey: KEY_PREFIX + "registry",

  _getRegistry(): Record<string, string> {
    try {
      const raw = localStorage.getItem(secureStorage._registryKey);
      if (!raw) return {};
      // Registry is stored as plain (but encrypted) JSON
      const dec = decrypt(raw);
      if (!dec) return {};
      return JSON.parse(dec);
    } catch {
      return {};
    }
  },

  _saveRegistry(registry: Record<string, string>): void {
    try {
      localStorage.setItem(
        secureStorage._registryKey,
        encrypt(JSON.stringify(registry))
      );
    } catch {}
  },

  /**
   * Like localStorage.setItem but also registers the key for prefix-based ops.
   */
  setItemTracked(key: string, value: string): void {
    const hashed = hashKey(key);
    try {
      localStorage.setItem(hashed, encrypt(value));
      const registry = secureStorage._getRegistry();
      registry[key] = hashed;
      secureStorage._saveRegistry(registry);
    } catch (e) {
      console.warn("[secureStorage] setItemTracked failed:", e);
    }
  },

  /**
   * Remove a tracked key (updates registry too).
   */
  removeItemTracked(key: string): void {
    const hashed = hashKey(key);
    localStorage.removeItem(hashed);
    const registry = secureStorage._getRegistry();
    delete registry[key];
    secureStorage._saveRegistry(registry);
  },

  /**
   * Returns stored hashed keys that begin with the given prefix (by registry lookup).
   */
  keysByPrefix(prefix: string): string[] {
    const registry = secureStorage._getRegistry();
    return Object.keys(registry).filter((k) => k.startsWith(prefix));
  },
};
