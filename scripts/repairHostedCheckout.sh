#!/usr/bin/env bash
set -euo pipefail

repo_dir="${1:-/home/container}"
cd "$repo_dir"

if [[ ! -d .git ]]; then
  echo "ERROR: $repo_dir is not a git checkout." >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir=".hosted-repair-backup-$timestamp"
mkdir -p "$backup_dir"

for file in package.json package-lock.json index.js; do
  if [[ -e "$file" ]]; then
    cp "$file" "$backup_dir/$file"
  fi
done

echo "Backed up package/index files to $backup_dir"
echo "Resetting package.json, package-lock.json, and index.js to the repository version..."
git checkout -- package.json package-lock.json index.js

echo "Pulling latest code with fast-forward only..."
git pull --ff-only

echo "Validating package.json..."
node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8')); console.log('package.json is valid JSON')"

echo "Checking index.js syntax..."
node --check index.js

echo "Installing production dependencies..."
npm install --omit=dev

echo "Repair complete. Restart the server from the panel."
