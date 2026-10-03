// Verschlüsselung der Datendatei: Passwort -> PBKDF2 (SHA-256) -> AES-256-GCM, vorher gzip.
// Das Tool im Browser entschlüsselt genauso (Web Crypto), die Formate passen zusammen.
import crypto from 'node:crypto';
import zlib from 'node:zlib';

export const ITER = 600000;

export function encrypt(text, password) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(zlib.gzipSync(Buffer.from(text, 'utf8'))), c.final()]);
  const data = Buffer.concat([ct, c.getAuthTag()]); // Web Crypto erwartet Schlüsseltext und Prüfwert zusammen
  return JSON.stringify({ v: 1, iter: ITER, salt: salt.toString('base64'), iv: iv.toString('base64'), data: data.toString('base64') });
}

export function decrypt(fileText, password) {
  const o = JSON.parse(fileText);
  const key = crypto.pbkdf2Sync(password, Buffer.from(o.salt, 'base64'), o.iter, 32, 'sha256');
  const all = Buffer.from(o.data, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64'));
  d.setAuthTag(all.subarray(all.length - 16));
  const plain = Buffer.concat([d.update(all.subarray(0, all.length - 16)), d.final()]);
  return zlib.gunzipSync(plain).toString('utf8');
}
