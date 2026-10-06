import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { extractProfileModel, validateParity } from '../scripts/validate-profile.mjs';

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8');

test('bilingual profiles expose the same semantic model', async () => {
  const [pt, en] = await Promise.all([read('README.md'), read('README.en.md')]);
  const model = extractProfileModel(pt, 'pt-BR');

  assert.deepEqual(model.sectionIds, ['language', 'header', 'about', 'capabilities', 'method', 'stack', 'cases', 'analytics', 'cta', 'footer']);
  assert.deepEqual(validateParity(pt, en), []);
});

test('parity reports a missing case marker', async () => {
  const [pt, en] = await Promise.all([read('README.md'), read('README.en.md')]);
  assert.deepEqual(validateParity(pt, en.replace('<!-- case:viralizer -->', '')), ['caseIds']);
});

test('parity reports reordered sections', async () => {
  const [pt, en] = await Promise.all([read('README.md'), read('README.en.md')]);
  const changed = en
    .replace('<!-- section:about -->', '<!-- section:swap -->')
    .replace('<!-- section:capabilities -->', '<!-- section:about -->')
    .replace('<!-- section:swap -->', '<!-- section:capabilities -->');
  assert.deepEqual(validateParity(pt, changed), ['sectionIds']);
});

test('parity reports changed contacts and Mermaid topology', async () => {
  const [pt, en] = await Promise.all([read('README.md'), read('README.en.md')]);
  assert.deepEqual(validateParity(pt, en.replaceAll('https://www.instagram.com/alemaodev', 'https://example.com/changed')), ['contactUrls']);
  assert.deepEqual(validateParity(pt, en.replace('B --> C[Agents and automation]', 'B --> D[Agents and automation]')), ['methodEdges']);
});

test('parity reports a missing top-languages qualification', async () => {
  const [pt, en] = await Promise.all([read('README.md'), read('README.en.md')]);
  const changed = en.replace('they are not a measure of proficiency', 'they summarize technology use');
  assert.deepEqual(validateParity(pt, changed), ['top-languages-disclaimer']);
});
