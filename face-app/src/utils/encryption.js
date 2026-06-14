// Encryption utilities for face embeddings and sensitive data
// Uses Web Crypto API for browser-native encryption

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
let encryptionKey = null;

// Generate or retrieve encryption key
export async function getEncryptionKey() {
  if (encryptionKey) return encryptionKey;

  // Try to get existing key from localStorage
  const storedKey = localStorage.getItem("faceSystemKey");
  
  if (storedKey) {
    try {
      const keyData = JSON.parse(storedKey);
      encryptionKey = await crypto.subtle.importKey(
        "jwk",
        keyData,
        { name: ALGORITHM },
        true,
        ["encrypt", "decrypt"]
      );
      return encryptionKey;
    } catch (e) {
      console.warn("Failed to load encryption key, generating new one");
    }
  }

  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"]
  );

  // Export and store
  const exported = await crypto.subtle.exportKey("jwk", key);
  localStorage.setItem("faceSystemKey", JSON.stringify(exported));
  encryptionKey = key;
  
  return key;
}

// Encrypt data (returns base64 string)
export async function encryptData(data) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(JSON.stringify(data));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBuffer
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// Decrypt data (expects base64 string)
export async function decryptData(encryptedBase64) {
  const key = await getEncryptionKey();
  
  const combined = new Uint8Array(
    atob(encryptedBase64).split("").map(c => c.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

// Encrypt face descriptor (Float32Array)
export async function encryptDescriptor(descriptor) {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Convert Float32Array to ArrayBuffer
  const buffer = descriptor.buffer.slice(
    descriptor.byteOffset,
    descriptor.byteOffset + descriptor.byteLength
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    buffer
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// Decrypt face descriptor (returns Float32Array)
export async function decryptDescriptor(encryptedBase64, length = 128) {
  const key = await getEncryptionKey();
  
  const combined = new Uint8Array(
    atob(encryptedBase64).split("").map(c => c.charCodeAt(0))
  );

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  return new Float32Array(decrypted);
}

// Clear encryption key (for logout/security)
export function clearEncryptionKey() {
  encryptionKey = null;
  localStorage.removeItem("faceSystemKey");
}

// Check if encryption is initialized
export function isEncryptionReady() {
  return encryptionKey !== null;
}