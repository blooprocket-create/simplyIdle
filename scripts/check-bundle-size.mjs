/**
 * Bundle size monitoring script.
 *
 * Runs after `expo export --platform web` and reports entry-point JS sizes.
 * Fails CI if total JS exceeds the budget (default 4 MB).
 *
 * Usage:  node scripts/check-bundle-size.mjs [--budget <bytes>]
 */

import { readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const DIST_DIR = 'dist';
const DEFAULT_BUDGET_BYTES = 4 * 1024 * 1024; // 4 MB

function parseArgs() {
  const args = process.argv.slice(2);
  const budgetIdx = args.indexOf('--budget');
  const budget =
    budgetIdx !== -1 && args[budgetIdx + 1]
      ? Number(args[budgetIdx + 1])
      : DEFAULT_BUDGET_BYTES;
  return { budget };
}

function collectFiles(dir, ext) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, ext));
    } else if (extname(entry.name) === ext) {
      results.push({ path: fullPath, size: statSync(fullPath).size });
    }
  }
  return results;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const { budget } = parseArgs();

const jsFiles = collectFiles(DIST_DIR, '.js').sort((a, b) => b.size - a.size);
const cssFiles = collectFiles(DIST_DIR, '.css');

if (jsFiles.length === 0) {
  console.error(`No .js files found in ${DIST_DIR}/. Run "expo export --platform web" first.`);
  process.exit(1);
}

const totalJs = jsFiles.reduce((sum, f) => sum + f.size, 0);
const totalCss = cssFiles.reduce((sum, f) => sum + f.size, 0);

console.log('=== Bundle Size Report ===\n');
console.log('JavaScript files:');
for (const f of jsFiles.slice(0, 15)) {
  console.log(`  ${formatBytes(f.size).padStart(10)}  ${f.path}`);
}
if (jsFiles.length > 15) {
  console.log(`  ... and ${jsFiles.length - 15} more`);
}

console.log(`\nCSS files: ${cssFiles.length} (${formatBytes(totalCss)})`);
console.log(`\nTotal JS:  ${formatBytes(totalJs)}`);
console.log(`Budget:    ${formatBytes(budget)}`);

if (totalJs > budget) {
  console.error(`\n❌ OVER BUDGET by ${formatBytes(totalJs - budget)}`);
  process.exit(1);
} else {
  const headroom = budget - totalJs;
  console.log(`✅ Under budget (${formatBytes(headroom)} headroom)`);
}
