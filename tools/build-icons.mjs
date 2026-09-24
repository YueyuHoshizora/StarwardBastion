// 由 icons/icon.svg 產生 PWA／瀏覽器圖標：PNG 各尺寸、maskable 版本與 favicon.ico；
// 並由 icons/og-image.svg 產生 1200×630 社群分享圖 icons/og-image.png。
// 以本機 Chromium 系瀏覽器（headless）點陣化 512px，再用 macOS sips 縮放；ICO 以 PNG 內嵌格式自行封裝。
// 用法：node tools/build-icons.mjs [瀏覽器執行檔路徑]
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'icons');
const browser = process.argv[2] ?? [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].find(existsSync);
if (!browser) throw new Error('找不到 Chromium 系瀏覽器，請以參數指定路徑');

const svg = readFileSync(join(icons, 'icon.svg'), 'utf8');

// maskable：滿版背景（無圓角），主體縮至 80% 安全區內
const inner = svg.replace(/^[\s\S]*?<\/defs>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect width="512" height="512" rx="112" fill="url\(#bg\)"\/>/, '');
const defs = svg.match(/<defs>[\s\S]*?<\/defs>/)[0];
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <title>星域防線 Starward Bastion（maskable）</title>
  ${defs}
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(51.2 51.2) scale(0.8)">${inner}</g>
</svg>
`;
writeFileSync(join(icons, 'icon-maskable.svg'), maskable);

const tmp = mkdtempSync(join(tmpdir(), 'sb-icons-'));
// headless 瀏覽器寫完截圖後可能不會自行結束：輪詢到檔案大小穩定後即終止行程。
async function rasterize(svgText, out, w = 512, h = 512) {
  const html = join(tmp, 'page.html');
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${svgText.replace('<svg ', '<svg style="display:block" ')}</body></html>`);
  rmSync(out, { force: true });
  const proc = spawn(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${join(tmp, 'profile')}`, '--default-background-color=00000000', '--force-device-scale-factor=1',
    `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${html}`,
  ], { stdio: 'ignore' });
  let last = -1;
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const size = existsSync(out) ? statSync(out).size : -1;
    if (size > 0 && size === last) break;
    last = size;
  }
  proc.kill('SIGKILL');
  if (!existsSync(out)) throw new Error(`點陣化失敗：${out}`);
}
function resize(src, size, out) {
  execFileSync('sips', ['-z', String(size), String(size), src, '--out', out], { stdio: 'ignore' });
}

const base = join(tmp, 'base.png');
const baseMask = join(tmp, 'mask.png');
await rasterize(svg, base);
await rasterize(maskable, baseMask);
await rasterize(readFileSync(join(icons, 'og-image.svg'), 'utf8'), join(icons, 'og-image.png'), 1200, 630);

const outputs = [
  [base, 512, 'icon-512.png'], [base, 192, 'icon-192.png'], [base, 180, 'apple-touch-icon.png'],
  [baseMask, 512, 'icon-maskable-512.png'], [baseMask, 192, 'icon-maskable-192.png'],
];
for (const [src, size, name] of outputs) resize(src, size, join(icons, name));

// favicon.ico：16／32／48／64／128／256 PNG 內嵌
const sizes = [16, 32, 48, 64, 128, 256];
const pngs = sizes.map((s) => {
  const p = join(tmp, `ico-${s}.png`);
  resize(base, s, p);
  return readFileSync(p);
});
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const o = 6 + 16 * i;
  header.writeUInt8(s >= 256 ? 0 : s, o);
  header.writeUInt8(s >= 256 ? 0 : s, o + 1);
  header.writeUInt8(0, o + 2);
  header.writeUInt8(0, o + 3);
  header.writeUInt16LE(1, o + 4);
  header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(pngs[i].length, o + 8);
  header.writeUInt32LE(offset, o + 12);
  offset += pngs[i].length;
});
writeFileSync(join(root, 'favicon.ico'), Buffer.concat([header, ...pngs]));
rmSync(tmp, { recursive: true, force: true });
console.log(`已產生 ${outputs.map((o) => o[2]).join('、')}、og-image.png、icon-maskable.svg 與 favicon.ico（${sizes.join('/')}）`);
