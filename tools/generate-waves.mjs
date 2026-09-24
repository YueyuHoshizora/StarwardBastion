// 產生 20 張地圖 × 20 波的精確敵人編成，輸出為 src/data/waves.js 的明文資料。
// 以地圖 ID 作為亂數種子，結果可重現；產出後的 waves.js 才是唯一有效資料來源。
// 用法：node tools/generate-waves.mjs
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/data/maps.js';
import { DIFFICULTY, waveSize } from '../src/data/difficulty.js';
import { ENEMIES, ENEMY_BY_ID, CAP_GROUPS, capLimit } from '../src/data/enemies.js';

const AIR_BIAS = { M05: 1.8, M13: 1.8, M15: 1.6, M18: 1.6, M20: 1.6, M16: 1.3, M11: 0.6, M14: 0.7, M06: 0.8 };
const TIER = { normal: 0, fast: 1, stealth: 2, shield: 3, split: 4, heavy: 5 };
const groupOf = (id) => Object.keys(CAP_GROUPS).find((g) => CAP_GROUPS[g].includes(id));
const uncapped = (id) => !groupOf(id);

function rngFor(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function typeCount(star, n) {
  return Math.min(DIFFICULTY[star].maxTypes, 2 + Math.floor(((n - 5) * (star + 1)) / 12));
}

function fixedWave(n) {
  const N = waveSize(n);
  if (n === 1) return [{ enemy: 'E01', count: N }];
  if (n === 2 || n === 3) return [{ enemy: 'E01', count: Math.ceil(N / 2) }, { enemy: 'E02', count: Math.floor(N / 2) }];
  return [{ enemy: 'E01', count: Math.ceil(N / 2) }, { enemy: 'E07', count: Math.floor(N / 2) }];
}

function generateMap(map) {
  const rnd = rngFor(map.id);
  const airBias = AIR_BIAS[map.id] ?? 1;
  const lastUsed = { E01: 4, E02: 3, E07: 4 };
  const waves = [1, 2, 3, 4].map(fixedWave);

  for (let n = 5; n <= 20; n++) {
    const N = waveSize(n);
    const t = typeCount(map.star, n);
    const pool = ENEMIES.filter((e) => e.earliest <= n).map((e) => e.id);
    const chosen = [];
    const groupTypes = { heavy: 0, fast: 0, stealth: 0 };
    const fits = (id) => {
      const g = groupOf(id);
      return !g || groupTypes[g] + 1 <= capLimit(g, N);
    };
    const add = (id) => {
      chosen.push(id);
      const g = groupOf(id);
      if (g) groupTypes[g]++;
    };
    const weight = (id) => {
      const e = ENEMY_BY_ID[id];
      const since = lastUsed[id] === undefined ? 12 : n - lastUsed[id];
      const layer = e.layer === 'air' ? airBias : 1;
      const heavyRamp = e.category === 'heavy' ? 0.6 + n / 20 : 1;
      return (1 + since * since) * layer * heavyRamp * (0.75 + rnd() * 0.5);
    };
    const pick = (cands) => {
      const ws = cands.map(weight);
      let r = rnd() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < cands.length; i++) if ((r -= ws[i]) <= 0) return cands[i];
      return cands[cands.length - 1];
    };

    // 至少一種不受數量上限限制的敵人，保證 N 名主體可分配完畢。
    add(pick(pool.filter(uncapped)));
    // 本波新解鎖且從未出現過的敵種優先登場。
    for (const id of pool) {
      if (chosen.length >= t) break;
      if (lastUsed[id] === undefined && ENEMY_BY_ID[id].earliest === n && !chosen.includes(id) && fits(id)) add(id);
    }
    while (chosen.length < t) {
      const cands = pool.filter((id) => !chosen.includes(id) && fits(id));
      if (!cands.length) break;
      add(pick(cands));
    }

    const counts = Object.fromEntries(chosen.map((id) => [id, 1]));
    const groupCount = (g) => chosen.filter((id) => groupOf(id) === g).reduce((s, id) => s + counts[id], 0);
    const share = (id) => {
      const c = ENEMY_BY_ID[id].category;
      if (c === 'normal') return 3;
      if (c === 'shield' || c === 'split') return 2;
      if (c === 'fast') return 2;
      if (c === 'heavy') return 0.8 + n / 25;
      return 1;
    };
    for (let left = N - chosen.length; left > 0; left--) {
      const cands = chosen.filter((id) => {
        const g = groupOf(id);
        return !g || groupCount(g) + 1 <= capLimit(g, N);
      });
      cands.sort((a, b) => counts[a] / share(a) - counts[b] / share(b) || a.localeCompare(b));
      if (!cands.length) throw new Error(`${map.id} 第 ${n} 波無法分配 ${N} 名敵人`);
      counts[cands[0]]++;
    }
    for (const id of chosen) lastUsed[id] = n;

    const order = [...chosen].sort((a, b) => TIER[ENEMY_BY_ID[a].category] - TIER[ENEMY_BY_ID[b].category] || a.localeCompare(b));
    waves.push(order.map((id) => ({ enemy: id, count: counts[id] })));
  }
  return waves;
}

const out = {};
for (const map of MAPS) out[map.id] = generateMap(map);

const lines = [
  '// 由 tools/generate-waves.mjs 產生後定稿的 20 張地圖 × 20 波敵人編成（規格第四節）。',
  '// 每波為依生成順序排列的敵群；路線分派規則見 src/core/waves.js assignRoutes()。',
  'export const WAVES = {',
];
for (const [id, waves] of Object.entries(out)) {
  lines.push(`  ${id}: [`);
  waves.forEach((w, i) => {
    const body = w.map((g) => `['${g.enemy}', ${g.count}]`).join(', ');
    lines.push(`    [${body}], // 第 ${i + 1} 波`);
  });
  lines.push('  ],');
}
lines.push('};', '');
writeFileSync(new URL('../src/data/waves.js', import.meta.url), lines.join('\n'));
console.log('已寫入 src/data/waves.js');
