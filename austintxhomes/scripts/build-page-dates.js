#!/usr/bin/env node
'use strict';
/**
 * Writes data/page-dates.json: { "<file>.html": "<ISO date of last commit>" }
 * for every page in public/site/.
 *
 * Why: the author block used to print the file's mtime as "last updated",
 * and on Render every deploy resets mtime, so every page claimed it was
 * updated today. That made old numbers look current. The real date of the
 * last content change comes from git, and Render has no .git at runtime, so
 * we snapshot it into a committed manifest.
 *
 * Run before committing page changes:   node scripts/build-page-dates.js
 * Files with uncommitted edits get today's date (they are about to be committed).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const siteDir = path.join(__dirname, '..', 'public', 'site');
const repoRoot = execSync('git rev-parse --show-toplevel', { cwd: siteDir }).toString().trim();
const rel = path.relative(repoRoot, siteDir);

// One pass over history: newest commit first, so the first time we see a file is its latest change.
const log = execSync(`git log --format=@@%cI --name-only -- "${rel}"`, { cwd: repoRoot, maxBuffer: 256 * 1024 * 1024 }).toString();
const dates = {};
let cur = null;
for (const line of log.split('\n')) {
  if (line.startsWith('@@')) { cur = line.slice(2).slice(0, 10); continue; }
  const f = line.trim();
  if (!f.endsWith('.html')) continue;
  const base = path.basename(f);
  if (!dates[base]) dates[base] = cur;
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const dirty = execSync(`git status --porcelain -- "${rel}"`, { cwd: repoRoot }).toString()
  .split('\n').map(l => l.slice(3).trim()).filter(f => f.endsWith('.html')).map(f => path.basename(f));
for (const f of dirty) dates[f] = today;

const out = {};
for (const f of fs.readdirSync(siteDir).filter(f => f.endsWith('.html')).sort()) {
  if (dates[f]) out[f] = dates[f];
}
fs.writeFileSync(path.join(__dirname, '..', 'data', 'page-dates.json'), JSON.stringify(out, null, 1) + '\n');
console.log(`page-dates.json: ${Object.keys(out).length} pages (${dirty.length} with uncommitted edits dated ${today})`);
