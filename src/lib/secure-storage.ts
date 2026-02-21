/**
 * secure-storage.ts
 *
 * A drop-in encrypted wrapper around localStorage with IndexedDB shadowing for tamper detection.
 * - Keys   → SHA-256 hashed (unreadable in DevTools)
 * - Values → AES-256 encrypted
 * - Integrity → IndexedDB source-of-truth + In-memory Integrity Shadow
 *
 * API mirrors localStorage but is synchronous for reads (using in-memory shadow):
 *   secureStorage.setItemTracked(key, value)
 *   secureStorage.getItem(key)  → string | null
 *   secureStorage.removeItemTracked(key)
 *   secureStorage.clear(prefix?)
 */

"use client";

import CryptoJS from "crypto-js";

// ─── Constants ────────────────────────────────────────────────────────────
const PASSPHRASE = "ncl_cache_secret_v1_!xQ9#mP2@kR5";
const KEY_PREFIX = "ncl_";
const DB_NAME = "ncl_secure_storage";
const STORE_NAME = "entries";
const DB_VERSION = 1;

// ─── State ────────────────────────────────────────────────────────────────
// Stores the ENCRYPTED values from IndexedDB for synchronous integrity checking and repair.
// Map<HashedLocalStorageKey, EncryptedValueFromIDB>
const integrityShadow = new Map<string, string>();
let isInitialized = false;
let initPromise: Promise<void> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────
function hashKey(key: string): string {
  return KEY_PREFIX + CryptoJS.SHA256(key).toString(CryptoJS.enc.Hex).slice(0, 32);
}

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

// ─── IndexedDB Core ───────────────────────────────────────────────────────
async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key: string): Promise<string | null> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {}
}

async function idbRemove(key: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {}
}

async function idbClear(): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {}
}

async function idbGetAll(): Promise<Record<string, string>> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      const keysRequest = store.getAllKeys();
      
      request.onsuccess = () => {
        const values = request.result;
        keysRequest.onsuccess = () => {
          const keys = keysRequest.result as string[];
          const result: Record<string, string> = {};
          keys.forEach((key, i) => { result[key] = values[i]; });
          resolve(result);
        };
      };
      keysRequest.onerror = () => reject(keysRequest.error);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return {};
  }
}

// ─── Public API ───────────────────────────────────────────────────────────
export const secureStorage = {
  /**
   * Initializes the integrity map from IndexedDB.
   * Called automatically by chatCache.
   */
  async init(): Promise<void> {
    if (typeof window === "undefined" || isInitialized) return;
    if (initPromise) return initPromise;

    initPromise = (async () => {
      const idbData = await idbGetAll();
      
      // Populate integrity map and repair localStorage if needed
      Object.entries(idbData).forEach(([hashedKey, encryptedValue]) => {
        integrityShadow.set(hashedKey, encryptedValue);
        
        // 🔄 REPAIR: If LS is missing or different, restore from IDB
        const lsValue = localStorage.getItem(hashedKey);
        if (lsValue !== encryptedValue) {
          localStorage.setItem(hashedKey, encryptedValue);
        }
      });

      // 🛡️ STRICT INTEGRITY: If LS has keys that aren't in IDB shadow, wipe them
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX) && k !== secureStorage._registryKey && !integrityShadow.has(k)) {
          localStorage.removeItem(k);
        }
      }

      isInitialized = true;
    })();

    return initPromise;
  },

  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    const hashed = hashKey(key);
    let encrypted = localStorage.getItem(hashed);
    
    // 🛡️ MULTI-STAGE INTEGRITY CHECK
    if (isInitialized) {
      const idbShadowValue = integrityShadow.get(hashed);

      // Scenario A: LS value doesn't match IDB shadow
      if (encrypted !== idbShadowValue) {
          if (idbShadowValue) {
            // Restore from IDB (Local Tamper Recovery)
            localStorage.setItem(hashed, idbShadowValue);
            encrypted = idbShadowValue;
          } else {
            // No IDB copy (IDB Tamper / Deletion)
            if (encrypted) localStorage.removeItem(hashed);
            return null;
          }
      }
    }

    if (!encrypted) return null;
    const decrypted = decrypt(encrypted);

    // Scenario B: Decryption failure (IDB tampered with bad crypto data)
    if (decrypted === null) {
        localStorage.removeItem(hashed);
        idbRemove(hashed);
        integrityShadow.delete(hashed);
        return null;
    }

    return decrypted;
  },

  /**
   * Encrypts and stores in both LocalStorage and IndexedDB (Tamper Protected).
   */
  setItemTracked(key: string, value: string): void {
    if (typeof window === "undefined") return;
    const hashed = hashKey(key);
    const encrypted = encrypt(value);
    
    try {
      // 1. LocalStorage (Synchronous)
      localStorage.setItem(hashed, encrypted);
      
      // 2. In-Memory Shadow (Synchronous)
      integrityShadow.set(hashed, encrypted);
      
      // 3. IndexedDB Shadow (Asynchronous)
      idbSet(hashed, encrypted);

      // 4. Registry Update
      const registry = secureStorage._getRegistry();
      registry[key] = hashed;
      secureStorage._saveRegistry(registry);
    } catch (e) {
      console.warn("[secureStorage] setItemTracked failed:", e);
    }
  },

  removeItemTracked(key: string): void {
    if (typeof window === "undefined") return;
    const hashed = hashKey(key);
    
    localStorage.removeItem(hashed);
    integrityShadow.delete(hashed);
    idbRemove(hashed);

    const registry = secureStorage._getRegistry();
    delete registry[key];
    secureStorage._saveRegistry(registry);
  },

  clear(prefix?: string): void {
    if (typeof window === "undefined") return;
    
    if (!prefix) {
      // Full clear
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX)) toRemove.push(k);
      }
      toRemove.forEach((k) => {
        localStorage.removeItem(k);
        integrityShadow.delete(k);
        idbRemove(k);
      });
      idbClear();
    } else {
      // Prefix clear
      const registry = secureStorage._getRegistry();
      const toRemove = Object.keys(registry).filter((origKey) => origKey.startsWith(prefix));
      
      toRemove.forEach((origKey) => {
        const hashed = registry[origKey];
        localStorage.removeItem(hashed);
        idbRemove(hashed);
        integrityShadow.delete(hashed);
        delete registry[origKey];
      });
      secureStorage._saveRegistry(registry);
    }
  },

  // ── Registry Helpers ───────────────────────────────────────────────────
  _registryKey: KEY_PREFIX + "registry",

  _getRegistry(): Record<string, string> {
    try {
      const raw = localStorage.getItem(secureStorage._registryKey);
      if (!raw) return {};
      const dec = decrypt(raw);
      return dec ? JSON.parse(dec) : {};
    } catch {
      return {};
    }
  },

  _saveRegistry(registry: Record<string, string>): void {
    const json = JSON.stringify(registry);
    const encrypted = encrypt(json);
    localStorage.setItem(secureStorage._registryKey, encrypted);
    // Registry is also shadowed
    integrityShadow.set(secureStorage._registryKey, encrypted);
    idbSet(secureStorage._registryKey, encrypted);
  },

  keysByPrefix(prefix: string): string[] {
    const registry = secureStorage._getRegistry();
    return Object.keys(registry).filter((k) => k.startsWith(prefix));
  },
};
