// 地圖幾何推導：路線展開、地空共用段、道路格、禁建地形與可建塔格。
// 座標單位為格（1 格 = 64px），格 (x, y) 的中心為 (x + 0.5, y + 0.5)。
import { buildableCount } from '../data/difficulty.js';
import { TOWER_SIZE } from '../data/towers.js';

export const GRID_W = 28;
export const GRID_H = 16;
export const CELL_PX = 64;

const key = (x, y) => y * GRID_W + x;
const inGrid = (x, y) => x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
const stepKey = (a, b) => {
  const ka = key(a[0], a[1]);
  const kb = key(b[0], b[1]);
  return ka < kb ? `${ka}-${kb}` : `${kb}-${ka}`;
};

/** 將折線頂點展開成逐格序列；allowDiagonal 時允許 45° 斜段。 */
export function expandPath(points, allowDiagonal) {
  const cells = [[points[0][0], points[0][1]]];
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const ax = Math.abs(x1 - x0);
    const ay = Math.abs(y1 - y0);
    const straight = ax === 0 || ay === 0;
    if (ax + ay === 0) throw new Error(`路線頂點重複：${points[i]}`);
    if (!straight && !(allowDiagonal && ax === ay)) throw new Error(`非法路段 ${points[i - 1]} → ${points[i]}`);
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    for (let s = 1, n = Math.max(ax, ay); s <= n; s++) cells.push([x0 + dx * s, y0 + dy * s]);
  }
  return cells;
}

function featureCells(f) {
  const out = [];
  if (f.kind === 'rect') {
    for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) out.push([x, y]);
  } else if (f.kind === 'line') {
    out.push(...expandPath(f.points, true));
  } else if (f.kind === 'ring' || f.kind === 'disc') {
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const d = Math.hypot(x + 0.5 - f.cx, y + 0.5 - f.cy);
        if (f.kind === 'disc' ? d <= f.r : d >= f.r - 0.5 && d < f.r + 0.5) out.push([x, y]);
      }
    }
  } else {
    throw new Error(`未知地形 ${f.kind}`);
  }
  return out.filter(([x, y]) => inGrid(x, y));
}

/**
 * 推導完整地圖格資料。
 * 回傳 cells：Uint8Array，0 = 可建塔、1 = 地面道路、2 = 基地、3 = 主題禁建地形、4 = 邊陲荒地（禁建）。
 */
export function buildMap(def) {
  const [bx, by] = def.base;
  const baseCells = new Set();
  for (let y = by; y < by + 2; y++) for (let x = bx; x < bx + 2; x++) baseCells.add(key(x, y));

  const routes = [];
  for (const r of def.ground) routes.push({ ...r, layer: 'ground', cells: expandPath(r.points, false) });
  for (const r of def.air) routes.push({ ...r, layer: 'air', cells: expandPath(r.points, true) });

  const cells = new Uint8Array(GRID_W * GRID_H);
  const groundSteps = new Set();
  const airSteps = new Set();
  const routeCellKeys = [];
  for (const r of routes) {
    const half = r.layer === 'ground' ? ((r.width ?? 1) - 1) / 2 : 0;
    for (let i = 0; i < r.cells.length; i++) {
      const [x, y] = r.cells[i];
      routeCellKeys.push([x, y]);
      if (r.layer === 'ground') {
        for (let oy = -half; oy <= half; oy++) {
          for (let ox = -half; ox <= half; ox++) {
            if (inGrid(x + ox, y + oy)) cells[key(x + ox, y + oy)] = 1;
          }
        }
      }
      if (i > 0) (r.layer === 'ground' ? groundSteps : airSteps).add(stepKey(r.cells[i - 1], r.cells[i]));
    }
  }
  for (const k of baseCells) cells[k] = 2;

  // 逐段層級：同一相鄰格線段若同時屬於地面與空中路線，即為共用段。
  const segments = new Map();
  for (const r of routes) {
    for (let i = 1; i < r.cells.length; i++) {
      const k = stepKey(r.cells[i - 1], r.cells[i]);
      if (!segments.has(k)) segments.set(k, { a: r.cells[i - 1], b: r.cells[i], layers: new Set() });
      segments.get(k).layers.add(r.layer);
    }
  }
  const sharedSegments = [...segments.values()].filter((s) => s.layers.has('ground') && s.layers.has('air'));

  let roadCount = 0;
  for (const c of cells) if (c === 1) roadCount++;
  const denominator = GRID_W * GRID_H - roadCount - baseCells.size;
  const target = buildableCount(def.star, denominator);

  for (const f of def.terrain ?? []) {
    for (const [x, y] of featureCells(f)) if (cells[key(x, y)] === 0) cells[key(x, y)] = 3;
  }

  // 距離任何路線格中心越近越優先成為可建塔格；以 2×2 區塊為單位挑選，保證可建區可實際放塔。
  const dist = new Float32Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      let best = Infinity;
      for (const [rx, ry] of routeCellKeys) best = Math.min(best, Math.hypot(x - rx, y - ry));
      dist[key(x, y)] = best;
    }
  }
  const free = (x, y) => inGrid(x, y) && cells[key(x, y)] === 0;
  const blocks = [];
  for (let y = 0; y + TOWER_SIZE <= GRID_H; y++) {
    for (let x = 0; x + TOWER_SIZE <= GRID_W; x++) {
      if (!(free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1))) continue;
      const score = Math.max(dist[key(x, y)], dist[key(x + 1, y)], dist[key(x, y + 1)], dist[key(x + 1, y + 1)]);
      blocks.push({ x, y, score });
    }
  }
  blocks.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  const chosen = new Set();
  for (const b of blocks) {
    const ks = [key(b.x, b.y), key(b.x + 1, b.y), key(b.x, b.y + 1), key(b.x + 1, b.y + 1)];
    const fresh = ks.filter((k) => !chosen.has(k));
    if (chosen.size + fresh.length <= target) fresh.forEach((k) => chosen.add(k));
    if (chosen.size === target) break;
  }
  // 不足 4 格的餘數：挑與既有可建區相鄰、距離最近的單格補齊。
  while (chosen.size < target) {
    let pick = -1;
    for (let k = 0; k < cells.length; k++) {
      if (cells[k] !== 0 || chosen.has(k)) continue;
      const x = k % GRID_W;
      const y = (k - x) / GRID_W;
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inGrid(x + dx, y + dy) && chosen.has(key(x + dx, y + dy)));
      if (adj && (pick < 0 || dist[k] < dist[pick])) pick = k;
    }
    if (pick < 0) throw new Error(`${def.id} 可建塔格不足：需要 ${target}，已選 ${chosen.size}`);
    chosen.add(pick);
  }
  for (let k = 0; k < cells.length; k++) if (cells[k] === 0 && !chosen.has(k)) cells[k] = 4;

  return {
    def,
    cells,
    routes,
    baseCells,
    sharedSegments,
    segments: [...segments.values()],
    denominator,
    buildable: target,
    roadCount,
    entrances: routes.map((r) => ({ route: r.id, layer: r.layer, cell: r.cells[0] })),
  };
}

export const cellAt = (map, x, y) => (inGrid(x, y) ? map.cells[key(x, y)] : -1);

/** 塔左上角位於 (x, y) 時，2×2 佔地是否全為可建塔格且未被佔用。 */
export function canPlaceTower(map, x, y, occupied) {
  for (let oy = 0; oy < TOWER_SIZE; oy++) {
    for (let ox = 0; ox < TOWER_SIZE; ox++) {
      if (cellAt(map, x + ox, y + oy) !== 0) return false;
      if (occupied?.has(key(x + ox, y + oy))) return false;
    }
  }
  return true;
}

export const cellKey = key;
