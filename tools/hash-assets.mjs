// 依實際內容產生 JS/CSS 的 ?hash、模組 import map 與離線快取清單。無外部套件。
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const hash = (content) => createHash('sha256').update(content).digest('hex').slice(0, 16);
const walk = (dir) => readdirSync(new URL(dir, root), { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]).sort();
const modules = walk('src').filter((path) => path.endsWith('.js'));
const assets = ['styles.css', ...modules];
const urls = Object.fromEntries(assets.map((path) => [path, `${path}?${hash(read(path))}`]));
const importBlock = /<!-- ASSET_IMPORTS_START -->[\s\S]*?<!-- ASSET_IMPORTS_END -->/;
const sw = read('sw.js');
const precacheBlock = /const PRECACHE = \[[\s\S]*?\];/;
const existing = JSON.parse(`[${sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);
const staticFiles = existing.filter((path) => !/\.(js|css)(\?|$)/.test(path));
let html = read('index.html')
  .replace(/href="styles\.css(?:\?[^"]*)?"/, `href="${urls['styles.css']}"`)
  .replace(/src="src\/boot\.js(?:\?[^"]*)?"/, `src="${urls['src/boot.js']}"`);
const imports = Object.fromEntries(modules.map((path) => [`./${path}`, `./${urls[path]}`]));
html = html.replace(importBlock, `<!-- ASSET_IMPORTS_START -->\n  <script type="importmap">${JSON.stringify({ imports }, null, 2)}</script>\n  <!-- ASSET_IMPORTS_END -->`);
const precache = [...staticFiles, ...assets.map((path) => urls[path])];
// 包含首頁與工作者策略，避免只有 HTML 或快取邏輯變動時沿用舊快取版本。
const version = hash(JSON.stringify([
  html,
  sw.replace(/const VERSION = '[^']*';/, '').replace(precacheBlock, ''),
  ...precache.filter((path) => path !== './' && path !== 'index.html')
    .map((path) => [path, hash(readFileSync(new URL(path.split('?')[0], root)))]),
]));
const nextSw = sw.replace(/const VERSION = '[^']*';/, `const VERSION = 'sb-${version}';`)
  .replace(precacheBlock, `const PRECACHE = [\n${precache.map((path) => `  '${path}',`).join('\n')}\n];`);
const check = process.argv.includes('--check');
for (const [path, content] of [['index.html', html], ['sw.js', nextSw]]) {
  if (read(path) === content) continue;
  if (check) throw new Error(`${path} 的資源雜湊已過期，請執行 npm run assets:hash`);
  writeFileSync(new URL(path, root), content);
}
console.log(`資源雜湊${check ? '核對' : '產生'}完成：${assets.length} 個 JS/CSS；離線版本 sb-${version}`);
