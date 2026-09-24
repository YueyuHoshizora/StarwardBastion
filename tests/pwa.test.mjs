import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const precache = JSON.parse(`[${sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : [`${dir}/${d.name}`]));
}

test('Service Worker 預先快取涵蓋全部執行期模組，且每個項目都存在（離線可玩）', () => {
  for (const f of walk('src')) assert.ok(precache.includes(f), `PRECACHE 缺少 ${f}`);
  for (const f of precache) if (f !== './') assert.ok(existsSync(join(root, f)), `PRECACHE 項目不存在：${f}`);
});

test('manifest 圖示與 index.html 引用的圖示檔都存在', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const i of [...manifest.icons, ...manifest.screenshots]) assert.ok(existsSync(join(root, i.src)), i.src);
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  for (const [, href] of html.matchAll(/(?:href|src)="((?!https?:)[^"]+)"/g)) assert.ok(existsSync(join(root, href)), href);
});
