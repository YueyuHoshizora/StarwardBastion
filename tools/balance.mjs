// Gate B 可重現平衡測試：每張地圖執行多種建塔配置，逐波記錄漏怪、收入、支出與通關狀態，輸出 docs/平衡測試報告.md。
// 機器人只在波次之間操作：場上清空後建塔、開波並以津貼再建塔；波次進行中不操作。
// 選塔：隱形將出現時先補 T05；再依下一波空／地 HP 比例補足投資較少的一側；位置取邊際覆蓋最高處。
// 用法：node tools/balance.mjs [--json]
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/data/maps.js';
import { TOWER_BY_ID } from '../src/data/towers.js';
import { Game } from '../src/core/game.js';
import { canPlaceTower } from '../src/core/mapgeom.js';
import { WAVES } from '../src/data/waves.js';
import { ENEMY_BY_ID } from '../src/data/enemies.js';
import { scaledHp } from '../src/data/difficulty.js';

export const CONFIGS = [
  { id: 'C1', name: '混合均衡', ground: ['T01', 'T03', 'T01', 'T06', 'T02', 'T10', 'T04', 'T12'], air: ['T07', 'T09', 'T07', 'T08'] },
  { id: 'C2', name: '低價密集', ground: ['T01'], air: ['T07'] },
  { id: 'C3', name: '範圍控制', ground: ['T01', 'T03', 'T06', 'T11', 'T03', 'T02'], air: ['T07', 'T09', 'T08'] },
  { id: 'S1', name: '單塔種 T10', single: true, ground: ['T10'], air: [] },
  { id: 'S2', name: '單塔種 T12', single: true, ground: ['T12'], air: [] },
]

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

/**
 * 邊際覆蓋評分：取樣點權重除以（1＋已覆蓋該點的同類塔數），讓塔分散到尚未被防守的路線，
 * 模擬玩家「補防薄弱路段」的直覺，而不是全部疊在同一處。
 */
function bestSpot(game, towerId, cache) {
  const def = TOWER_BY_ID[towerId];
  // T05 以 6.0 格偵測半徑覆蓋地面路線（隱形敵人皆為地面）為主要評分，只與其他 T05 比較重疊。
  const detect = !!def.detectRadius;
  const key = detect ? 'ground' : def.target;
  cache[key] ??= samples(game, key);
  const pts = cache[key];
  const cover = pts.map(([px, py]) => {
    let n = 0;
    for (const t of game.towers) {
      if (detect) {
        if (t.def.detectRadius && (px - t.cx) ** 2 + (py - t.cy) ** 2 <= t.def.detectRadius ** 2) n++;
        continue;
      }
      if (t.def.target !== 'both' && def.target !== 'both' && t.def.target !== def.target) continue;
      if ((px - t.cx) ** 2 + (py - t.cy) ** 2 <= t.def.range ** 2) n++;
    }
    return n;
  });
  const r = detect ? def.detectRadius : def.range;
  let best = null;
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 27; x++) {
      if (!canPlaceTower(game.map, x, y, game.occupied)) continue;
      const cx = x + 1;
      const cy = y + 1;
      let score = 0;
      pts.forEach(([px, py, w], i) => {
        if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) score += w / (1 + cover[i]);
      });
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  return best && best.score > 0 ? best : null;
}

/** 本波各層級總 HP（含護盾）與是否含隱形，作為機器人分配對空／對地投資的依據（玩家可見的敵人資訊）。 */
function waveProfile(g, n) {
  const out = { ground: 0, air: 0, stealth: false };
  if (n > 20) return out;
  for (const [id, c] of WAVES[g.mapId][n - 1]) {
    const e = ENEMY_BY_ID[id];
    out[e.layer] += (scaledHp(e.hp, g.star, n) + scaledHp(e.shield, g.star, n)) * c;
    if (e.category === 'stealth') out.stealth = true;
  }
  return out;
}

export function runConfig(mapId, cfg) {
  const g = new Game(mapId);
  const cache = {};
  const idx = { ground: 0, air: 0 };
  const invest = { ground: 0, air: 0 };
  const cum = { income: g.cr, spent: 0 };
  const startCr = g.cr;
  const rows = [];
  let status10 = null;
  // 回饋：上一波有隱形漏怪就多蓋一座 T05（最多 4 座）；空中漏怪則提高對空投資比例。
  const adapt = { t05: 1, airBias: 0 };
  // 決定下一座塔：先確保 T05 數量足以對付即將出現的隱形；再依下一波空／地 HP 比例（加上回饋偏移）補足投資較少的一側。
  const pick = (prof) => {
    if (cfg.single) return cfg.ground[0];
    if (prof.stealth && g.towers.filter((t) => t.id === 'T05').length < adapt.t05) return 'T05';
    const total = prof.ground + prof.air || 1;
    const investTotal = invest.ground + invest.air || 1;
    const layer = prof.air > 0 && invest.air / investTotal < Math.min(0.9, prof.air / total + adapt.airBias) ? 'air' : 'ground';
    return cfg[layer][idx[layer] % cfg[layer].length];
  };
  const buildPhase = (n) => {
    const prof = waveProfile(g, n);
    for (let guard = 0; guard < 40; guard++) {
      const id = pick(prof);
      if (g.cr < TOWER_BY_ID[id].cost) break;
      const s = bestSpot(g, id, cache);
      const layer = TOWER_BY_ID[id].target === 'air' ? 'air' : 'ground';
      if (id !== 'T05' || !prof.stealth) idx[layer]++;
      if (!s) {
        // 沒有能覆蓋路線的空位時改為升級：優先等級最低、再以升級費最低者（同塔種優先）
        const cand = g.towers.filter((t) => t.def.upgradeCost != null && t.def.upgradeCost <= g.cr)
          .sort((a, b) => (a.id === id ? 0 : 1) - (b.id === id ? 0 : 1) || a.level - b.level || a.def.upgradeCost - b.def.upgradeCost)[0];
        if (!cand) continue;
        const cost = cand.def.upgradeCost;
        g.upgrade(cand);
        const ut = cand.def.target;
        if (ut === 'both') {
          invest.ground += cost / 2;
          invest.air += cost / 2;
        } else invest[ut] += cost;
        continue;
      }
      g.build(id, s.x, s.y);
      const t = TOWER_BY_ID[id].target;
      if (t === 'both') {
        invest.ground += TOWER_BY_ID[id].cost / 2;
        invest.air += TOWER_BY_ID[id].cost / 2;
      } else invest[t] += TOWER_BY_ID[id].cost;
    }
  };
  while (!g.result) {
    // 波次之間（場上清空）：建塔 → 開波 → 以剛發放的津貼再建塔；波次進行中不操作。
    buildPhase(g.wave + 1);
    const before = { leaks: g.stats.leaks, earned: g.stats.earned, stipend: g.stats.stipend, spent: g.stats.spent };
    g.startWave();
    const n = g.wave;
    buildPhase(n);
    const leakedBy = { stealth: 0, air: 0 };
    while (!g.result && !(g.spawnsDone && g.enemies.length === 0)) {
      g.step(60);
      for (const ev of g.drainEvents()) {
        if (ev.type !== 'baseHit') continue;
        if (ev.enemy.stealth) leakedBy.stealth++;
        if (ev.enemy.layer === 'air') leakedBy.air++;
      }
    }
    if (leakedBy.stealth) adapt.t05 = Math.min(4, adapt.t05 + 1);
    if (leakedBy.air) adapt.airBias = Math.min(0.4, adapt.airBias + 0.1);
    cum.income = startCr + g.stats.earned + g.stats.stipend;
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
  p('- 機器人只在波次之間操作：場上敵人清空後建塔、按下開始下一波，並立即以發放的津貼再建塔；波次進行中不操作。\n- 選塔：下一波含隱形且 T05 數量不足時先建 T05；其餘依下一波空中／地面總 HP 比例，補足投資較少的一側。\n- 回饋：上一波有隱形漏怪就把 T05 目標數加 1（最多 4 座，以 6.0 格偵測覆蓋地面路線選位）；有空中漏怪則對空投資比例提高 10%（最多 +40%）。\n- 位置：射程內路線取樣點的邊際覆蓋最高處（越近基地權重越高、已被覆蓋的點權重遞減）。\n- 升級：選定的塔找不到能覆蓋路線的空位時，改升級等級最低的塔（同塔種優先、其次升級費最低）。');
  p('- 配置：');
  for (const c of CONFIGS) p(`  - **${c.id} ${c.name}**：${c.single ? `只建 ${c.ground[0]}` : `對地循環 ${c.ground.join('→')}；對空循環 ${c.air.join('→')}`}`);
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
  const bestHp = all.map((x) => ({ id: x.map.id, hp: Math.max(...x.runs.map((r) => (r.result === 'WIN' ? r.baseHp : -1))) }));
  const low = bestHp.filter((x) => x.hp < 16);
  p(`- 每張地圖最佳配置的基地剩餘生命（目標 ≥16，即 80%）：最低 ${Math.min(...bestHp.map((x) => x.hp))}；${low.length ? `**未達標：${low.map((x) => `${x.id}（${x.hp}）`).join('、')}**` : '全部達標'}`);
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
