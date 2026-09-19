#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const app = resolve(repo, 'app.html');
const main = process.env.ROADMAP_MAIN_FILE || resolve(repo, '..', 'roadmap.html');
const files = { 'roadmap/app.html': app, 'roadmap.html': main };
let failed = false;
function fail(message) { failed = true; console.error(`✗ ${message}`); }
function pass(message) { console.log(`✓ ${message}`); }
function read(path, label) {
  if (!existsSync(path)) { fail(`${label} не найден: ${path}`); return ''; }
  return readFileSync(path, 'utf8');
}
function block(source, start, end, label, file) {
  const from = source.indexOf(start);
  const to = from < 0 ? -1 : source.indexOf(end, from);
  if (from < 0 || to < 0) { fail(`${file}: не найден блок ${label}`); return ''; }
  return source.slice(from, to);
}
const sourceApp = read(app, 'roadmap/app.html');
if (!existsSync(main)) {
  console.log(`• Локальный рабочий файл не найден (${main}); проверка зеркала пропущена в CI.`);
  process.exit(0);
}
const sourceMain = read(main, 'roadmap.html');
const checks = [
  ['расчёт Smart Diff', '    function _jiraComputeRowDiff(', '    function _jiraBuildImportPreviewRows('],
  ['визуальная разметка Smart Diff', '        const diffHtml = (r.diffs && r.diffs.length)', "      }).join('');\n      modal.innerHTML="],
];
for (const [label, start, end] of checks) {
  const left = block(sourceApp, start, end, label, 'roadmap/app.html');
  const right = block(sourceMain, start, end, label, 'roadmap.html');
  if (left && right && left === right) pass(`${label}: файлы синхронизированы`);
  else if (left && right) fail(`${label}: roadmap.html отличается от roadmap/app.html`);
}
if (failed) process.exit(1);
