import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { validateSvg } from './render-profile-svg.mjs';

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
  const credentialScanText = text
    .replace(
      /^\s*(?:PROFILE_STATS_TOKEN|GITHUB_TOKEN):\s*\$\{\{\s*(?:secrets\.PROFILE_STATS_TOKEN|github\.token)\s*\}\}\s*$/gmi,
      '',
    )
    .replace('https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git', 'SAFE_GITHUB_PUSH_URL');

  if (configuredForbiddenTerms().some((term) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase()))) {
    add('forbidden-term');
  }
  if (PRIVATE_IP.test(text)) add('ip-address');
  if (/\bhttps?:\/\/(?:localhost|[^\s/]*\.(?:local|internal))\b/i.test(text) || /\bhttp:\/\//i.test(text)) {
    add('private-url');
  }
  if (CREDENTIAL.test(credentialScanText)) add('credential');

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
const EN_REQUIRED = [
  '[Português](./README.md) | English',
  'Alemão Dev',
  'Head of Technology and Automation @ WZ Soluções',
  'manual processes into scalable systems',
  'https://alemaodev.com/',
  'https://www.linkedin.com/in/yurisinn/',
  'https://www.instagram.com/alemaodev',
  'AI agents and applied AI',
  'Process automation',
  'Integrations and APIs',
  'Product engineering',
  'Agent-assisted operations',
  'A[Manual process] --> B[Mapping]',
  'B --> C[Agents and automation]',
  'C --> D[Integrations and APIs]',
  'D --> E[Validation and observability]',
  'E --> F[Scalable operation]',
  'AI, agents, and knowledge',
  'Automation, data, and browser workflows',
  'Engineering',
  'Data, infrastructure, and delivery',
  'Autoposter',
  'Viralizer',
  'RAG Consultant Agent',
  'Automated Finance Manager',
  'Private project — sanitized overview',
  'distribution of code detected',
  'not a measure of proficiency',
  'Explore my work',
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
  const required = locale === 'pt-BR' ? PT_REQUIRED : locale === 'en-US' ? EN_REQUIRED : [];
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

const TECHNOLOGY_PATTERNS = [
  ['claude', /\bClaude\b/i], ['openai-codex', /OpenAI.{0,12}Codex/i], ['gemini', /\bGemini\b/i],
  ['openrouter', /\bOpenRouter\b/i], ['orca-ide', /\bOrca IDE\b/i],
  ['autonomous-agents', /Agentes autônomos|Autonomous agents/i], ['mcp', /\bMCP\b/],
  ['rag', /\bRAG\b/], ['embeddings', /\bEmbeddings\b/i], ['pgvector', /\bpgvector\b/i],
  ['n8n', /\bn8n\b/i], ['apify', /\bApify\b/i], ['playwright', /\bPlaywright\b/i],
  ['webhooks', /\bWebhooks\b/i], ['rest-apis', /REST APIs/i], ['typescript', /\bTypeScript\b/i],
  ['python', /\bPython\b/i], ['nodejs', /\bNode\.js\b/i], ['nextjs', /\bNext\.js\b/i],
  ['react', /\bReact\b/i], ['fastapi', /\bFastAPI\b/i], ['express', /\bExpress\b/i],
  ['postgresql', /\bPostgreSQL\b/i], ['supabase', /\bSupabase\b/i], ['redis', /\bRedis\b/i],
  ['docker', /\bDocker\b/i], ['vercel', /\bVercel\b/i], ['github-actions', /GitHub Actions/i],
];
const CONTACT_URLS = ['https://alemaodev.com/', 'https://www.linkedin.com/in/yurisinn/', 'https://www.instagram.com/alemaodev'];

export function extractProfileModel(text, locale) {
  const markerValues = (kind) => [...text.matchAll(new RegExp(`<!--\\s*${kind}:([a-z0-9-]+)\\s*-->`, 'gi'))].map((match) => match[1]);
  const methodEdges = [...text.matchAll(/\b([A-F])(?:\[[^\]]+\])?\s*-->\s*([A-F])(?:\[[^\]]+\])?/g)].map((match) => `${match[1]}>${match[2]}`);
  const localImagePaths = [...text.matchAll(/!\[[^\]]*\]\((\.\/profile\/[^)]+)\)/g)].map((match) => match[1]);
  return {
    sectionIds: markerValues('section'),
    capabilityIds: markerValues('capability'),
    methodEdges,
    technologies: TECHNOLOGY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id),
    caseIds: markerValues('case'),
    contactUrls: CONTACT_URLS.filter((url) => text.includes(url)),
    imagePaths: localImagePaths,
    hasTopLanguagesDisclaimer: locale === 'pt-BR'
      ? /não (?:são|é) uma medida de proficiência/i.test(text)
      : /not a measure of proficiency/i.test(text),
  };
}

export function validateParity(ptText, enText) {
  const pt = extractProfileModel(ptText, 'pt-BR');
  const en = extractProfileModel(enText, 'en-US');
  const errors = [];
  for (const key of ['sectionIds', 'capabilityIds', 'methodEdges', 'technologies', 'caseIds', 'contactUrls', 'imagePaths']) {
    if (JSON.stringify(pt[key]) !== JSON.stringify(en[key])) errors.push(key);
  }
  if (!pt.hasTopLanguagesDisclaimer || !en.hasTopLanguagesDisclaimer) errors.push('top-languages-disclaimer');
  return errors;
}

export function validateWorkflow(text) {
  const errors = [];
  const requireText = (needle, rule) => { if (!text.includes(needle)) errors.push(rule); };
  requireText('workflow_dispatch:', 'missing-manual-trigger');
  requireText("cron: '17 6 * * 1'", 'missing-approved-schedule');
  requireText('permissions:\n  contents: read', 'missing-read-only-default');
  requireText('    permissions:\n      contents: write', 'missing-job-write-scope');
  requireText('actions/checkout@v4', 'checkout-version');
  requireText('actions/setup-node@v4', 'setup-node-version');
  requireText("node-version: '22'", 'node-version');
  requireText('persist-credentials: false', 'persistent-credentials');
  requireText('npm test', 'missing-tests');
  requireText('npm run validate', 'missing-validation');
  requireText('node scripts/update-profile-analytics.mjs', 'missing-generator');
  requireText('git diff --quiet -- profile/stats.svg profile/top-langs.svg', 'unscoped-diff');
  requireText('git add -- profile/stats.svg profile/top-langs.svg', 'unscoped-commit');
  requireText('group: profile-stats', 'missing-concurrency-group');
  requireText('cancel-in-progress: false', 'unsafe-concurrency');
  if (/\bpull_request_target\s*:/i.test(text)) errors.push('unsafe-trigger');
  if (/\b(?:write-all|actions:\s*write|administration:\s*write|secrets:\s*write)\b/i.test(text)) errors.push('broad-permissions');
  if (/^\s*cache:\s*npm\s*$/gmi.test(text)) errors.push('cache-without-lockfile');
  const secretRefs = [...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  if (secretRefs.some((name) => name !== 'PROFILE_STATS_TOKEN')) errors.push('extra-secret');
  if (!secretRefs.includes('PROFILE_STATS_TOKEN')) errors.push('missing-profile-secret');
  const actions = [...text.matchAll(/uses:\s*([^\s]+)/g)].map((match) => match[1]);
  if (actions.some((action) => !['actions/checkout@v4', 'actions/setup-node@v4'].includes(action))) errors.push('unapproved-action');
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
  if (mode === 'parity' || mode === 'all') {
    const pt = files.find(([name]) => name === 'README.md')?.[1];
    const en = files.find(([name]) => name === 'README.en.md')?.[1];
    if (!pt || !en) errors.push('parity: both README files are required');
    else errors.push(...validateParity(pt, en).map((error) => `parity: ${error}`));
  }
  if (mode === 'svg' || mode === 'all') {
    for (const [name, text] of files) {
      if (name === 'profile/stats.svg') errors.push(...validateSvg(text, 'stats').map((error) => `${name}: ${error}`));
      if (name === 'profile/top-langs.svg') errors.push(...validateSvg(text, 'top-langs').map((error) => `${name}: ${error}`));
    }
  }
  if (mode === 'workflow' || mode === 'all') {
    const workflow = files.find(([name]) => name === '.github/workflows/update-profile-stats.yml')?.[1];
    if (!workflow) errors.push('workflow: file is required');
    else errors.push(...validateWorkflow(workflow).map((error) => `workflow: ${error}`));
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
