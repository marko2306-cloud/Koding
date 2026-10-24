#!/usr/bin/env node
// CueCast license key tool. Keys are ECDSA P-256 signatures, verified offline in
// index.html with an embedded PUBLIC key. Only the holder of the PRIVATE key
// (tools/private-key.json, never commit it) can make a key that passes.
//
//   node tools/keygen.mjs init                 create a new key pair and write the public key into index.html
//   node tools/keygen.mjs lifetime [count]     issue lifetime Pro key(s)
//   node tools/keygen.mjs monthly [days]       issue a Pro key that expires after N days (default 35)
//   node tools/keygen.mjs verify <key>         check a key against the public key in index.html
import { webcrypto as crypto } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PRIV = join(here, 'private-key.json');
const HTML = join(here, '..', 'index.html');
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32
const ALG = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

function b32(bytes) {
  let bits = 0, val = 0, out = '';
  for (const b of bytes) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(val << (5 - bits)) & 31];
  return out;
}
const group = (s, n) => s.match(new RegExp('.{1,' + n + '}', 'g')).join('-');
const message = (plan, exp, id) => new TextEncoder().encode(`CUECAST|v1|${plan}|${exp}|${id}`);

async function issue(plan, days) {
  if (!existsSync(PRIV)) throw new Error('No private key. Run: node tools/keygen.mjs init');
  const jwk = JSON.parse(readFileSync(PRIV, 'utf8'));
  const key = await crypto.subtle.importKey('jwk', jwk, ALG, false, ['sign']);
  let exp = '00000000';
  if (plan === 'M') {
    const d = new Date(Date.now() + days * 864e5);
    exp = d.toISOString().slice(0, 10).replace(/-/g, '');
  }
  const id = b32(crypto.getRandomValues(new Uint8Array(5))); // 8 chars
  const sig = new Uint8Array(await crypto.subtle.sign(SIGN, key, message(plan, exp, id)));
  return `CC-${plan}-${exp}-${id}-${group(b32(sig), 8)}`;
}

async function init() {
  if (existsSync(PRIV) && !process.argv.includes('--force')) {
    throw new Error('tools/private-key.json already exists. Re-run with --force to replace it (all issued keys stop working).');
  }
  const pair = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const priv = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
  writeFileSync(PRIV, JSON.stringify(priv, null, 2) + '\n', { mode: 0o600 });
  const html = readFileSync(HTML, 'utf8');
  const line = `const LICENSE_PUBLIC_KEY = ${JSON.stringify({ kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y })};`;
  const next = html.replace(/const LICENSE_PUBLIC_KEY = \{[^\n]*\};/, line);
  if (next === html) throw new Error('Could not find LICENSE_PUBLIC_KEY in index.html');
  writeFileSync(HTML, next);
  console.log('New key pair created.\n  private: tools/private-key.json  (back it up, never commit or share it)\n  public:  written into index.html');
}

async function verify(raw) {
  const html = readFileSync(HTML, 'utf8');
  const m = html.match(/const LICENSE_PUBLIC_KEY = (\{[^\n]*\});/);
  const pub = await crypto.subtle.importKey('jwk', JSON.parse(m[1]), ALG, false, ['verify']);
  const parts = raw.trim().toUpperCase().replace(/\s+/g, '').split('-');
  const [cc, plan, exp, id, ...rest] = parts;
  const sigStr = rest.join('');
  const bytes = []; let bits = 0, val = 0;
  for (const ch of sigStr) { const v = ALPHA.indexOf(ch); if (v < 0) return false; val = (val << 5) | v; bits += 5; if (bits >= 8) { bytes.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  if (cc !== 'CC' || bytes.length !== 64) return false;
  return crypto.subtle.verify(SIGN, pub, new Uint8Array(bytes), message(plan, exp, id));
}

const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === 'init') await init();
  else if (cmd === 'lifetime') { for (let i = 0; i < (+arg || 1); i++) console.log(await issue('L')); }
  else if (cmd === 'monthly') console.log(await issue('M', +arg || 35));
  else if (cmd === 'verify') console.log((await verify(arg || '')) ? 'VALID' : 'INVALID');
  else console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 9).join('\n').replace(/^\/\/ ?/gm, ''));
} catch (e) { console.error('Error: ' + e.message); process.exit(1); }
