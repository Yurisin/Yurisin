import { readFile } from 'node:fs/promises';
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

const SECTION_IDS = ['language', 'header', 'about', 'capabilities', 'method', 'stack', 'cases', 'analytics', 'cta', 'footer'];
const PT_REQUIRED = [
  'Português | [English](./README.en.md)',
  'Alemão Dev',
  'Head de Tecnologia e Automação @ WZ Soluções',
  'processos manuais em sistemas escaláveis',
  'https://alemaodev.com/',
  'https://www.linkedin.com/in/yurisinn/',
  'https://www.instagram.com/alemaodev',
  'Agentes e IA aplicada',
  'Automação de processos',
  'Integrações e APIs',
  'Engenharia de produto',
  'Operação assistida por agentes',
  'A[Processo manual] --> B[Mapeamento]',
  'B --> C[Agentes e automações]',
  'C --> D[Integrações e APIs]',
  'D --> E[Validação e observabilidade]',
  'E --> F[Operação escalável]',
  'IA, agentes e conhecimento',
  'Automação, dados e navegação',
  'Engenharia',
  'Dados, infraestrutura e entrega',
  'Autoposter',
  'Viralizer',
  'Agente Consultor RAG',
  'Gestor Financeiro Automatizado',
  'Projeto privado — descrição sanitizada',
  'distribuição de código detectada',
  'não são uma medida de proficiência',
  'Conheça meu trabalho',
  'PT-BR · EN-US · UTC-3',
];

function validateSectionOrder(text, errors) {
  let previous = -1;
  for (const id of SECTION_IDS) {
    const current = text.indexOf(`<!-- section:${id} -->`);
    if (current < 0) errors.push(`missing-section:${id}`);
    else if (current <= previous) errors.push(`section-order:${id}`);
    previous = current;
  }
}

export function validateContent(text, locale) {
  const errors = [];
  validateSectionOrder(text, errors);
  const required = locale === 'pt-BR' ? PT_REQUIRED : [];
  for (const phrase of required) {
    if (!text.includes(phrase)) errors.push(`missing-required:${phrase.slice(0, 32)}`);
  }
  if (!['pt-BR', 'en-US'].includes(locale)) errors.push('unsupported-locale');

  const caseCount = (text.match(/(?:Projeto privado — descrição sanitizada|Private project — sanitized overview)/g) ?? []).length;
  if (caseCount !== 4) errors.push('private-case-count');
  if (/^###\s*\[[^\]]*(?:Autoposter|Viralizer|Agente Consultor RAG|Gestor Financeiro Automatizado)[^\]]*\]/im.test(text)) {
    errors.push('linked-private-case-heading');
  }
  if (/\[(?:Projeto privado|Private project)[^\]]*\]\(https?:\/\//i.test(text)) errors.push('private-case-link');
  if (/\b(?:São Paulo|Rio de Janeiro|cidade|city)\b/i.test(text)) errors.push('city-not-allowed');
  if (/\b(?:impacto|escala|scale|SLA|certifica(?:ção|ções)|certifications?)\b[^\n]{0,48}\b\d+(?:[.,]\d+)?\s*%/i.test(text)) {
    errors.push('unverified-numeric-claim');
  }
  for (const image of text.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    if (!image[1].trim()) errors.push('missing-image-alt');
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
  if (mode === 'content' || mode === 'all') {
    for (const [name, text] of files) {
      if (name === 'README.md') errors.push(...validateContent(text, 'pt-BR').map((error) => `${name}: ${error}`));
      if (name === 'README.en.md') errors.push(...validateContent(text, 'en-US').map((error) => `${name}: ${error}`));
    }
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
