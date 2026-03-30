import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const version = process.argv[2];

// Get last tag (before the one release-it just created, so use the second-most-recent)
let lastTag = '';
try {
  const tags = execSync('git tag --sort=-creatordate')
    .toString()
    .trim()
    .split('\n');
  lastTag = tags[0] ?? ''; // script runs on after:bump, before release-it creates the tag, so [0] = previous
} catch {
  // No previous tags — fall through to use recent commits
}

if (process.env.DEBUG) {
  console.log('[DEBUG] lastTag:', lastTag);
}

const range = lastTag ? `${lastTag}..HEAD` : 'HEAD~20..HEAD';
let commits = '';
try {
  commits = execSync(`git log ${range} --pretty=format:"%h %s" --no-merges`)
    .toString()
    .trim();
} catch {
  process.exit(0);
}

if (!commits) {
  process.exit(0);
}

const prompt = `You are writing release notes for a VSCode extension called "Ran - Commit Message Generator".

Given these git commits (hash + message), write a concise changelog section for version ${version}.
Format as markdown bullet points (- item). Group related changes. Skip chore/ci/docs commits unless important to users. Be brief and user-focused.

Commits:
${commits}

Output ONLY the bullet points, no heading.`;

if (process.env.DEBUG) {
  console.log('[DEBUG] prompt:\n', prompt);
}

let entry = '';
try {
  entry = execSync(`claude -p ${JSON.stringify(prompt)}`, { encoding: 'utf-8' })
    .toString()
    .trim();
} catch (e) {
  console.error('claude CLI failed, skipping changelog generation:', e.message);
  process.exit(0);
}

// Insert entry under ## [Unreleased] in CHANGELOG.md
const changelogPath = 'CHANGELOG.md';
const content = readFileSync(changelogPath, 'utf-8');

const marker = '## [Unreleased]';
if (!content.includes(marker)) {
  console.warn('Could not find "## [Unreleased]" in CHANGELOG.md — skipping.');
  process.exit(0);
}

const updated = content.replace(
  marker,
  `${marker}\n\n## [${version}]\n\n${entry}`,
);
writeFileSync(changelogPath, updated);

console.log(`Changelog updated for v${version}`);
