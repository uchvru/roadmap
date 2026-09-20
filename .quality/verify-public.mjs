#!/usr/bin/env node

/**
 * Проверка публичной статической сборки Roadmap без сторонних зависимостей.
 * Скрипт намеренно использует только стандартную библиотеку Node.js, чтобы
 * одинаково работать локально и в GitHub Actions.
 */

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

function webpSize(buffer) {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (kind === 'VP8X' && size >= 10) return {
      width: 1 + buffer[body + 4] + (buffer[body + 5] << 8) + (buffer[body + 6] << 16),
      height: 1 + buffer[body + 7] + (buffer[body + 8] << 8) + (buffer[body + 9] << 16),
    };
    if (kind === 'VP8 ' && size >= 10 && buffer.subarray(body + 3, body + 6).toString('hex') === '9d012a') {
      return { width: buffer.readUInt16LE(body + 6) & 0x3fff, height: buffer.readUInt16LE(body + 8) & 0x3fff };
    }
    if (kind === 'VP8L' && size >= 5 && buffer[body] === 0x2f) {
      const bits = buffer.readUInt32LE(body + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = body + size + (size % 2);
  }
  return null;
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

// Pages publishes tracked files recursively. Keep its inventory closed so that
// renamed exports and access notes cannot bypass filename or content heuristics.
const privateNames = ['roadmap-mpv0.html', 'roadmap-online.html', 'roadmap-online-r.html', 'roadmap-online-n.html'];
const allowedFiles = new Set([
  '.gitignore', '.githooks/pre-commit', '.quality/README.md', '.quality/verify-public.mjs', '.quality/verify-sync.mjs', '.quality/bump-version.py',
  '.github/workflows/README.md', '.github/workflows/quality.yml', '.github/workflows/release.yml',
  'index.html', 'app.html', 'catalog.html', 'README.md', 'RELEASE_NOTES.md', 'LICENSE', 'avatar.jpg', 'robots.txt',
  'Инструкция_Roadmap.md', 'Локер-роадмапов.html', 'schemas/roadmap-data.schema.json',
  'media/media-manifest.json', 'media/roadmap-demo.mp4', 'media/roadmap-demo-poster.jpg',
  'catalog-img/media-manifest.json', 'private/index.html', 'private/roadmap-package-manifest.json',
  ...privateNames.map(name => `private/${name}`),
]);
for (let feature = 1; feature <= 43; feature += 1) {
  for (const theme of ['light', 'dark']) allowedFiles.add(`catalog-img/f${String(feature).padStart(2, '0')}_${theme}.webp`);
}
const unexpectedFiles = allFiles.filter(path => !allowedFiles.has(path));
assert(unexpectedFiles.length === 0, unexpectedFiles.length
  ? `Файлы вне разрешенного состава публичного сайта: ${unexpectedFiles.join(', ')}`
  : 'Все файлы входят в разрешенный состав публичного сайта');
const nonRegularFiles = allFiles.filter(path => !lstatSync(file(path)).isFile());
assert(nonRegularFiles.length === 0, nonRegularFiles.length
  ? `Публичный сайт не допускает ссылки или специальные файлы: ${nonRegularFiles.join(', ')}`
  : 'Публичный сайт содержит только обычные файлы');

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

// Номер публичного релиза должен быть атомарным: приложение, лендинг, каталог,
// README и оба медиа-манифеста нельзя публиковать в разных версиях.
const appSource = text('app.html');
const appVersion = appSource.match(/const APP_VERSION = '([^']+)'/)?.[1] || '';
const appReleaseDate = appSource.match(/const APP_VERSION_DATE = '(\d{2})\.(\d{2})\.(\d{4})'/);
const releaseIsoDate = appReleaseDate ? `${appReleaseDate[3]}-${appReleaseDate[2]}-${appReleaseDate[1]}` : '';
assert(Boolean(appVersion), 'app.html: найден номер текущей версии');
assert(Boolean(releaseIsoDate), 'app.html: найдена дата текущей версии');
if (appVersion) {
  for (const path of ['index.html', 'catalog.html', 'README.md']) {
    assert(text(path).includes(`v${appVersion}`), `${path}: указана версия v${appVersion}`);
  }
  for (const path of ['media/media-manifest.json', 'catalog-img/media-manifest.json']) {
    const manifest = parseJson(path);
    if (!manifest) continue;
    assert(manifest.version === appVersion, `${path}: версия совпадает с приложением`);
    if (releaseIsoDate) assert(manifest.generatedAt === releaseIsoDate, `${path}: дата совпадает с релизом`);
  }
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

const accessNotes = allFiles.filter(path => /^roadmap-access-.*\.txt$/i.test(basename(path)));
assert(accessNotes.length === 0, accessNotes.length
  ? `TXT со ссылками и паролями нельзя публиковать: ${accessNotes.join(', ')}`
  : 'Локальные TXT с паролями отсутствуют в публичной сборке');

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
assert(JSON.stringify(privateHtml.filter(path => path !== 'private/index.html').map(path => path.slice('private/'.length)).sort()) === JSON.stringify([...privateNames].sort()), 'В папке private находятся ровно четыре контейнера с разрешенными именами');
for (const path of privateHtml) {
  const html = text(path);
  assert(/noindex[^"'>]*(?:nofollow|noarchive)|noindex,nofollow,noarchive/i.test(html), `${path}: запрещена индексация`);
  if (path === 'private/index.html') continue;
  const encodedPayload = html.match(/<script type="application\/json" id="locker-payload">([^<]+)<\/script>/)
    || html.match(/var\s+DATA\s*=\s*(\{"salt"\s*:[^;]+\});/);
  let payload;
  try { payload = JSON.parse(encodedPayload?.[1] || 'null'); } catch { payload = null; }
  const base64Bytes = value => typeof value === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(value)
    && Buffer.from(value, 'base64').toString('base64') === value ? Buffer.from(value, 'base64').length : -1;
  const encrypted = payload && base64Bytes(payload.salt) === 16 && base64Bytes(payload.iv) === 12
    && Number.isSafeInteger(payload.iterations) && payload.iterations >= 200000
    && base64Bytes(payload.ct) >= 16
    && /crypto\.subtle\.decrypt/.test(html)
    && /AES-GCM/.test(html);
  assert(encrypted, `${path}: содержимое упаковано в AES-GCM-контейнер`);
}

// A manifest is optional for legacy encrypted sets, but authoritative once present.
// A partially replaced set must not inherit a previous generation's ready marker.
const privateManifestPath = 'private/roadmap-package-manifest.json';
if (existsSync(file(privateManifestPath))) {
  const manifest = parseJson(privateManifestPath);
  const manifestObject = Boolean(manifest && typeof manifest === 'object' && !Array.isArray(manifest));
  assert(manifestObject, `${privateManifestPath}: манифест является JSON-объектом`);
  if (manifestObject) {
    const expectedNames = [...privateNames].sort();
    assert(JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(['createdAt', 'files', 'generationId', 'ready', 'schema']), `${privateManifestPath}: только служебные поля манифеста, без дополнительных данных`);
    assert(manifest.schema === 'roadmap-private-package/v1', `${privateManifestPath}: поддерживаемая схема пакета`);
    assert(manifest.ready === true, `${privateManifestPath}: пакет полностью записан, ready=true`);
    const generation = typeof manifest.generationId === 'string' ? manifest.generationId : '';
    assert(/^(?:[A-Za-z0-9_-]{22}|[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(generation), `${privateManifestPath}: корректный идентификатор поколения`);
    let validDate = false;
    try { validDate = typeof manifest.createdAt === 'string' && new Date(manifest.createdAt).toISOString() === manifest.createdAt; } catch {}
    assert(validDate, `${privateManifestPath}: корректная дата создания`);
    const entries = Array.isArray(manifest.files) ? manifest.files : [];
    const declaredNames = entries.map(entry => entry && typeof entry.name === 'string' ? entry.name : '').sort();
    assert(JSON.stringify(declaredNames) === JSON.stringify(expectedNames), `${privateManifestPath}: объявлены ровно четыре файла без дублей и чужих путей`);
    for (const name of expectedNames) {
      const entry = entries.find(item => item && item.name === name);
      if (!entry) continue;
      const path = `private/${name}`;
      assert(JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(['bytes', 'name', 'sha256']), `${path}: запись манифеста содержит только имя, размер и SHA-256`);
      const validBytes = Number.isSafeInteger(entry.bytes) && entry.bytes > 0;
      const validHash = typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/.test(entry.sha256);
      assert(validBytes, `${path}: в манифесте задан целый размер файла`);
      assert(validHash, `${path}: в манифесте задан SHA-256`);
      const exists = existsSync(file(path)) && statSync(file(path)).isFile();
      assert(exists, `${path}: файл из приватного манифеста существует`);
      if (!exists) continue;
      try {
        const buffer = read(path);
        assert(validBytes && buffer.length === entry.bytes, `${path}: размер совпадает с приватным манифестом`);
        assert(validHash && sha256(buffer) === entry.sha256, `${path}: SHA-256 совпадает с приватным манифестом`);
      } catch (error) { fail(`${path}: не удалось прочитать контейнер (${error.message})`); }
    }
  }
} else {
  pass('Приватный манифест отсутствует: допускается старый набор зашифрованных контейнеров');
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

// 4. Каталог: ровно две темы на каждую функцию, каждый WebP проверен по hash и размеру.
const catalogManifest = parseJson('catalog-img/media-manifest.json');
if (catalogManifest?.files && catalogManifest?.expected) {
  const catalog = text('catalog.html');
  const entries = Object.entries(catalogManifest.files);
  const actualImages = allFiles
    .filter((path) => /^catalog-img\/f\d{2}_(?:light|dark)\.webp$/.test(path))
    .map((path) => basename(path))
    .sort();
  const declaredImages = entries.map(([name]) => name).sort();
  assert(entries.length === catalogManifest.expected.files, `В манифесте ${catalogManifest.expected.files} скриншота`);
  assert(JSON.stringify(actualImages) === JSON.stringify(declaredImages), 'Набор WebP каталога точно совпадает с манифестом');

  for (const [name, expected] of entries) {
    const path = `catalog-img/${name}`;
    assert(existsSync(file(path)), `${path}: файл существует`);
    if (!existsSync(file(path))) continue;
    const buffer = read(path);
    const dimensions = webpSize(buffer);
    assert(Boolean(dimensions), `${path}: корректный WebP`);
    if (dimensions) {
      assert(dimensions.width === expected.width && dimensions.height === expected.height, `${path}: размеры ${expected.width}×${expected.height}`);
    }
    assert(sha256(buffer) === expected.sha256, `${path}: SHA-256 совпадает`);
    assert(catalog.includes(path), `${path}: подключен в catalog.html`);
  }

  const featureIds = new Set(entries.map(([name]) => name.slice(0, 3)));
  const catalogCards = [...catalog.matchAll(/<article class=card\b/g)].length;
  assert(catalogCards === featureIds.size, `В каталоге ${featureIds.size} карточки функций`);
  assert(catalog.includes(`Ниже <b>${featureIds.size} функции</b>`), `В вводном тексте указаны все ${featureIds.size} функции`);
  assert(catalog.includes(`<div class=stat><div class=v>${featureIds.size}</div><div class=l>Функции в каталоге</div></div>`), `Счётчик каталога равен ${featureIds.size}`);
  for (const id of featureIds) {
    assert(catalogManifest.files[`${id}_light.webp`] && catalogManifest.files[`${id}_dark.webp`], `${id}: есть светлая и тёмная тема`);
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
