// Per-project signing: the keystore lives inside the project's own directory (keystore/), so it travels with the source zip to the runner
//   keystore/release.p12            <- keystore file
//   keystore/keystore.properties    ← storeFile / storePassword / keyAlias / keyPassword
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const forge = require('node-forge');

const DIR = 'keystore', PROPS = DIR + '/keystore.properties';
const PLAY_MIN_YEAR_MS = Date.UTC(2033, 9, 23); // Play Console: the key must stay valid past 22 Oct 2033
const ok = (s, label) => { if (!s || /[\r\n\0]/.test(s) || s !== s.trim()) throw new Error(label + ' is invalid (must not be empty, contain newlines, or start/end with spaces)'); return s; };

let KT = null; // whether keytool is available
const hasKeytool = () => { if (KT === null) { try { execFileSync('keytool', ['-help'], { stdio: 'pipe', timeout: 8000 }); KT = true; } catch (e) { KT = e.code !== 'ENOENT'; } } return KT; };
const keytool = (args, pass, keyPass) => execFileSync('keytool', args, { env: { ...process.env, KS_PASS: pass, KEY_PASS: keyPass || pass }, stdio: 'pipe', timeout: 25000 }).toString();
const msgOf = (e) => String(e.stderr || '') + String(e.stdout || '') + String(e.message || '');
function friendly(e) {
  const out = msgOf(e);
  if (/Alias <.*does not exist|alias.*does not exist/i.test(out)) return 'Alias not found in keystore';
  if (/Cannot recover key|UnrecoverableKey(?!.*integrity)/i.test(out) && !/Integrity/i.test(out)) return 'Key password is incorrect';
  if (/password was incorrect|Keystore was tampered|Integrity check failed|MAC could not be verified|Invalid password/i.test(out)) return 'Keystore password is incorrect';
  return 'Could not read keystore (must be .jks / .keystore / .p12)';
}
const colon = (hex) => hex.toUpperCase().replace(/(..)(?!$)/g, '$1:');

function readProps(W) {
  try {
    const o = {}; const t = W.read(PROPS).content;
    for (const l of t.split(/\r?\n/)) { const m = l.match(/^([A-Za-z]+)=(.*)$/); if (m) o[m[1]] = m[2]; }
    o.generated = /# generated/.test(t); return o;
  } catch { return null; }
}
const ksFile = (W, p) => path.join(W.root, DIR, path.basename(p.storeFile || ''));

function info(W) {
  const p = readProps(W); if (!p || !p.storeFile) return { has: false };
  const f = ksFile(W, p); if (!fs.existsSync(f)) return { has: false, broken: 'keystore.properties exists but the keystore file is missing' };
  const st = fs.statSync(f);
  return { has: true, file: `${DIR}/${path.basename(p.storeFile)}`, alias: p.keyAlias, generated: p.generated, size: st.size, createdAt: st.mtimeMs, hasPass: !!p.storePassword };
}

// ---- Verification (keytool if available, otherwise forge for PKCS12) ----
function inspectKeytool(file, alias, sp, kp) {
  let out;
  try { out = keytool(['-list', '-v', '-keystore', file, '-storepass:env', 'KS_PASS', '-alias', alias], sp); } catch (e) { throw new Error(friendly(e)); }
  const g = (re) => (out.match(re) || [])[1];
  const from = g(/Valid from:\s*(.+?)\s+until:/), until = g(/until:\s*(.+)/);
  const d = { tool: 'keytool', owner: g(/Owner:\s*(.+)/), sha1: g(/SHA1:\s*([0-9A-F:]+)/), sha256: g(/SHA256:\s*([0-9A-F:]+)/), validFrom: from && Date.parse(from), validTo: until && Date.parse(until), keyBits: +(g(/(\d+)-bit/) || 0), algo: g(/Subject Public Key Algorithm:\s*\d+-bit\s+(\w+)/) };
  const tmp = path.join(os.tmpdir(), 'csr-' + crypto.randomBytes(4).toString('hex'));
  try { keytool(['-certreq', '-alias', alias, '-keystore', file, '-storepass:env', 'KS_PASS', '-keypass:env', 'KEY_PASS', '-file', tmp], sp, kp); d.keyPassOk = true; }
  catch (e) { const m = friendly(e); if (/Key password is incorrect/.test(m)) d.keyPassOk = false; else d.keyPassOk = null; }
  finally { fs.rmSync(tmp, { force: true }); }
  return d;
}
function p12Parse(buf, sp) {
  try { return forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(buf.toString('binary')), sp); }
  catch (e) { throw new Error(friendly(e)); }
}
function inspectForge(buf, alias, sp) {
  const p12 = p12Parse(buf, sp);
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [];
  const bag = bags.find((b) => (b.attributes?.friendlyName || []).some((n) => n.toLowerCase() === alias.toLowerCase())) || (bags.length === 1 && !bags[0].attributes?.friendlyName ? bags[0] : null);
  if (!bag) throw new Error('Alias not found in keystore');
  const cert = bag.cert, der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const fp = (md) => colon(md.update(der).digest().toHex());
  return { tool: 'forge', owner: cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(', '), sha1: fp(forge.md.sha1.create()), sha256: fp(forge.md.sha256.create()),
    validFrom: +cert.validity.notBefore, validTo: +cert.validity.notAfter, keyBits: cert.publicKey.n ? cert.publicKey.n.bitLength() : 0, algo: 'RSA', keyPassOk: true };
}
function inspect(file, alias, sp, kp) {
  if (hasKeytool()) return inspectKeytool(file, alias, sp, kp);
  const buf = fs.readFileSync(file);
  try { return inspectForge(buf, alias, sp); }
  catch (e) { if (/Could not read keystore/.test(e.message)) return { tool: 'none' }; throw e; } // JKS without keytool: cannot verify here
}
function checks(d) {
  const c = [], now = Date.now();
  if (d.tool === 'none') return [{ ok: null, text: 'Verifying a JKS file needs a JDK (keytool) on the server — the runner will verify it during the build' }];
  c.push({ ok: true, text: 'Keystore opened, alias found' });
  c.push(d.keyPassOk === false ? { ok: false, text: 'Key password is incorrect' } : { ok: d.keyPassOk === null ? null : true, text: d.keyPassOk === null ? 'Key password not verified' : 'Key password is correct' });
  if (d.validTo) {
    const y = new Date(d.validTo).getFullYear();
    c.push(d.validTo < now ? { ok: false, text: `Expired (${y})` } : { ok: true, text: `Valid until ${y}` });
    c.push(d.validTo >= PLAY_MIN_YEAR_MS ? { ok: true, text: 'Play Console: valid beyond 2033 ✔' } : { ok: false, text: 'Play Console: must be valid beyond 22 Oct 2033' });
  }
  if (d.keyBits) c.push(d.keyBits >= 2048 ? { ok: true, text: `${d.algo || 'RSA'} ${d.keyBits}-bit ✔` } : { ok: false, text: `Key is only ${d.keyBits}-bit (2048+ required)` });
  return c;
}
function verify(W) {
  const p = readProps(W); if (!p || !p.storeFile) throw new Error('No keystore');
  const f = ksFile(W, p); if (!fs.existsSync(f)) throw new Error('Keystore file not found');
  const d = inspect(f, p.keyAlias || '', p.storePassword || '', p.keyPassword || p.storePassword || '');
  const cs = checks(d);
  return { ...info(W), ...d, checks: cs, good: cs.every((x) => x.ok !== false) };
}

function write(W, buf, filename, { alias, storePass, keyPass }, generated) {
  const old = readProps(W); // remove the previous file
  if (old?.storeFile && old.storeFile !== filename) fs.rmSync(ksFile(W, old), { force: true });
  W.write(`${DIR}/${filename}`, buf);
  W.write(PROPS, `# Android signing — the keystore/ folder travels with the source zip to the runner\n${generated ? '# generated by codespace\n' : ''}storeFile=${filename}\nstorePassword=${storePass}\nkeyAlias=${alias}\nkeyPassword=${keyPass || storePass}\n`);
}

// Upload: verify first, then place it into the project's keystore/ folder
function save(W, buf, { alias, storePass, keyPass, filename }) {
  if (buf.length < 100 || buf.length > 1024 * 1024) throw new Error('Invalid keystore file (empty or larger than 1 MB)');
  ok(alias, 'alias'); ok(storePass, 'keystore password'); if (keyPass) ok(keyPass, 'key password');
  let name = path.basename(String(filename || 'release.jks')).replace(/[^\w.-]/g, '_'); if (!/\.(jks|keystore|p12|pfx|bks)$/i.test(name)) name += '.jks';
  const tmp = path.join(os.tmpdir(), 'ks-' + crypto.randomBytes(4).toString('hex') + path.extname(name));
  fs.writeFileSync(tmp, buf);
  let d;
  try { d = inspect(tmp, alias, storePass, keyPass || storePass); if (d.keyPassOk === false) throw new Error('Key password is incorrect'); }
  finally { fs.rmSync(tmp, { force: true }); }
  write(W, buf, name, { alias, storePass, keyPass }, false);
  return verify(W);
}

// Generate a new keystore (PKCS#12, RSA 2048) into the project's keystore/ folder
function generate(W, { alias, storePass, cn, org, country, years }) {
  ok(alias, 'alias'); ok(storePass, 'password');
  if (storePass.length < 6) throw new Error('Password must be at least 6 characters');
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const fk = forge.pki.privateKeyFromPem(privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const cert = forge.pki.createCertificate();
  cert.publicKey = forge.pki.setRsaPublicKey(fk.n, fk.e);
  cert.serialNumber = '01' + crypto.randomBytes(8).toString('hex');
  cert.validity.notBefore = new Date(Date.now() - 86400e3);
  cert.validity.notAfter = new Date(Date.now() + 365.25 * 86400e3 * Math.min(Math.max(+years || 30, 1), 50));
  const attrs = [{ name: 'commonName', value: cn || alias }]; if (org) attrs.push({ name: 'organizationName', value: org });
  if (country && /^[A-Za-z]{2}$/.test(country)) attrs.push({ name: 'countryName', value: country.toUpperCase() });
  cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(fk, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(fk, [cert], storePass, { algorithm: '3des', friendlyName: alias });
  write(W, Buffer.from(forge.asn1.toDer(p12).getBytes(), 'binary'), 'release.p12', { alias, storePass, keyPass: storePass }, true);
  return verify(W);
}
function remove(W) {
  const p = readProps(W); if (p?.storeFile) fs.rmSync(ksFile(W, p), { force: true });
  fs.rmSync(path.join(W.root, PROPS), { force: true });
  try { if (!fs.readdirSync(path.join(W.root, DIR)).length) fs.rmdirSync(path.join(W.root, DIR)); } catch {}
}
function download(W) { const p = readProps(W); if (!p) throw new Error('No keystore'); return { name: path.basename(p.storeFile), buf: fs.readFileSync(ksFile(W, p)) }; }
// Certificate (PEM) for Play Console / Firebase
function certPem(W) {
  const p = readProps(W); if (!p) throw new Error('No keystore'); const f = ksFile(W, p);
  if (hasKeytool()) { try { return keytool(['-exportcert', '-rfc', '-alias', p.keyAlias, '-keystore', f, '-storepass:env', 'KS_PASS'], p.storePassword); } catch (e) { throw new Error(friendly(e)); } }
  const p12 = p12Parse(fs.readFileSync(f), p.storePassword);
  const bag = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || [])[0];
  return forge.pki.certificateToPem(bag.cert);
}
module.exports = { info, verify, save, generate, remove, download, certPem, hasKeytool, readProps };
