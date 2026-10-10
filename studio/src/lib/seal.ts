export const NOTICE_LIMIT = 1024;

export type Notice = { title: string; age: string; body: string };

export function noticeBytes(notice: Notice) {
  return new TextEncoder().encode(JSON.stringify(notice)).length;
}

function bytesToB64(bytes: Uint8Array) {
  let raw = "";
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw);
}

function b64ToBytes(value: string) {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array) {
  const saltBuf = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuf).set(salt);
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuf, iterations: 120000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealNotice(notice: Notice, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const hidden = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(notice))),
  );
  const packed = new Uint8Array(salt.length + iv.length + hidden.length);
  packed.set(salt, 0);
  packed.set(iv, salt.length);
  packed.set(hidden, salt.length + iv.length);
  return bytesToB64(packed);
}

export async function openNotice(sealed: string, password: string): Promise<Notice | null> {
  try {
    const packed = b64ToBytes(sealed);
    const key = await derive(password, packed.slice(0, 16));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: packed.slice(16, 28) }, key, packed.slice(28));
    const notice = JSON.parse(new TextDecoder().decode(plain)) as Notice;
    if (typeof notice.title !== "string" || typeof notice.body !== "string") return null;
    return notice;
  } catch {
    return null;
  }
}