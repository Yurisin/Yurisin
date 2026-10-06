import assert from 'node:assert/strict';
import test from 'node:test';

import { renderStatsSvg, renderTopLangsSvg, validateSvg } from '../scripts/render-profile-svg.mjs';

const analytics = {
  totalCommits: 120,
  totalPullRequests: 18,
  totalIssues: 9,
  restrictedContributions: 42,
  languages: [
    { name: 'TypeScript', bytes: 1200, color: '#3178C6' },
    { name: 'Python', bytes: 300, color: '#3572A5' },
  ],
};

test('renderers produce deterministic, self-contained, safe SVGs', () => {
  for (const [kind, render] of [['stats', renderStatsSvg], ['top-langs', renderTopLangsSvg]]) {
    const first = render(analytics);
    const second = render(analytics);
    assert.equal(first, second);
    assert.deepEqual(validateSvg(first, kind), []);
    assert.match(first, /^<svg[^>]+width="\d+"[^>]+height="\d+"[^>]+viewBox="[^"]+"/);
    for (const color of ['#0D1117', '#C9D1D9', '#58A6FF', '#3FB950']) assert.match(first, new RegExp(color, 'i'));
    assert.doesNotMatch(first, /<script|on\w+=|<foreignObject|(?:href|src)="https?:\/\/|token|secret|repository|organization|generated at|timestamp/i);
  }
});

test('top languages explains distribution and handles empty aggregate data', () => {
  assert.match(renderTopLangsSvg(analytics), /Detected code distribution — not proficiency/);
  const empty = renderTopLangsSvg({ ...analytics, languages: [] });
  assert.match(empty, /No aggregate language data available/);
  assert.doesNotMatch(empty, /0(?:\.0+)?%/);
});

test('SVG validation rejects executable, remote, malformed, and secret-bearing content', () => {
  const unsafe = [
    '<svg width="1" height="1" viewBox="0 0 1 1"><script/></svg>',
    '<svg width="1" height="1" viewBox="0 0 1 1"><image href="https://example.com/x"/></svg>',
    '<svg><text>token=synthetic</text></svg>',
    '<svg width="1" height="1" viewBox="0 0 1 1"><foreignObject/></svg>',
  ];
  for (const svg of unsafe) assert.notDeepEqual(validateSvg(svg, 'stats'), []);
});
