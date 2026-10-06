import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { fetchAnalytics } from './github-analytics.mjs';
import { renderStatsSvg, renderTopLangsSvg, validateSvg } from './render-profile-svg.mjs';

async function readOptional(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function updateAnalytics({ token, outputDir, fetchImpl = fetch }) {
  const data = await fetchAnalytics(fetchImpl, token, 'Yurisin');
  const candidates = {
    'stats.svg': renderStatsSvg(data),
    'top-langs.svg': renderTopLangsSvg(data),
  };
  for (const [name, svg] of Object.entries(candidates)) {
    const errors = validateSvg(svg, name === 'stats.svg' ? 'stats' : 'top-langs');
    if (errors.length) throw new Error(`Generated ${name} failed validation: ${errors.join(', ')}`);
  }

  await mkdir(outputDir, { recursive: true });
  const temporary = await mkdtemp(path.join(outputDir, '.tmp-'));
  const originals = new Map();
  const changed = [];
  try {
    for (const [name, svg] of Object.entries(candidates)) {
      const target = path.join(outputDir, name);
      const prior = await readOptional(target);
      originals.set(name, prior);
      if (prior !== svg) {
        changed.push(name);
        await writeFile(path.join(temporary, name), svg, 'utf8');
      }
    }
    for (const name of changed) await rename(path.join(temporary, name), path.join(outputDir, name));
    return { changed };
  } catch (error) {
    for (const [name, prior] of originals) {
      const target = path.join(outputDir, name);
      if (prior === null) await rm(target, { force: true });
      else await writeFile(target, prior, 'utf8');
    }
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const token = process.env.PROFILE_STATS_TOKEN;
  if (!token) throw new Error('PROFILE_STATS_TOKEN is required in the process environment');
  const result = await updateAnalytics({ token, outputDir: path.resolve('profile') });
  process.stdout.write(result.changed.length ? `${result.changed.join('\n')}\n` : 'no changes\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
