import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { fetchAnalytics } from '../scripts/github-analytics.mjs';
import { updateAnalytics } from '../scripts/update-profile-analytics.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('fetchAnalytics paginates and returns aggregate-only data', async () => {
  const pages = [await fixture('github-contributions-page-1.json'), await fixture('github-contributions-page-2.json')];
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    return response(pages.shift());
  };

  const analytics = await fetchAnalytics(fakeFetch, 'synthetic-token', 'Yurisin');

  assert.deepEqual(analytics, {
    totalCommits: 120,
    totalPullRequests: 18,
    totalIssues: 9,
    restrictedContributions: 42,
    languages: [
      { name: 'TypeScript', bytes: 1200, color: '#3178C6' },
      { name: 'Python', bytes: 300, color: '#3572A5' },
      { name: 'JavaScript', bytes: 200, color: '#F1E05A' },
    ],
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url }) => url === 'https://api.github.com/graphql'));
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer synthetic-token'));
  assert.doesNotMatch(JSON.stringify(analytics), /repository|organization|event|cursor/i);
  assert.doesNotMatch(calls.map(({ options }) => options.body).join(' '), /name\s*\n|url|organization|commit\s*\{/i);
});

test('updateAnalytics preserves both prior SVGs when a later API page fails', async () => {
  const first = await fixture('github-contributions-page-1.json');
  const failures = [
    async () => response({}, 500),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('invalid json'); } }),
    async () => response({ errors: [{ message: 'synthetic failure' }] }),
    async () => response({ data: { user: { repositories: null } } }),
  ];

  for (const fail of failures) {
    const outputDir = await mkdtemp(path.join(tmpdir(), 'profile-analytics-'));
    await writeFile(path.join(outputDir, 'stats.svg'), '<svg>stats-sentinel</svg>');
    await writeFile(path.join(outputDir, 'top-langs.svg'), '<svg>langs-sentinel</svg>');
    let call = 0;
    const fakeFetch = async () => (++call === 1 ? response(first) : fail());

    await assert.rejects(updateAnalytics({ token: 'synthetic-token', outputDir, fetchImpl: fakeFetch }));
    assert.equal(await readFile(path.join(outputDir, 'stats.svg'), 'utf8'), '<svg>stats-sentinel</svg>');
    assert.equal(await readFile(path.join(outputDir, 'top-langs.svg'), 'utf8'), '<svg>langs-sentinel</svg>');
    await rm(outputDir, { recursive: true, force: true });
  }
});

