const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['.git', 'node_modules']);
const checkedExtensions = new Set(['.js', '.json', '.sh']);
const conflictMarkerPattern = /^(<<<<<<<|=======|>>>>>>>)(?:\s|$)/;
const matches = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!entry.isFile() || !checkedExtensions.has(path.extname(entry.name))) continue;

    const relativePath = path.relative(repoRoot, fullPath);
    const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);

    lines.forEach((line, index) => {
      if (conflictMarkerPattern.test(line)) {
        matches.push(`${relativePath}:${index + 1}: ${line}`);
      }
    });
  }
}

walk(repoRoot);

if (matches.length > 0) {
  console.error('Git conflict markers were found:');
  for (const match of matches) console.error(`- ${match}`);
  process.exit(1);
}

console.log('No Git conflict markers found in JS/JSON/shell files.');
