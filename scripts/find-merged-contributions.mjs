#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { appendFile, lstat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { validateRequest } from './mint-contribution.mjs';

const filePattern = /^trophies\/([0-9]{14})-([a-z0-9][a-z0-9-]{0,79})\.json$/;

function validUtcTimestamp(value) {
  const [year, month, day, hour, minute, second] = [value.slice(0, 4), value.slice(4, 6),
    value.slice(6, 8), value.slice(8, 10), value.slice(10, 12), value.slice(12, 14)].map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day && date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute && date.getUTCSeconds() === second;
}

export async function findMergedContributions(before, after, cwd) {
  for (const [name, value] of [['before', before], ['after', after]]) {
    if (typeof value !== 'string' || !/^[0-9a-f]{40,64}$/i.test(value) || /^0+$/.test(value)) {
      throw new Error(`${name} must be a nonzero Git commit SHA`);
    }
  }
  const changed = execFileSync('git', ['diff', '--name-only', '-z', '--diff-filter=AMR', before,
    after, '--', 'trophies/'], { cwd }).toString('utf8').split('\0').filter(Boolean);
  const records = [];
  for (const file of changed) {
    if (!file.endsWith('.json')) continue;
    const match = filePattern.exec(file);
    if (!match || !validUtcTimestamp(match[1])) {
      throw new Error(`Expected trophies/YYYYMMDDHHmmss-branch-slug.json: ${file}`);
    }
    const path = resolve(cwd, file);
    const fileInfo = await lstat(path);
    if (!fileInfo.isFile()) throw new Error(`${file} must be a regular file`);
    if (fileInfo.size > 4096) throw new Error(`${file} exceeds 4 KiB`);
    let input;
    try {
      input = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      throw new Error(`Invalid JSON in ${file}: ${error.message}`, { cause: error });
    }
    let request;
    try {
      request = validateRequest(input);
    } catch (error) {
      throw new Error(`Invalid contribution in ${file}: ${error.message}`, { cause: error });
    }
    records.push({ id: `${match[1]}-${match[2]}`, file, network: request.network,
      project: request.project.toString() });
  }
  if (records.length > 100) throw new Error('A merge may contain at most 100 contribution files');
  return records;
}

export async function main(env = process.env) {
  const records = await findMergedContributions(env.GITHUB_EVENT_BEFORE, env.GITHUB_SHA, process.cwd());
  if (!env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  await appendFile(env.GITHUB_OUTPUT, `records=${JSON.stringify({ include: records })}\ncount=${records.length}\n`);
  console.log(`Validated ${records.length} changed contribution file(s).`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Contribution detection stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
