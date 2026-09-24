// Gate B 可重現平衡掃描：三種玩家模型 × 20 張地圖，加上敵人 HP 壓力測試，輸出 docs/平衡測試報告.md。
// 機器人只在波次之間操作：場上清空後（出售、移動）建塔、開波並以津貼再建塔；波次進行中不操作。
// 高手：事先知道下一波組成，依空／地 HP 比例投資，位置取邊際覆蓋最高處，沒有空位時升級；
//       剩餘波次不再需要的塔會出售，覆蓋遠低於最佳空位的塔會移動。
// 一般（初見）：不知道下一波，依已看過各波的空／地 HP 累計比例分配投資，見過隱形才補 T05；在前 5 名位置中隨機選；會升級。
// 新手：不知道下一波，隨機選塔、在靠近路線的位置中隨機放置；隱形漏怪後才補 T05；不升級。
// 模擬以 worker_threads 平行執行；每項工作都是純函式（亂數有固定種子），結果與執行順序無關、可重現。
// 用法：node tools/balance.mjs [--json]
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { MAPS } from '../src/data/maps.js';
import { TOWERS, TOWER_BY_ID } from '../src/data/towers.js';
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
];

/** 通關方式矩陣：7 種對地主力 × 3 種對空主力，外加 3 組控制塔（T05／T11）搭配；每種各自一個高手配置。 */
export const MAIN_GROUND = ['T01', 'T02', 'T03', 'T04', 'T06', 'T10', 'T12'];
export const MAIN_AIR = ['T07', 'T08', 'T09'];
export const STRATEGIES = [
  ...MAIN_GROUND.flatMap((g) => MAIN_AIR.map((a) => ({ id: `${g}+${a}`, ground: [g], air: [a] }))),
  { id: 'T01/T11+T07', ground: ['T01', 'T11'], air: ['T07'] },
  { id: 'T02/T05+T08', ground: ['T02', 'T05'], air: ['T08'] },
  { id: 'T03/T11+T09', ground: ['T03', 'T11'], air: ['T09'] },
];
/** 「一種通關方式」＝高手配置通關且基地剩餘生命 ≥ WAY_HP（50%）；每張地圖至少 MIN_WAYS 種，且對地主力至少 MIN_GROUND_MAINS 種不同塔。 */
export const WAY_HP = 10;
export const MIN_WAYS = 5;
export const MIN_GROUND_MAINS = 3;
/** 不會難到無法通關：高手最佳方式基地生命 ≥ BEST_HP（80%），且敵人 HP 再乘 MIN_LIMIT 仍能通關。 */
export const BEST_HP = 16;
export const MIN_LIMIT = 1.1;
/** 具有難度：一般（初見）與新手的勝率區間，星級越高越難；各星級平均的一般勝率必須嚴格遞減。 */
export const TARGETS = {
  1: { casual: [0.85, 1], novice: [0.6, 0.95] },
  2: { casual: [0.7, 0.95], novice: [0.2, 0.85] },
  3: { casual: [0.5, 0.85], novice: [0, 0.6] },
  4: { casual: [0.3, 0.65], novice: [0, 0.35] },
  5: { casual: [0.15, 0.45], novice: [0, 0.15] },
};
/** 塔種平衡：慣用塔含某主力塔的一般玩家勝率，與全部一般玩家平均勝率的差距上限。 */
export const TOWER_SPREAD = 0.12;

/**
 * 玩家模型。foresight：事先知道下一波組成；t05：見過隱形後預先建的 T05 數（0＝漏怪後才建）；
 * topK：在前 K 名位置中隨機選；nearRatio：在分數達最佳值此比例的位置中隨機選；randomTower：隨機選塔；
 * manage：波次之間出售不再需要的塔、移動低效塔（單塔種配置 S1／S2 為「不操作」基準，不套用）。
 */
export const SKILLS = {
  expert: { name: '高手', foresight: true, upgrade: true, t05: 1, manage: true },
  casual: { name: '一般', foresight: false, upgrade: true, t05: 1, topK: 5 },
  novice: { name: '新手', foresight: false, upgrade: false, t05: 0, nearRatio: 0.3, randomTower: true },
};
/** 高手移動：塔目前的邊際覆蓋低於同塔種最佳空位的此比例、且付得起移動費時才移動；每個波次之間最多移動幾座。 */
export const RELOCATE_RATIO = 0.6;
export const RELOCATE_MAX = 2;
const NOVICE_POOL = {
  ground: TOWERS.filter((t) => t.target !== 'air').map((t) => t.id),
  air: TOWERS.filter((t) => t.target !== 'ground').map((t) => t.id),
};
/** 慣用塔組合：2 種對地主力 × 1 種對空主力的全部組合（21 × 3 = 63 種）。 */
const LOADOUTS = MAIN_GROUND.flatMap((a, i) => MAIN_GROUND.slice(i + 1).map((b) => [a, b]))
  .flatMap((ground) => MAIN_AIR.map((air) => ({ ground, air: [air] })));
/** 一般玩家：每種慣用塔組合一局，以編號為選位亂數種子。 */
export const CASUAL = LOADOUTS.map((l, i) => ({ id: `一般#${i + 1}`, skill: 'casual', seed: i + 1, ...l }));
/** 高手混合配置：同樣 63 種組合改由高手執行，用於高手最佳生命與壓力測試（不計入通關方式）。 */
export const EXPERT_MIX = LOADOUTS.map((l, i) => ({ id: `${l.ground.join('/')}+${l.air[0]}`, ...l }));
/** 新手：每張地圖 NOVICE_SEEDS 個種子（各地圖共用同一組種子）。 */
export const NOVICE_SEEDS = 32;
export const NOVICE = Array.from({ length: NOVICE_SEEDS }, (_, i) => ({ id: `新手#${i + 1}`, skill: 'novice', seed: i + 1, ...NOVICE_POOL }));

/** 決定性亂數（mulberry32）。 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

/** 各取樣點已被幾座同類塔覆蓋（exclude 不計入，用來評估某座塔自己的貢獻）。 */
function coverCounts(game, def, pts, exclude = null) {
  const detect = !!def.detectRadius;
  return pts.map(([px, py]) => {
    let n = 0;
    for (const t of game.towers) {
      if (t === exclude) continue;
      if (detect) {
        if (t.def.detectRadius && (px - t.cx) ** 2 + (py - t.cy) ** 2 <= t.def.detectRadius ** 2) n++;
        continue;
      }
      if (t.def.target !== 'both' && def.target !== 'both' && t.def.target !== def.target) continue;
      if ((px - t.cx) ** 2 + (py - t.cy) ** 2 <= t.def.range ** 2) n++;
    }
    return n;
  });
}

/** 以塔中心 (cx, cy)、半徑 r 覆蓋取樣點的邊際分數。 */
const spotScore = (pts, cover, cx, cy, r) => pts.reduce((s, [px, py, w], i) => ((px - cx) ** 2 + (py - cy) ** 2 <= r * r ? s + w / (1 + cover[i]) : s), 0);

/** 取樣點依塔種快取：T05 以 6.0 格偵測半徑覆蓋地面路線（隱形敵人皆為地面）評分。 */
function samplesFor(game, def, cache) {
  const key = def.detectRadius ? 'ground' : def.target;
  return (cache[key] ??= samples(game, key));
}

/**
 * 邊際覆蓋評分：取樣點權重除以（1＋已覆蓋該點的同類塔數），讓塔分散到尚未被防守的路線，
 * 模擬玩家「補防薄弱路段」的直覺，而不是全部疊在同一處。回傳分數 > 0 的位置，由高到低（同分依掃描順序）。
 */
function rankSpots(game, towerId, cache) {
  const def = TOWER_BY_ID[towerId];
  const pts = samplesFor(game, def, cache);
  const cover = coverCounts(game, def, pts);
  const r = def.detectRadius ?? def.range;
  const spots = [];
  for (let y = 0; y < 15; y++) {
    for (let x = 0; x < 27; x++) {
      if (!canPlaceTower(game.map, x, y, game.occupied)) continue;
      const score = spotScore(pts, cover, x + 1, y + 1, r);
      if (score > 0) spots.push({ x, y, score });
    }
  }
  return spots.sort((a, b) => b.score - a.score);
}

/** 本波各層級總 HP（含護盾）與是否含隱形，作為機器人分配對空／對地投資的依據。 */
function waveProfile(g, n) {
  const out = { ground: 0, air: 0, stealth: false };
  if (n < 1 || n > 20) return out;
  for (const [id, c] of WAVES[g.mapId][n - 1]) {
    const e = ENEMY_BY_ID[id];
    out[e.layer] += (scaledHp(e.hp, g.star, n, g.def.hpTune) + scaledHp(e.shield, g.star, n, g.def.hpTune)) * c;
    if (e.category === 'stealth') out.stealth = true;
  }
  return out;
}

/** 執行一局；hpScale 為壓力測試倍率（所有敵人含分裂子體的 HP 與護盾乘上此值）。 */
export function runConfig(mapId, cfg, hpScale = 1) {
  const skill = SKILLS[cfg.skill ?? 'expert'];
  const rand = mulberry32(cfg.seed ?? 1);
  const g = new Game(mapId);
  if (hpScale !== 1) {
    const spawn = g.spawn.bind(g);
    g.spawn = (...args) => {
      const e = spawn(...args);
      e.hp = e.maxHp = Math.round(e.hp * hpScale);
      e.shield = e.maxShield = Math.round(e.shield * hpScale);
      return e;
    };
  }
  const cache = {};
  const idx = { ground: 0, air: 0 };
  const invest = { ground: 0, air: 0 };
  const startCr = g.cr;
  const rows = [];
  const leakBy = {};
  let upgrades = 0;
  let relocations = 0;
  let sold = 0;
  const manage = skill.manage && !cfg.single;
  let status10 = null;
  // 無預知模型的依據：已看過各波的空／地總 HP 累計，以及是否見過隱形（第 1 波前沒有資訊，視為全地面）
  const seen = { ground: 0, air: 0, stealth: false };
  // 回饋：上一波有隱形漏怪就多蓋一座 T05（最多 4 座）；空中漏怪則提高對空投資比例。
  const adapt = { t05: skill.t05, airBias: 0 };
  const profile = (next) => {
    if (skill.foresight) return waveProfile(g, next);
    return seen.ground + seen.air ? { ...seen } : { ground: 1, air: 0, stealth: false };
  };
  const addInvest = (target, cost) => {
    if (target === 'both') {
      invest.ground += cost / 2;
      invest.air += cost / 2;
    } else invest[target] += cost;
  };
  // 決定下一座塔：先確保 T05 數量足以對付隱形；再依空／地 HP 比例（加上回饋偏移）補足投資較少的一側。
  const pick = (prof) => {
    if (cfg.single) return cfg.ground[0];
    if (prof.stealth && g.towers.filter((t) => t.id === 'T05').length < adapt.t05) return 'T05';
    const total = prof.ground + prof.air || 1;
    const investTotal = invest.ground + invest.air || 1;
    const layer = prof.air > 0 && invest.air / investTotal < Math.min(0.9, prof.air / total + adapt.airBias) ? 'air' : 'ground';
    if (skill.randomTower) return NOVICE_POOL[layer][Math.floor(rand() * NOVICE_POOL[layer].length)];
    return cfg[layer][idx[layer] % cfg[layer].length];
  };
  const chooseSpot = (id) => {
    const list = rankSpots(g, id, cache);
    if (!list.length) return null;
    if (skill.topK) return list[Math.floor(rand() * Math.min(skill.topK, list.length))];
    if (skill.nearRatio) {
      const near = list.filter((s) => s.score >= list[0].score * skill.nearRatio);
      return near[Math.floor(rand() * near.length)];
    }
    return list[0];
  };
  const buildPhase = (next) => {
    const prof = profile(next);
    for (let guard = 0; guard < 40; guard++) {
      const id = pick(prof);
      if (g.cr < TOWER_BY_ID[id].cost) break;
      const s = chooseSpot(id);
      const layer = TOWER_BY_ID[id].target === 'air' ? 'air' : 'ground';
      if (id !== 'T05' || !prof.stealth) idx[layer]++;
      if (!s) {
        if (!skill.upgrade) continue;
        // 沒有能覆蓋路線的空位時改為升級：優先等級最低、再以升級費最低者（同塔種優先）
        const cand = g.towers.filter((t) => t.def.upgradeCost != null && t.def.upgradeCost <= g.cr)
          .sort((a, b) => (a.id === id ? 0 : 1) - (b.id === id ? 0 : 1) || a.level - b.level || a.def.upgradeCost - b.def.upgradeCost)[0];
        if (!cand) continue;
        const cost = cand.def.upgradeCost;
        g.upgrade(cand);
        upgrades++;
        addInvest(cand.def.target, cost);
        continue;
      }
      g.build(id, s.x, s.y);
      addInvest(TOWER_BY_ID[id].target, TOWER_BY_ID[id].cost);
    }
  };
  // 高手（預知）：剩餘波次不會再出現空中敵人就出售對空塔、不會再出現隱形就出售 T05，退款轉投其他塔。
  const sellPhase = (next) => {
    if (!manage) return;
    const rest = { air: 0, stealth: false };
    for (let n = next; n <= 20; n++) {
      const p = waveProfile(g, n);
      rest.air += p.air;
      rest.stealth ||= p.stealth;
    }
    for (const t of [...g.towers]) {
      if (t.def.target === 'air' ? rest.air > 0 : t.id !== 'T05' || rest.stealth) continue;
      if (!g.sell(t).ok) continue;
      sold++;
      addInvest(t.def.target, -t.invested);
    }
  };
  // 高手：塔自身的邊際覆蓋（不計自己）低於同塔種最佳空位 RELOCATE_RATIO 時，移到該空位；由最低效者開始。
  const relocatePhase = () => {
    if (!manage) return;
    const best = {};
    const cands = [];
    for (const t of g.towers) {
      best[t.id] ??= rankSpots(g, t.id, cache)[0] ?? null;
      const spot = best[t.id];
      if (!spot) continue;
      const pts = samplesFor(g, t.def, cache);
      const own = spotScore(pts, coverCounts(g, t.def, pts, t), t.cx, t.cy, t.def.detectRadius ?? t.def.range);
      if (own < spot.score * RELOCATE_RATIO) cands.push({ t, ratio: own / spot.score });
    }
    cands.sort((a, b) => a.ratio - b.ratio || a.t.uid - b.t.uid);
    let moved = 0;
    for (const { t } of cands) {
      if (moved >= RELOCATE_MAX) break;
      // 前一座移動後空位與覆蓋都已改變，重新排名
      const spot = rankSpots(g, t.id, cache)[0];
      if (!spot || !g.relocate(t, spot.x, spot.y).ok) continue;
      moved++;
      relocations++;
    }
  };
  while (!g.result) {
    // 波次之間（場上清空）：出售、移動 → 建塔 → 開波 → 以剛發放的津貼再建塔；波次進行中不操作。
    sellPhase(g.wave + 1);
    relocatePhase();
    buildPhase(g.wave + 1);
    const before = { leaks: g.stats.leaks, earned: g.stats.earned, stipend: g.stats.stipend };
    g.startWave();
    const n = g.wave;
    buildPhase(n);
    const leakedBy = { stealth: 0, air: 0 };
    while (!g.result && !(g.spawnsDone && g.enemies.length === 0)) {
      g.step(60);
      for (const ev of g.drainEvents()) {
        if (ev.type !== 'baseHit') continue;
        leakBy[ev.enemy.id] = (leakBy[ev.enemy.id] ?? 0) + 1;
        if (ev.enemy.stealth) leakedBy.stealth++;
        if (ev.enemy.layer === 'air') leakedBy.air++;
      }
    }
    if (leakedBy.stealth) adapt.t05 = Math.min(4, adapt.t05 + 1);
    if (leakedBy.air) adapt.airBias = Math.min(0.4, adapt.airBias + 0.1);
    const p = waveProfile(g, n);
    seen.ground += p.ground;
    seen.air += p.air;
    seen.stealth ||= p.stealth;
    rows.push({
      wave: n,
      leaks: g.stats.leaks - before.leaks,
      income: g.stats.earned - before.earned + (g.stats.stipend - before.stipend),
      cumIncome: startCr + g.stats.earned + g.stats.stipend + g.stats.refunded,
      cumSpent: g.stats.spent,
      towers: g.towers.length,
      hp: g.baseHp,
    });
    if (n === 10) status10 = g.result === 'LOSE' ? 'LOSE' : 'ALIVE';
  }
  return {
    mapId, cfg: cfg.id, skill: cfg.skill ?? 'expert', hpScale, result: g.result, wave: g.wave, baseHp: g.baseHp,
    leaks: g.stats.leaks, kills: g.stats.kills, towers: g.towers.length, upgrades, relocations, sold, unspent: g.cr, leakBy,
    status10: status10 ?? 'LOSE', status20: g.result === 'WIN' ? 'WIN' : 'LOSE', rows,
  };
}

// ---------- 平行執行 ----------

/** 工作者池：每個 worker 執行 runConfig；以工作佇列分派，結果依工作順序回傳。 */
function createPool(size = availableParallelism()) {
  const workers = Array.from({ length: size }, () => new Worker(new URL(import.meta.url), { workerData: { balanceWorker: true } }));
  return {
    run(jobs) {
      return new Promise((resolve, reject) => {
        const out = new Array(jobs.length);
        let next = 0;
        let done = 0;
        if (!jobs.length) return resolve(out);
        const feed = (w) => {
          if (next < jobs.length) {
            const i = next++;
            w.postMessage({ i, job: jobs[i] });
          }
        };
        for (const w of workers) {
          w.removeAllListeners('message').removeAllListeners('error');
          w.on('message', ({ i, r }) => {
            out[i] = r;
            if (++done === jobs.length) resolve(out);
            else feed(w);
          });
          w.on('error', reject);
          feed(w);
        }
      });
    },
    close: () => Promise.all(workers.map((w) => w.terminate())),
  };
}

if (!isMainThread && workerData?.balanceWorker) {
  parentPort.on('message', ({ i, job }) => parentPort.postMessage({ i, r: runConfig(job.mapId, job.cfg, job.hpScale) }));
}

/** 壓力測試：每張地圖取高手全部配置（通關方式矩陣、混合配置與 C1–C3、S1、S2）中表現最好的 STRESS_TOP 種，二分搜尋仍能通關的最大敵人 HP 倍率。 */
export const STRESS_TOP = 5;
const STRESS_STEPS = 8;
const rank = (r) => (r.result === 'WIN' ? 100 + r.baseHp : r.wave);
const EXPERT_BY_ID = Object.fromEntries([...STRATEGIES, ...CONFIGS, ...EXPERT_MIX].map((c) => [c.id, c]));
const expertRuns = (e) => [...e.ways, ...e.runs, ...e.mix];

async function stressTest(all, pool) {
  const state = all.map((e) => {
    const expert = expertRuns(e);
    const top = expert.sort((a, b) => rank(b) - rank(a)).slice(0, STRESS_TOP).map((r) => EXPERT_BY_ID[r.cfg]);
    const win = expert.some((r) => r.result === 'WIN');
    return { e, top, lo: win ? 1 : 0.5, hi: win ? 3 : 1, by: null };
  });
  for (let step = 0; step < STRESS_STEPS; step++) {
    const jobs = state.flatMap((s) => s.top.map((cfg) => ({ mapId: s.e.map.id, cfg, hpScale: (s.lo + s.hi) / 2 })));
    const res = await pool.run(jobs);
    state.forEach((s, i) => {
      const winner = res.slice(i * STRESS_TOP, (i + 1) * STRESS_TOP).find((r) => r.result === 'WIN');
      const mid = (s.lo + s.hi) / 2;
      if (winner) {
        s.lo = mid;
        s.by = winner.cfg;
      } else s.hi = mid;
    });
  }
  for (const s of state) s.e.stress = { limit: s.lo, by: s.by, top: s.top.map((c) => c.id) };
}

export async function runAll(maps = MAPS) {
  const pool = createPool();
  try {
    const plan = maps.flatMap((map) => [
      ...CONFIGS.map((cfg) => ({ map, kind: 'runs', cfg })),
      ...STRATEGIES.map((cfg) => ({ map, kind: 'ways', cfg })),
      ...EXPERT_MIX.map((cfg) => ({ map, kind: 'mix', cfg })),
      ...CASUAL.map((cfg) => ({ map, kind: 'casual', cfg })),
      ...NOVICE.map((cfg) => ({ map, kind: 'novice', cfg })),
    ]);
    const res = await pool.run(plan.map(({ map, cfg }) => ({ mapId: map.id, cfg })));
    const all = maps.map((map) => ({ map, runs: [], ways: [], mix: [], casual: [], novice: [] }));
    plan.forEach((p, i) => all[maps.indexOf(p.map)][p.kind].push(res[i]));
    await stressTest(all, pool);
    return all;
  } finally {
    await pool.close();
  }
}

// ---------- 判定 ----------

const isWay = (r) => r.result === 'WIN' && r.baseHp >= WAY_HP;
const winRate = (runs) => runs.filter((r) => r.result === 'WIN').length / runs.length;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x) => `${Math.round(x * 100)}%`;
const stars = (n) => '★'.repeat(n);
const band = ([lo, hi]) => `${pct(lo)}–${pct(hi)}`;
const CASUAL_BY_ID = Object.fromEntries(CASUAL.map((c) => [c.id, c]));

/** 每張地圖可行的通關方式與判定。 */
export function waysVerdict(entry) {
  const ok = entry.ways.filter(isWay);
  const mains = new Set(ok.map((r) => STRATEGIES.find((s) => s.id === r.cfg).ground[0]));
  return { ok, mains, pass: ok.length >= MIN_WAYS && mains.size >= MIN_GROUND_MAINS };
}

/** 每張地圖的難度指標。 */
export function mapMetrics(entry) {
  const v = waysVerdict(entry);
  return {
    ways: v.ok.length,
    mains: v.mains.size,
    bestHp: Math.max(...expertRuns(entry).map((r) => (r.result === 'WIN' ? r.baseHp : -1))),
    limit: entry.stress.limit,
    casual: winRate(entry.casual),
    casualHp: mean(entry.casual.map((r) => r.baseHp)),
    novice: winRate(entry.novice),
    noviceHp: mean(entry.novice.map((r) => r.baseHp)),
  };
}

/** 每張地圖的判定：不會無法通關（高手）＋具有難度（一般、新手勝率落在星級區間）。 */
export function mapVerdict(entry) {
  const m = mapMetrics(entry);
  const t = TARGETS[entry.map.star];
  const inBand = (x, [lo, hi]) => x >= lo - 1e-9 && x <= hi + 1e-9;
  const fails = [];
  if (!waysVerdict(entry).pass) fails.push(`通關方式 ${m.ways}（對地主力 ${m.mains}）`);
  if (m.bestHp < BEST_HP) fails.push(`最佳生命 ${m.bestHp}`);
  if (m.limit < MIN_LIMIT) fails.push(`極限 ×${m.limit.toFixed(2)}`);
  if (!inBand(m.casual, t.casual)) fails.push(`一般 ${pct(m.casual)}`);
  if (!inBand(m.novice, t.novice)) fails.push(`新手 ${pct(m.novice)}`);
  return { m, fails, pass: !fails.length };
}

/** 慣用塔含該主力塔的一般玩家勝率（全部地圖）。 */
export function towerRates(all) {
  const runs = all.flatMap((e) => e.casual);
  return [...MAIN_GROUND, ...MAIN_AIR].map((id) => {
    const rs = runs.filter((r) => [...CASUAL_BY_ID[r.cfg].ground, ...CASUAL_BY_ID[r.cfg].air].includes(id));
    return { id, n: rs.length, rate: winRate(rs), hp: mean(rs.map((r) => r.baseHp)) };
  });
}

/** 全域判定：各星級平均一般勝率嚴格遞減；各主力塔的一般勝率與平均差距 ≤ TOWER_SPREAD。 */
export function globalVerdict(all) {
  const starCasual = [1, 2, 3, 4, 5].map((s) => mean(all.filter((e) => e.map.star === s).map((e) => winRate(e.casual))));
  const monotone = starCasual.every((v, i) => i === 0 || v < starCasual[i - 1]);
  const avg = winRate(all.flatMap((e) => e.casual));
  const towers = towerRates(all);
  const offTowers = towers.filter((t) => Math.abs(t.rate - avg) > TOWER_SPREAD);
  return { starCasual, monotone, avg, towers, offTowers };
}

/** 割草檢查（Gate B）：每個星級至少要有 1 張地圖不能以單一塔種（S1／S2）且不操作就無漏怪通關。 */
function cheeseVerdicts(all) {
  return [1, 2, 3, 4, 5].map((s) => {
    const maps = all.filter((x) => x.map.star === s);
    const flawless = maps.filter((x) => x.runs.some((r) => CONFIGS.find((c) => c.id === r.cfg).single && r.result === 'WIN' && r.leaks === 0));
    return { star: s, flawless, safe: maps.filter((x) => !flawless.includes(x)) };
  });
}

// ---------- 報告 ----------

function report(all) {
  const L = [];
  const p = (s = '') => L.push(s);
  const g = globalVerdict(all);
  const verdicts = all.map(mapVerdict);
  const cheese = cheeseVerdicts(all);
  p('# 平衡測試報告（Gate B）');
  p();
  p('> 由 `node tools/balance.mjs` 產生，**請勿手改**。模擬器與遊戲本體共用 `src/core/game.js`，結果可重現（亂數皆有固定種子）。');
  p();
  p('## 測試方法');
  p();
  p('- 機器人只在波次之間操作：場上敵人清空後（高手先出售、移動）建塔、按下開始下一波，並立即以發放的津貼再建塔；波次進行中不操作。');
  p('- 選塔：需要 T05 時先建 T05；其餘依空中／地面總 HP 比例，補足投資較少的一側。');
  p('- 回饋：上一波有隱形漏怪就把 T05 目標數加 1（最多 4 座，以 6.0 格偵測覆蓋地面路線選位）；有空中漏怪則對空投資比例提高 10%（最多 +40%）。');
  p('- 位置評分：射程內路線取樣點的邊際覆蓋（越近基地權重越高、已被覆蓋的點權重遞減）。');
  p('- 三種玩家模型：');
  p(`  - **高手**：事先知道下一波組成（熟悉地圖），下一波有隱形就先建 1 座 T05；位置取最高分；選定的塔找不到能覆蓋路線的空位時，改升級等級最低的塔（同塔種優先、其次升級費最低）。波次之間先出售剩餘波次用不到的塔（不再有空中敵人時的對空塔、不再有隱形時的 T05），再把邊際覆蓋低於同塔種最佳空位 ${pct(RELOCATE_RATIO)} 的塔移到該空位（由最低效者開始，每次最多 ${RELOCATE_MAX} 座）；S1／S2 為割草檢查的「不操作」基準，不出售也不移動。每圖執行通關方式矩陣 24 種、混合配置 ${EXPERT_MIX.length} 種（與一般玩家相同的慣用塔組合）與配置 C1–C3、S1、S2。`);
  p(`  - **一般（初見）**：不知道下一波，依已看過各波的空／地總 HP 累計比例分配投資，見過隱形後才先建 T05；慣用 2 種對地主力與 1 種對空主力循環建造；在前 ${SKILLS.casual.topK} 名位置中隨機選；會升級。每圖執行全部 ${CASUAL.length} 種慣用塔組合（${MAIN_GROUND.length} 選 2 × ${MAIN_AIR.length}）。`);
  p(`  - **新手**：不知道下一波，每座塔從可打該層級的塔中隨機選；在分數達最佳值 ${pct(SKILLS.novice.nearRatio)} 以上的位置中隨機放置；隱形漏怪後才建 T05；不升級。每圖 ${NOVICE_SEEDS} 個種子。`);
  p(`- 壓力測試：每張地圖取高手全部配置（矩陣、混合配置、C1–C3、S1、S2）中表現最好的 ${STRESS_TOP} 種，把所有敵人（含分裂子體）的 HP 與護盾乘上倍率，二分搜尋 ${STRESS_STEPS} 次找出仍能通關的最大倍率（「極限倍率」，上限 3.0）。`);
  p('- 高手配置：');
  for (const c of CONFIGS) p(`  - **${c.id} ${c.name}**：${c.single ? `只建 ${c.ground[0]}` : `對地循環 ${c.ground.join('→')}；對空循環 ${c.air.join('→')}`}`);
  p();
  p('## 平衡目標');
  p();
  p('**不會難到無法通關**（每張地圖）：');
  p();
  p(`- 高手通關方式（通關且基地生命 ≥${WAY_HP}）至少 ${MIN_WAYS} 種，其中對地主力至少 ${MIN_GROUND_MAINS} 種不同塔。`);
  p(`- 高手最佳配置（矩陣、混合配置、C1–C3、S1、S2）基地生命 ≥${BEST_HP}（80%）。`);
  p(`- 極限倍率 ≥×${MIN_LIMIT}：敵人 HP 再提高 ${Math.round((MIN_LIMIT - 1) * 100)}% 仍有方式能通關，玩家不必打出機器人的最佳解。`);
  p();
  p('**具有難度**（勝率區間依星級）：');
  p();
  p('| 星級 | 一般（初見）勝率 | 新手勝率 |');
  p('| --- | ---: | ---: |');
  for (let s = 1; s <= 5; s++) p(`| ${stars(s)} | ${band(TARGETS[s].casual)} | ${band(TARGETS[s].novice)} |`);
  p();
  p('- 各星級平均的一般勝率必須嚴格遞減。');
  p(`- 塔種平衡：慣用塔含某主力塔的一般玩家勝率，與全體平均相差不超過 ${pct(TOWER_SPREAD)}。`);
  p('- 割草檢查：每個星級至少要有 1 張地圖**不能**以單一塔種（S1／S2）且不操作就無漏怪通關。');
  p();
  p('## 判定總覽');
  p();
  const failed = all.filter((_, i) => !verdicts[i].pass);
  p(`- 地圖判定：**${all.length - failed.length}／${all.length}** 通過${failed.length ? `（未通過：${failed.map((e) => e.map.id).join('、')}）` : ''}。`);
  p(`- 各星級平均一般勝率：${g.starCasual.map((v, i) => `${stars(i + 1)} ${pct(v)}`).join('、')}；${g.monotone ? '嚴格遞減，通過' : '**未嚴格遞減**'}。`);
  p(`- 塔種平衡：全體一般勝率 ${pct(g.avg)}；${g.offTowers.length ? `**超出 ±${pct(TOWER_SPREAD)}：${g.offTowers.map((t) => `${t.id}（${pct(t.rate)}）`).join('、')}**` : `各主力塔都在 ±${pct(TOWER_SPREAD)} 內，通過`}。`);
  p(`- 割草檢查：${cheese.every((c) => c.safe.length) ? '5 個星級全部通過' : `**未通過：${cheese.filter((c) => !c.safe.length).map((c) => stars(c.star)).join('、')}**`}。`);
  p();
  p('## 難度曲線');
  p();
  p('| 地圖 | 星級 | 高手通關方式 | 高手最佳生命 | 極限倍率 | 一般勝率 | 一般平均生命 | 新手勝率 | 新手平均生命 | 判定 |');
  p('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  all.forEach((e, i) => {
    const { m, fails } = verdicts[i];
    p(`| ${e.map.id} ${e.map.name} | ${stars(e.map.star)} | ${m.ways}／${STRATEGIES.length} | ${m.bestHp} | ×${m.limit.toFixed(2)} | ${pct(m.casual)} | ${m.casualHp.toFixed(1)} | ${pct(m.novice)} | ${m.noviceHp.toFixed(1)} | ${fails.length ? `**未通過**：${fails.join('、')}` : '通過'} |`);
  });
  p();
  p('### 各星級平均');
  p();
  p('| 星級 | 高手通關方式 | 極限倍率（最低） | 一般勝率 | 新手勝率 |');
  p('| --- | ---: | ---: | ---: | ---: |');
  for (let s = 1; s <= 5; s++) {
    const ms = all.filter((e) => e.map.star === s).map(mapMetrics);
    p(`| ${stars(s)} | ${mean(ms.map((m) => m.ways)).toFixed(1)} | ×${mean(ms.map((m) => m.limit)).toFixed(2)}（×${Math.min(...ms.map((m) => m.limit)).toFixed(2)}） | ${pct(mean(ms.map((m) => m.casual)))} | ${pct(mean(ms.map((m) => m.novice)))} |`);
  }
  p();
  p('### 塔種平衡（一般玩家）');
  p();
  p('| 塔 | 局數 | 勝率 | 平均生命 | 與平均差距（百分點） |');
  p('| --- | ---: | ---: | ---: | ---: |');
  for (const t of g.towers) {
    const d = Math.round((t.rate - g.avg) * 100);
    p(`| ${t.id} ${TOWER_BY_ID[t.id].name} | ${t.n} | ${pct(t.rate)} | ${t.hp.toFixed(1)} | ${d > 0 ? '+' : ''}${d} |`);
  }
  p();
  p('### 漏怪來源（一般玩家）');
  p();
  p('各星級所有一般玩家局的漏怪總數，依敵人與波次統計。');
  p();
  const enemyIds = Object.keys(ENEMY_BY_ID);
  p(`| 星級 | ${enemyIds.join(' | ')} |`);
  p(`| --- | ${enemyIds.map(() => '---:').join(' | ')} |`);
  for (let s = 1; s <= 5; s++) {
    const rs = all.filter((e) => e.map.star === s).flatMap((e) => e.casual);
    p(`| ${stars(s)} | ${enemyIds.map((id) => rs.reduce((a, r) => a + (r.leakBy[id] ?? 0), 0)).join(' | ')} |`);
  }
  p();
  const waves = Array.from({ length: 20 }, (_, i) => i + 1);
  p(`| 星級 | ${waves.map((w) => `W${w}`).join(' | ')} |`);
  p(`| --- | ${waves.map(() => '---:').join(' | ')} |`);
  for (let s = 1; s <= 5; s++) {
    const rs = all.filter((e) => e.map.star === s).flatMap((e) => e.casual);
    p(`| ${stars(s)} | ${waves.map((w) => rs.reduce((a, r) => a + (r.rows.find((x) => x.wave === w)?.leaks ?? 0), 0)).join(' | ')} |`);
  }
  p();
  p('## 總表（高手配置）');
  p();
  p(`| 地圖 | 星級 | ${CONFIGS.map((c) => c.id).join(' | ')} |`);
  p(`| --- | --- | ${CONFIGS.map(() => '---').join(' | ')} |`);
  for (const { map, runs } of all) {
    p(`| ${map.id} ${map.name} | ${stars(map.star)} | ${runs.map((r) => (r.result === 'WIN' ? `勝 ♥${r.baseHp}` : `敗 W${r.wave}`)).join(' | ')} |`);
  }
  p();
  p('格式：「勝 ♥剩餘生命」或「敗 W 結束波次」。');
  p();
  p('## 割草風險檢查');
  p();
  p('| 星級 | 單塔種無漏怪通關的地圖 | 不可被單塔種無漏怪通關的地圖 | 判定 |');
  p('| --- | --- | --- | --- |');
  for (const c of cheese) {
    p(`| ${stars(c.star)} | ${c.flawless.map((x) => x.map.id).join('、') || '—'} | ${c.safe.map((x) => x.map.id).join('、') || '—'} | ${c.safe.length ? '通過' : '**未通過**'} |`);
  }
  p();
  p('## 通關方式矩陣');
  p();
  p(`每種方式以一個高手配置執行（對地只建該主力、對空只建該主力；隱形將出現時仍補 T05）。「通關方式」＝通關且基地剩餘生命 ≥${WAY_HP}。`);
  p();
  p(`| 地圖 | 星級 | ${STRATEGIES.map((s) => s.id).join(' | ')} | 通關方式 |`);
  p(`| --- | --- | ${STRATEGIES.map(() => '---:').join(' | ')} | ---: |`);
  for (const entry of all) {
    const v = waysVerdict(entry);
    const cell = (r) => (r.result === 'WIN' ? (isWay(r) ? `**${r.baseHp}**` : String(r.baseHp)) : `敗 W${r.wave}`);
    p(`| ${entry.map.id} | ${stars(entry.map.star)} | ${entry.ways.map(cell).join(' | ')} | ${v.ok.length}／${STRATEGIES.length} |`);
  }
  p();
  p(`格式：數字為勝利時的基地剩餘生命，粗體表示達 ${WAY_HP}；「敗 W」為失敗波次。`);
  p();
  p('### 各塔可行度');
  p();
  p('| 塔 | 作為主力或控制塔出現在「通關方式」中的地圖數 | 次數 |');
  p('| --- | ---: | ---: |');
  const towerIds = [...MAIN_GROUND, 'T05', 'T11', ...MAIN_AIR].sort();
  for (const id of towerIds) {
    const uses = all.map((e) => e.ways.filter((r) => isWay(r) && r.cfg.split(/[+/]/).includes(id)).length);
    p(`| ${id} ${TOWER_BY_ID[id].name} | ${uses.filter(Boolean).length}／${all.length} | ${uses.reduce((a, b) => a + b, 0)} |`);
  }
  p();
  p('## 逐圖逐配置紀錄（高手配置）');
  p();
  for (const { map, runs } of all) {
    p(`### ${map.id} ${map.name}（${stars(map.star)}）`);
    p();
    for (const r of runs) {
      const c = CONFIGS.find((x) => x.id === r.cfg);
      p(`**${c.id} ${c.name}**：${r.result === 'WIN' ? '勝利' : '失敗'}，結束波次 ${r.wave}，基地剩餘 ${r.baseHp}，漏怪 ${r.leaks}，擊敗 ${r.kills}，場上塔 ${r.towers}，升級 ${r.upgrades}，移動 ${r.relocations}，出售 ${r.sold}；波 10：${r.status10 === 'ALIVE' ? '存活' : '失敗'}，波 20：${r.status20 === 'WIN' ? '通關' : '未通關'}`);
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
  return { md: L.join('\n'), verdicts, g, cheese };
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  const all = await runAll();
  if (process.argv.includes('--json')) {
    const strip = ({ rows, ...r }) => r;
    console.log(JSON.stringify(all.map((e) => ({
      id: e.map.id, star: e.map.star, verdict: mapVerdict(e), stress: e.stress,
      runs: e.runs.map(strip), ways: e.ways.map(strip), casual: e.casual.map(strip), novice: e.novice.map(strip),
    }))));
  } else {
    const { md, verdicts, g, cheese } = report(all);
    writeFileSync(new URL('../docs/平衡測試報告.md', import.meta.url), `${md}\n`);
    all.forEach((e, i) => {
      const { m, fails } = verdicts[i];
      console.log(`${e.map.id} ${stars(e.map.star).padEnd(5)} 高手 ${String(m.ways).padStart(2)}/${STRATEGIES.length}（主力 ${m.mains}）♥${m.bestHp} 極限×${m.limit.toFixed(2)}｜一般 ${pct(m.casual).padStart(4)} ♥${m.casualHp.toFixed(1)}｜新手 ${pct(m.novice).padStart(4)} ♥${m.noviceHp.toFixed(1)}｜${fails.length ? `未通過：${fails.join('、')}` : '通過'}`);
    });
    console.log(`星級平均一般勝率：${g.starCasual.map((v, i) => `${i + 1}★${pct(v)}`).join(' ')}（${g.monotone ? '遞減' : '未遞減'}）`);
    console.log(`塔種一般勝率（平均 ${pct(g.avg)}）：${g.towers.map((t) => `${t.id} ${pct(t.rate)}`).join('、')}${g.offTowers.length ? `；超出 ±${pct(TOWER_SPREAD)}：${g.offTowers.map((t) => t.id).join('、')}` : ''}`);
    console.log(`割草檢查：${cheese.map((c) => `${c.star}★${c.safe.length ? '通過' : '未通過'}`).join(' ')}；地圖判定 ${verdicts.filter((v) => v.pass).length}/20；耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  }
}
