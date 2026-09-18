#!/usr/bin/env node
// Escaner de secretos para el hook pre-commit (S3, verificacion 9).
//
// Revisa SOLO las lineas que el commit agrega (`git diff --cached`), no el historial: la red
// debe impedir que entre un secreto nuevo sin bloquear por contenido ya versionado.
// Sin dependencias: corre con el Node 24 del equipo en Windows, Linux y macOS.
//
// Excepcion puntual: una linea que termina en `secret-scan:allow` se ignora. Usala solo para
// valores ficticios documentados y deja el motivo en el mismo comentario.

import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Archivos que nunca deben versionarse, sin importar su contenido.
const FORBIDDEN_FILES = [
  { re: /(^|\/)\.env(\.[^/]*)?$/, allow: /\.env\.example$/, why: 'archivo .env con configuracion local' },
  { re: /\.(pem|p12|pfx|jks|keystore)$/i, why: 'almacen de claves o certificado' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, why: 'clave SSH privada' },
];

// Patrones de alta confianza: se aplican a todo archivo, incluidas pruebas y plantillas.
const HIGH_CONFIDENCE = [
  { name: 'clave privada PEM', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/ },
  { name: 'AWS access key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: 'token de GitHub', re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'token fine-grained de GitHub', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/ },
  { name: 'API key de Google', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'token de Slack', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'clave de Stripe', re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/ },
  { name: 'JWT firmado', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'URL con credenciales', re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s:/@]{4,}@[^\s/]+/i },
];

// Asignacion de una credencial a un valor literal. Solo en codigo y configuracion de produccion:
// las pruebas usan contrasenas ficticias a proposito y las plantillas *.example son publicas.
const KEY = String.raw`(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|private[_-]?key|client[_-]?secret|token)`;
const ASSIGNMENT = [
  // YAML, properties, .env:  jwt-secret: valor   |   DB_PASSWORD=valor
  { name: 'credencial en configuracion', files: /\.(ya?ml|properties|env|conf|ini|toml)$|(^|\/)docker-compose[^/]*$/i,
    re: new RegExp(String.raw`^\s*[\w.-]*${KEY}[\w.-]*\s*[:=]\s*["']?([^\s"'#]+)`, 'i') },
  // Java, TS, JS:  String password = "valor"   |   apiKey: 'valor'
  { name: 'credencial literal en codigo', files: /\.(java|kt|ts|tsx|js|jsx|mjs|cjs)$/i,
    re: new RegExp(String.raw`[\w]*${KEY}[\w]*["']?\s*[:=]\s*["']([^"']{8,})["']`, 'i') },
];
const TEST_OR_TEMPLATE = /(^|\/)src\/test\/|\.test\.[jt]sx?$|\.spec\.[jt]sx?$|\.example$|(^|\/)docs\//;
// Valores que no son secretos: referencias a variables, marcadores y ficticios declarados.
const PLACEHOLDER = /^\$\{|^\$[A-Z_]|CHANGE_ME|changeme|example|placeholder|test-only|dummy|xxx+|^<.*>$|^\*+$|^(true|false|null|none)$/i;

const mask = (s) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-2)} (${s.length} caracteres)`);

// --all: audita todo el contenido versionado (diff contra el arbol vacio), no solo lo staged.
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const range = process.argv.includes('--all') ? [EMPTY_TREE, 'HEAD'] : ['--cached'];
const staged = git('diff', ...range, '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
const findings = [];

for (const file of staged) {
  for (const f of FORBIDDEN_FILES) {
    if (f.re.test(file) && !(f.allow && f.allow.test(file))) findings.push({ file, line: '-', rule: f.why, value: '' });
  }
}

const diff = git('diff', ...range, '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR');
let file = null;
let lineNo = 0;
for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ ')) { file = raw.slice(4).replace(/^b\//, ''); continue; }
  const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) { lineNo = Number(hunk[1]); continue; }
  if (!file || !raw.startsWith('+')) continue;
  const text = raw.slice(1);
  const current = lineNo++;
  if (/secret-scan:allow/.test(text)) continue;

  for (const p of HIGH_CONFIDENCE) {
    const m = text.match(p.re);
    if (m) findings.push({ file, line: current, rule: p.name, value: mask(m[0]) });
  }
  if (TEST_OR_TEMPLATE.test(file)) continue;
  for (const p of ASSIGNMENT) {
    if (!p.files.test(file)) continue;
    const m = text.match(p.re);
    if (m && !PLACEHOLDER.test(m[1])) findings.push({ file, line: current, rule: p.name, value: mask(m[1]) });
  }
}

if (findings.length === 0) {
  console.log('[secret-scan] OK: ningun secreto en las lineas agregadas.');
  process.exit(0);
}

console.error('\n[secret-scan] COMMIT BLOQUEADO: posibles secretos en el cambio.\n');
for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.rule}${f.value ? `  -> ${f.value}` : ''}`);
console.error(`
Que hacer:
  1. Quita el valor del archivo y leelo de una variable de entorno (.env, que no se versiona).
  2. Si ya estaba en un commit anterior, considera el secreto comprometido y rotalo.
  3. Si es un valor ficticio documentado, termina la linea con "secret-scan:allow" y el motivo.
`);
process.exit(1);
