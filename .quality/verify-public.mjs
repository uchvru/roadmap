#!/usr/bin/env node

/**
 * Проверка публичной статической сборки Roadmap без сторонних зависимостей.
 * Скрипт намеренно использует только стандартную библиотеку Node.js, чтобы
 * одинаково работать локально и в GitHub Actions.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const failures = [];
const passes = [];

function fail(message) {
  failures.push(message);
}

function pass(message) {
  passes.push(message);
}

function assert(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function file(path) {
  return join(root, path);
}

function read(path) {
  return readFileSync(file(path));
}

function text(path) {
  return read(path).toString('utf8');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function walk(dir = root) {
  const result = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(absolute));
    else result.push(relative(root, absolute).replaceAll('\\', '/'));
  }
  return result;
}

function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + length + 2 > buffer.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += length + 2;
  }
  return null;
}

function parseJson(path) {
  try {
    return JSON.parse(text(path));
  } catch (error) {
    fail(`${path}: некорректный JSON (${error.message})`);
    return null;
  }
}

const allFiles = walk();

// 1. Минимальная целостность сайта.
for (const required of [
  'index.html',
  'app.html',
  'catalog.html',
  'README.md',
  'LICENSE',
  'schemas/roadmap-data.schema.json',
  'media/media-manifest.json',
  'catalog-img/media-manifest.json',
]) {
  assert(existsSync(file(required)) && statSync(file(required)).isFile(), `Есть обязательный файл ${required}`);
}

for (const htmlPath of ['index.html', 'app.html', 'catalog.html', 'private/index.html']) {
  if (!existsSync(file(htmlPath))) continue;
  const html = text(htmlPath);
  assert(/<!doctype html>/i.test(html), `${htmlPath}: указан HTML doctype`);
  assert(/<html[^>]+lang\s*=\s*["']?ru/i.test(html), `${htmlPath}: указан русский язык документа`);
  assert(/<meta[^>]+charset\s*=\s*["']?utf-8/i.test(html), `${htmlPath}: указан UTF-8`);
  assert(/<meta[^>]+name\s*=\s*["']?viewport/i.test(html), `${htmlPath}: задан viewport`);
  assert(/<title>[^<]+<\/title>/i.test(html), `${htmlPath}: есть непустой title`);
}

// 2. Privacy gate: рабочий JSON нельзя публиковать, private-контейнеры должны
// быть зашифрованы, а индекс закрытого раздела — закрыт от индексации.
const forbiddenData = allFiles.filter((path) => {
  if (path.startsWith('schemas/')) return false;
  return /^roadmap-data(?:[-_.].*)?\.json$/i.test(basename(path));
});
assert(forbiddenData.length === 0, forbiddenData.length
  ? `Найдены запрещённые рабочие JSON: ${forbiddenData.join(', ')}`
  : 'Рабочий roadmap-data*.json отсутствует в публичной сборке');

const openTextExtensions = new Set(['.html', '.md', '.json', '.txt', '.js', '.mjs', '.yml', '.yaml', '.xml', '.css', '.csv']);
const openTextFiles = allFiles.filter((path) =>
  !path.startsWith('private/')
  && !path.startsWith('.quality/')
  && openTextExtensions.has(extname(path).toLowerCase()));
const workingMarkers = [
  { label: 'RHEAD-', pattern: /RHEAD-/i },
  { label: 'WEBADM-', pattern: /WEBADM-/i },
  { label: 'rambler-co.ru', pattern: /rambler-co\.ru/i },
];
for (const marker of workingMarkers) {
  const exposed = openTextFiles.filter((path) => marker.pattern.test(text(path)));
  assert(exposed.length === 0, exposed.length
    ? `Рабочий маркер ${marker.label} найден в открытых файлах: ${exposed.join(', ')}`
    : `Рабочий маркер ${marker.label} отсутствует в открытых файлах`);
}

const legacyFeatureLinks = openTextFiles.filter((path) => /(?:^|["'(\/])features\.png(?:["')?#\s]|$)/i.test(text(path)));
assert(!existsSync(file('features.png')), 'Устаревший файл features.png отсутствует');
assert(legacyFeatureLinks.length === 0, legacyFeatureLinks.length
  ? `Ссылки на features.png найдены: ${legacyFeatureLinks.join(', ')}`
  : 'Ссылки на features.png отсутствуют в открытых файлах');

const privateHtml = allFiles.filter((path) => path.startsWith('private/') && extname(path).toLowerCase() === '.html');
assert(privateHtml.includes('private/index.html'), 'В закрытом разделе есть индекс');
for (const path of privateHtml) {
  const html = text(path);
  assert(/noindex[^"'>]*(?:nofollow|noarchive)|noindex,nofollow,noarchive/i.test(html), `${path}: запрещена индексация`);
  if (path === 'private/index.html') continue;
  const encrypted = /var\s+DATA\s*=\s*\{[\s\S]*?"salt"\s*:/.test(html)
    && /"iv"\s*:/.test(html)
    && /"iterations"\s*:\s*\d+/.test(html)
    && /"ct"\s*:/.test(html)
    && /crypto\.subtle\.decrypt/.test(html)
    && /AES-GCM/.test(html);
  assert(encrypted, `${path}: содержимое упаковано в AES-GCM-контейнер`);
}

// 3. Демо-видео и постер должны совпадать с манифестом и использоваться лендингом.
const mediaManifest = parseJson('media/media-manifest.json');
if (mediaManifest?.video && mediaManifest?.poster) {
  const landing = text('index.html');
  for (const [kind, item] of [['video', mediaManifest.video], ['poster', mediaManifest.poster]]) {
    const path = `media/${item.file}`;
    assert(existsSync(file(path)), `${kind}: файл ${path} существует`);
    if (!existsSync(file(path))) continue;
    const buffer = read(path);
    assert(buffer.length === item.bytes, `${path}: размер совпадает с манифестом`);
    assert(sha256(buffer) === item.sha256, `${path}: SHA-256 совпадает с манифестом`);
    assert(landing.includes(path), `${path}: файл подключен на лендинге`);
    if (kind === 'poster') {
      const dimensions = jpegSize(buffer);
      assert(Boolean(dimensions), `${path}: корректный JPEG`);
      if (dimensions) {
        assert(dimensions.width === item.width && dimensions.height === item.height, `${path}: размеры ${item.width}×${item.height}`);
      }
    }
  }
  assert(mediaManifest.video.audio === false, 'Демо-манифест явно фиксирует отсутствие аудио');
}

for (const legacy of ['demo.mp4', 'demo.webm', 'media/demo.mp4', 'media/demo.webm']) {
  assert(!existsSync(file(legacy)), `Устаревший медиафайл ${legacy} отсутствует`);
}

// 4. Каталог: ровно две темы на каждую функцию, каждый PNG проверен по hash и размеру.
const catalogManifest = parseJson('catalog-img/media-manifest.json');
if (catalogManifest?.files && catalogManifest?.expected) {
  const catalog = text('catalog.html');
  const entries = Object.entries(catalogManifest.files);
  const actualPngs = allFiles
    .filter((path) => /^catalog-img\/f\d{2}_(?:light|dark)\.png$/.test(path))
    .map((path) => basename(path))
    .sort();
  const declaredPngs = entries.map(([name]) => name).sort();
  assert(entries.length === catalogManifest.expected.files, `В манифесте ${catalogManifest.expected.files} скриншота`);
  assert(JSON.stringify(actualPngs) === JSON.stringify(declaredPngs), 'Набор PNG каталога точно совпадает с манифестом');

  for (const [name, expected] of entries) {
    const path = `catalog-img/${name}`;
    assert(existsSync(file(path)), `${path}: файл существует`);
    if (!existsSync(file(path))) continue;
    const buffer = read(path);
    const dimensions = pngSize(buffer);
    assert(Boolean(dimensions), `${path}: корректный PNG`);
    if (dimensions) {
      assert(dimensions.width === expected.width && dimensions.height === expected.height, `${path}: размеры ${expected.width}×${expected.height}`);
    }
    assert(sha256(buffer) === expected.sha256, `${path}: SHA-256 совпадает`);
    assert(catalog.includes(path), `${path}: подключен в catalog.html`);
  }

  const featureIds = new Set(entries.map(([name]) => name.slice(0, 3)));
  for (const id of featureIds) {
    assert(catalogManifest.files[`${id}_light.png`] && catalogManifest.files[`${id}_dark.png`], `${id}: есть светлая и тёмная тема`);
  }
}

// 5. Схема данных должна оставаться валидным JSON Schema и не быть рабочим проектом.
const schema = parseJson('schemas/roadmap-data.schema.json');
if (schema) {
  assert(typeof schema.$schema === 'string' && schema.$schema.includes('json-schema.org'), 'Указана версия JSON Schema');
  assert(schema.type === 'object' && schema.properties?.roadmapData, 'Схема описывает roadmapData');
  assert(!Array.isArray(schema.roadmapData), 'В схеме нет встроенных рабочих задач');
}

console.log(`\nPublic build quality gate: ${passes.length} проверок пройдено.`);
if (failures.length) {
  console.error(`Обнаружено ошибок: ${failures.length}`);
  for (const message of failures) console.error(`  ✗ ${message}`);
  process.exitCode = 1;
} else {
  console.log('Ошибок не обнаружено.');
}
