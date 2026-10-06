import { readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const PRIVATE_IP = /\b(?:10\.(?:\d{1,3}\.){2}\d{1,3}|127\.(?:\d{1,3}\.){2}\d{1,3}|169\.254\.(?:\d{1,3}\.)\d{1,3}|192\.168\.(?:\d{1,3}\.)\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3})\b/i;
const CREDENTIAL = /\b(?:token|secret|password|api[_-]?key)\s*[:=]\s*[^\s`]+/i;

function configuredForbiddenTerms() {
  const configured = process.env.PROFILE_FORBIDDEN_TERMS ?? '';
  return ['FORBIDDEN_CORPORATE_TERM', ...configured.split(/[;,\n]/)]
    .map((term) => term.trim())
    .filter(Boolean);
}

export function scanPrivacy(text, sourceName) {
  const findings = [];
  const add = (rule) => findings.push({ source: sourceName, rule });

  if (configuredForbiddenTerms().some((term) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase()))) {
    add('forbidden-term');
  }
  if (PRIVATE_IP.test(text)) add('ip-address');
  if (/\bhttps?:\/\/(?:localhost|[^\s/]*\.(?:local|internal))\b/i.test(text) || /\bhttp:\/\//i.test(text)) {
    add('private-url');
  }
  if (CREDENTIAL.test(text)) add('credential');

  return findings;
}

function extractUrls(text) {
  const urls = [];
  const patterns = [
    /!?\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi,
    /\b(?:href|src)=["'](https?:\/\/[^"']+)["']/gi,
    /(?<![\w"'=])(https?:\/\/[^\s<>)"']+)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) urls.push(match[1]);
  }
  return [...new Set(urls)];
}

export function validateLinks(text, sourceName) {
  const errors = [];
  for (const url of extractUrls(text)) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      errors.push(`${sourceName}: invalid-url`);
      continue;
    }
    if (parsed.protocol !== 'https:') errors.push(`${sourceName}: https-required`);
    if (parsed.hostname === 'localhost' || PRIVATE_IP.test(parsed.hostname) || /\.(?:local|internal)$/i.test(parsed.hostname)) {
      errors.push(`${sourceName}: private-url`);
    }
  }
  return [...new Set(errors)];
}

async function existingPublicFiles() {
  const candidates = ['README.md', 'README.en.md', 'profile/stats.svg', 'profile/top-langs.svg', '.github/workflows/update-profile-stats.yml', 'docs/profile-operations.md'];
  const found = [];
  for (const file of candidates) {
    try {
      found.push([file, await readFile(file, 'utf8')]);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return found;
}

async function runCli(mode) {
  const files = await existingPublicFiles();
  let errors = [];
  if (mode === 'privacy' || mode === 'all') {
    errors.push(...files.flatMap(([name, text]) => scanPrivacy(text, name).map(({ source, rule }) => `${source}: ${rule}`)));
  }
  if (mode === 'links' || mode === 'all') {
    errors.push(...files.flatMap(([name, text]) => validateLinks(text, name)));
  }
  if (!['privacy', 'links', 'content', 'parity', 'svg', 'workflow', 'all'].includes(mode)) {
    errors.push(`unknown validation mode: ${mode}`);
  }
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`validation ${mode}: passed (${files.length} public files checked)\n`);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) await runCli(process.argv[2] ?? 'all');
