const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA } = require('./settings');

const FILE = path.join(DATA, 'users.json');
let users = [];
try { users = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(users, null, 1));

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const pub = (u) => ({ id: u.id, username: u.username, disabled: !!u.disabled, maxPerDay: u.maxPerDay ?? null, createdAt: u.createdAt });

const list = () => users.map(pub);
const get = (id) => users.find((u) => u.id === id);
const byName = (n) => users.find((u) => u.username.toLowerCase() === String(n).toLowerCase());

function create(username, password, maxPerDay) {
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username || '')) throw new Error('Username: 3-24 characters (a-z, 0-9, _ . -)');
  if (String(password || '').length < 6) throw new Error('Password must be at least 6 characters');
  if (username.toLowerCase() === 'admin' || byName(username)) throw new Error('This username is already taken');
  const salt = crypto.randomBytes(16).toString('hex');
  const u = { id: crypto.randomBytes(5).toString('hex'), username, salt, hash: hash(password, salt),
    maxPerDay: maxPerDay ? Number(maxPerDay) : null, disabled: false, createdAt: Date.now() };
  users.push(u); save(); return pub(u);
}
function verify(username, password) {
  const u = byName(username);
  if (!u || u.disabled) return null;
  const a = Buffer.from(hash(password, u.salt)), b = Buffer.from(u.hash);
  return crypto.timingSafeEqual(a, b) ? u : null;
}
function update(id, patch) {
  const u = get(id); if (!u) throw new Error('User not found');
  if (patch.password) { if (patch.password.length < 6) throw new Error('Password must be at least 6 characters'); u.salt = crypto.randomBytes(16).toString('hex'); u.hash = hash(patch.password, u.salt); }
  if (patch.disabled !== undefined) u.disabled = !!patch.disabled;
  if (patch.maxPerDay !== undefined) u.maxPerDay = patch.maxPerDay ? Number(patch.maxPerDay) : null;
  save(); return pub(u);
}
function remove(id) { users = users.filter((u) => u.id !== id); save(); }

module.exports = { list, get, create, verify, update, remove };
