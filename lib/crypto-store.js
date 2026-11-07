// Encrypts tokens/secrets at rest (AES-256-GCM)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA, { recursive: true });
const KEYFILE = path.join(DATA, '.master-key');
let MASTER;
if (process.env.SIGNING_SECRET) MASTER = crypto.createHash('sha256').update(process.env.SIGNING_SECRET).digest();
else {
  if (!fs.existsSync(KEYFILE)) fs.writeFileSync(KEYFILE, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  MASTER = Buffer.from(fs.readFileSync(KEYFILE, 'utf8').trim(), 'hex');
}
const enc = (str) => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', MASTER, iv); const ct = Buffer.concat([c.update(String(str), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64'); };
const dec = (b64) => { try { const b = Buffer.from(b64, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', MASTER, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); } catch { return ''; } };
module.exports = { DATA, enc, dec };
