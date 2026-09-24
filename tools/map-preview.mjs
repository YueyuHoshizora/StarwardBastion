// 地圖 ASCII 預覽：node tools/map-preview.mjs [地圖ID...]
import { MAPS } from '../src/data/maps.js';
import { buildMap, GRID_W, GRID_H } from '../src/core/mapgeom.js';

export function renderAscii(map) {
  const glyph = { 0: '·', 1: '=', 2: 'B', 3: '#', 4: '░' };
  const grid = [];
  for (let y = 0; y < GRID_H; y++) {
    const row = [];
    for (let x = 0; x < GRID_W; x++) row.push(glyph[map.cells[y * GRID_W + x]]);
    grid.push(row);
  }
  for (const r of map.routes) {
    if (r.layer !== 'air') continue;
    for (const [x, y] of r.cells) {
      const c = map.cells[y * GRID_W + x];
      grid[y][x] = c === 1 ? '+' : c === 2 ? 'B' : '^';
    }
  }
  for (const e of map.entrances) {
    const [x, y] = e.cell;
    grid[y][x] = e.layer === 'ground' ? 'G' : 'A';
  }
  const header = '   ' + Array.from({ length: GRID_W }, (_, i) => String(i % 10)).join('');
  return [header, ...grid.map((row, y) => String(y).padStart(2) + ' ' + row.join(''))].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ids = process.argv.slice(2);
  for (const def of MAPS.filter((m) => !ids.length || ids.includes(m.id))) {
    const map = buildMap(def);
    console.log(`${def.id} ${def.name} ★${def.star} 道路 ${map.roadCount} 分母 ${map.denominator} 可建 ${map.buildable} 共用段 ${map.sharedSegments.length}`);
    console.log(renderAscii(map));
    console.log();
  }
}
