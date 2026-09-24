// Gate B 可重現平衡測試：每張地圖執行多種建塔配置，逐波記錄漏怪、收入、支出與通關狀態，輸出 docs/平衡測試報告.md。
// 機器人只在波次之間操作：場上清空後，依配置順序把可負擔的塔放到覆蓋路線最多的位置，再開始下一波；波次中不操作。
// 用法：node tools/balance.mjs [--json]
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/data/maps.js';
import { TOWER_BY_ID } from '../src/data/towers.js';
import { Game } from '../src/core/game.js';
import { canPlaceTower } from '../src/core/mapgeom.js';

export const CONFIGS = [
  { id: 'C1', name: '混合均衡', order: ['T01', 'T07', 'T05', 'T03', 'T01', 'T07', 'T06', 'T10', 'T02', 'T09', 'T12', 'T04', 'T08', 'T11'], loop: ['T02', 'T07', 'T06', 'T09', 'T12', 'T03', 'T08', 'T04', 'T10'] },
  { id: 'C2', name: '低價密集', order: ['T01', 'T07', 'T05', 'T01', 'T07'], loop: ['T01', 'T07', 'T01', 'T01', 'T07'] },
  { id: 'C3', name: '範圍控制', order: ['T01', 'T07', 'T05', 'T03', 'T11', 'T09'], loop: ['T03', 'T09', 'T06', 'T11', 'T02', 'T08'] },
  { id: 'S1', name: '單塔種 T10', single: true, order: [], loop: ['T10'] },
  { id: 'S2', name: '單塔種 T12', single: true, order: [], loop: ['T12'] },
];

/** 取樣路線點（每 0.5 格）作為覆蓋評分依據；越接近基地權重越高。 */
function samples(game, layer) {
  const out = [];
  for (const p of Object.values(game.paths)) {
    if (layer !== 'both' && p.layer !== layer) continue;
    for (let d = 0; d <= p.length; d += 0.5) {
      let i = 1;
      while (i < p.cum.length - 1 && p.cum[i] < d) i++;
      const a = p.pts[i - 1];
      const b = p.pts[i];
      const t = (d - p.cum[i - 1]) / (p.cum[i] - p.cum[i - 1] || 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 1 + d / p.length]);
    }
  }
  return out;
}

function bestSpot(game, towerId, cache) {
  const def = TOWER_BY_ID[towerId];
  const key = def.target;
  cache[key] ??= samples(game, def.target);
  const pts = cache[key];
  const r = def.range;
  let best = null;
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 27; x++) {
      if (!canPlaceTower(game.map, x, y, game.occupied)) continue;
      const cx = x + 1;
      const cy = y + 1;
      let score = 0;
      for (const [px, py, w] of pts) if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) score += w;
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  return best && best.score > 0 ? best : null;
}

export function runConfig(mapId, cfg) {
  const g = new Game(mapId);
  const cache = {};
  let k = 0;
  const nextTower = () => (k < cfg.order.length ? cfg.order[k] : cfg.loop[(k - cfg.order.length) % cfg.loop.length]);
  const cum = { income: g.cr, spent: 0 };
  const rows = [];
  let status10 = null;
  while (!g.result) {
    // 波次之間：盡量建塔
    for (;;) {
      const id = nextTower();
      if (g.cr < TOWER_BY_ID[id].cost) break;
      const s = bestSpot(g, id, cache);
      if (!s) {
        k++;
        if (k > cfg.order.length + cfg.loop.length * 3) break;
        continue;
      }
      g.build(id, s.x, s.y);
      k++;
    }
    const before = { leaks: g.stats.leaks, earned: g.stats.earned, stipend: g.stats.stipend, spent: g.stats.spent };
    g.startWave();
    const n = g.wave;
    while (!g.result && !(g.spawnsDone && g.enemies.length === 0)) g.step(60);
    cum.income = 240 + g.stats.earned + g.stats.stipend;
    rows.push({
      wave: n,
      leaks: g.stats.leaks - before.leaks,
      income: g.stats.earned - before.earned + (g.stats.stipend - before.stipend),
      cumIncome: cum.income,
      cumSpent: g.stats.spent,
      towers: g.towers.length,
      hp: g.baseHp,
    });
    if (n === 10) status10 = g.result === 'LOSE' ? 'LOSE' : 'ALIVE';
  }
  return { mapId, cfg: cfg.id, result: g.result, wave: g.wave, baseHp: g.baseHp, leaks: g.stats.leaks, kills: g.stats.kills, towers: g.towers.length, status10: status10 ?? 'LOSE', status20: g.result === 'WIN' ? 'WIN' : 'LOSE', rows };
}

export function runAll(maps = MAPS) {
  return maps.map((m) => ({ map: m, runs: CONFIGS.map((c) => runConfig(m.id, c)) }));
}

function report(all) {
  const L = [];
  const p = (s = '') => L.push(s);
  p('# 平衡測試報告（Gate B）');
  p();
  p('> 由 `node tools/balance.mjs` 產生，**請勿手改**。模擬器與遊戲本體共用 `src/core/game.js`，結果可重現（無亂數）。');
  p();
  p('## 測試方法');
  p();
  p('- 機器人只在波次之間操作：場上敵人清空後，依配置順序把資源允許的塔放在「射程內路線取樣點最多（越近基地權重越高）」的位置，再開始下一波；波次進行中不操作。');
  p('- 配置：');
  for (const c of CONFIGS) p(`  - **${c.id} ${c.name}**：${c.order.length ? `開局 ${c.order.join('→')}，之後循環 ` : '只建 '}${c.loop.join('→')}`);
  p('- 割草風險判定（Gate B）：每個星級至少要有 1 張地圖**不能**以單一塔種（S1／S2）且不操作就無漏怪通關。');
  p();
  p('## 總表');
  p();
  p(`| 地圖 | 星級 | ${CONFIGS.map((c) => c.id).join(' | ')} |`);
  p(`| --- | --- | ${CONFIGS.map(() => '---').join(' | ')} |`);
  for (const { map, runs } of all) {
    p(`| ${map.id} ${map.name} | ${'★'.repeat(map.star)} | ${runs.map((r) => (r.result === 'WIN' ? `勝 ♥${r.baseHp}` : `敗 W${r.wave}`)).join(' | ')} |`);
  }
  p();
  p('格式：「勝 ♥剩餘生命」或「敗 W 結束波次」。');
  p();
  p('## 割草風險檢查');
  p();
  p('| 星級 | 單塔種無漏怪通關的地圖 | 不可被單塔種無漏怪通關的地圖 | 判定 |');
  p('| --- | --- | --- | --- |');
  const verdicts = [];
  for (let s = 1; s <= 5; s++) {
    const maps = all.filter((x) => x.map.star === s);
    const flawless = maps.filter((x) => x.runs.some((r) => CONFIGS.find((c) => c.id === r.cfg).single && r.result === 'WIN' && r.leaks === 0));
    const safe = maps.filter((x) => !flawless.includes(x));
    const ok = safe.length > 0;
    verdicts.push(ok);
    p(`| ${'★'.repeat(s)} | ${flawless.map((x) => x.map.id).join('、') || '—'} | ${safe.map((x) => x.map.id).join('、') || '—'} | ${ok ? '通過' : '**未通過**'} |`);
  }
  p();
  const winnable = all.filter((x) => x.runs.some((r) => r.result === 'WIN'));
  p(`- 至少一種配置可通關的地圖：${winnable.length}／${all.length}${winnable.length < all.length ? `（無法通關：${all.filter((x) => !winnable.includes(x)).map((x) => x.map.id).join('、')}）` : ''}`);
  p();
  p('## 逐圖逐配置紀錄');
  p();
  for (const { map, runs } of all) {
    p(`### ${map.id} ${map.name}（${'★'.repeat(map.star)}）`);
    p();
    for (const r of runs) {
      const c = CONFIGS.find((x) => x.id === r.cfg);
      p(`**${c.id} ${c.name}**：${r.result === 'WIN' ? '勝利' : '失敗'}，結束波次 ${r.wave}，基地剩餘 ${r.baseHp}，漏怪 ${r.leaks}，擊敗 ${r.kills}，建塔 ${r.towers}；波 10：${r.status10 === 'ALIVE' ? '存活' : '失敗'}，波 20：${r.status20 === 'WIN' ? '通關' : '未通關'}`);
      p();
      p('| 波 | ' + r.rows.map((x) => x.wave).join(' | ') + ' |');
      p('| --- | ' + r.rows.map(() => '---:').join(' | ') + ' |');
      p('| 漏怪 | ' + r.rows.map((x) => x.leaks).join(' | ') + ' |');
      p('| 累計收入 | ' + r.rows.map((x) => x.cumIncome).join(' | ') + ' |');
      p('| 累計支出 | ' + r.rows.map((x) => x.cumSpent).join(' | ') + ' |');
      p('| 基地 | ' + r.rows.map((x) => x.hp).join(' | ') + ' |');
      p();
    }
  }
  return { md: L.join('\n'), verdicts, winnable: winnable.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const all = runAll();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(all.map(({ map, runs }) => ({ id: map.id, star: map.star, runs: runs.map(({ rows, ...r }) => r) }))));
  } else {
    const { md, verdicts, winnable } = report(all);
    writeFileSync(new URL('../docs/平衡測試報告.md', import.meta.url), `${md}\n`);
    for (const { map, runs } of all) console.log(`${map.id} ${'★'.repeat(map.star).padEnd(5)} ${runs.map((r) => `${r.cfg}:${r.result === 'WIN' ? `W♥${r.baseHp}` : `L${r.wave}`}`).join(' ')}`);
    console.log(`割草檢查：${verdicts.map((v, i) => `${i + 1}★${v ? '通過' : '未通過'}`).join(' ')}；可通關地圖 ${winnable}/20；耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  }
}
