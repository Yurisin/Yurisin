import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { scanPrivacy, validateLinks } from '../scripts/validate-profile.mjs';

const fixture = async (name) => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

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
