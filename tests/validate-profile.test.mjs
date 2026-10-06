import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { scanPrivacy, validateContent, validateLinks } from '../scripts/validate-profile.mjs';

const fixture = async (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const optionalFile = async (name) => {
  try {
    return await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
};

test('privacy scanner accepts sanitized public content', async () => {
  assert.deepEqual(scanPrivacy(await fixture('privacy-safe.md'), 'safe.md'), []);
});

test('privacy scanner rejects forbidden terms, private URLs, IPs, and credentials', async () => {
  const rules = scanPrivacy(await fixture('privacy-unsafe.md'), 'unsafe.md').map(({ rule }) => rule);

  assert.match(rules.join(' '), /forbidden-term/);
  assert.match(rules.join(' '), /private-url/);
  assert.match(rules.join(' '), /ip-address/);
  assert.match(rules.join(' '), /credential/);
});

test('link validator accepts approved HTTPS links', () => {
  assert.deepEqual(validateLinks('[Site](https://alemaodev.com/)', 'x.md'), []);
});

test('link validator rejects insecure private links without echoing the URL', () => {
  const errors = validateLinks('[Private](http://10.0.0.1/admin)', 'x.md');

  assert.match(errors.join(' '), /https|private/i);
  assert.doesNotMatch(errors.join(' '), /10\.0\.0\.1/);
});

test('PT-BR content contract accepts the canonical profile', async () => {
  const readme = await optionalFile('README.md');
  assert.deepEqual(validateContent(readme, 'pt-BR'), []);
});

test('PT-BR content contract rejects unsafe editorial mutations', async () => {
  const readme = await optionalFile('README.md');
  const mutations = [
    readme.replace('PT-BR · EN-US · UTC-3', 'São Paulo · UTC-3'),
    readme.replace('Projeto privado — descrição sanitizada', '[Projeto privado](https://github.com/example/private)'),
    readme.replace('![Texto animado sobre IA, agentes, integrações e automações]', '![]'),
    `${readme}\nImpacto: 99% de economia`,
  ];

  for (const mutation of mutations) {
    assert.notDeepEqual(validateContent(mutation, 'pt-BR'), []);
  }
});

test('PT-BR content remains understandable without external images', async () => {
  const readme = await optionalFile('README.md');
  const textOnly = readme
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<img\b[^>]*>/gi, '');

  for (const phrase of [
    'Alemão Dev',
    'Head de Tecnologia e Automação @ WZ Soluções',
    'processos manuais em sistemas escaláveis',
    'Agentes e IA aplicada',
    'Automação de processos',
    'Integrações e APIs',
    'Engenharia de produto',
    'Operação assistida por agentes',
    'Autoposter',
    'Viralizer',
    'Agente Consultor RAG',
    'Gestor Financeiro Automatizado',
    'https://alemaodev.com/',
    'https://www.linkedin.com/in/yurisinn/',
    'https://www.instagram.com/alemaodev',
  ]) {
    assert.match(textOnly, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
