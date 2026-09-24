import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, SimClock, TICKS_PER_SEC, PROJECTILE, getMap } from '../src/core/game.js';
import { MAPS } from '../src/data/maps.js';
import { TOWER_BY_ID, TOWER_LEVELS } from '../src/data/towers.js';
import { canPlaceTower } from '../src/core/mapgeom.js';
import { START_CR, WAVE_STIPEND_CR, waveSize, scaledHp } from '../src/data/difficulty.js';
import { WAVES } from '../src/data/waves.js';
import { ENEMY_BY_ID } from '../src/data/enemies.js';
import { SPAWN_INTERVAL } from '../src/core/waves.js';

/** 找一個塔中心到 (x, y) 距離在 [minR, maxR] 內的合法 2×2 位置，偏好最近者。 */
function spotNear(game, x, y, maxR, minR = 0) {
  let best = null;
  for (let ty = 0; ty < 15; ty++) {
    for (let tx = 0; tx < 27; tx++) {
      if (!canPlaceTower(game.map, tx, ty, game.occupied)) continue;
      const d = Math.hypot(tx + 1 - x, ty + 1 - y);
      if (d <= maxR && d >= minR && (!best || d < best.d)) best = { tx, ty, d };
    }
  }
  assert.ok(best, `找不到 (${x},${y}) 附近 ${maxR} 格內的建塔位置`);
  return best;
}

/** 在地面路線 G1 指定距離生成靜止敵人 */
function frozen(game, enemyId, dist, route) {
  const r = route ?? game.map.routes.find((x) => x.layer === ENEMY_BY_ID[enemyId].layer).id;
  const e = game.spawn(enemyId, r, dist, 1, false);
  e.baseSpeed = 0;
  return e;
}

function rich(mapId = 'M01') {
  const g = new Game(mapId);
  g.cr = 100000;
  return g;
}

function buildNear(g, towerId, e, maxR = TOWER_BY_ID[towerId].range - 0.2, minR = 0) {
  const s = spotNear(g, e.x, e.y, maxR, minR);
  const r = g.build(towerId, s.tx, s.ty);
  assert.ok(r.ok, r.reason);
  return r.tower;
}

test('對地塔不攻擊空中敵人、對空塔不攻擊地面敵人、空地共用塔兩者皆可（R2、R3、R8）', () => {
  // M05 地空並行，共用段上同位置放置地面與空中敵人
  const g = rich('M05');
  const seg = g.map.sharedSegments[0];
  const ground = g.paths[g.map.routes.find((r) => r.layer === 'ground').id];
  const air = g.paths[g.map.routes.find((r) => r.layer === 'air').id];
  const cx = seg.a[0] + 0.5;
  const cy = seg.a[1] + 0.5;
  const dAt = (p) => p.cum[p.pts.findIndex(([x, y]) => x === cx && y === cy)];
  const eg = frozen(g, 'E01', dAt(ground), ground.id);
  const ea = frozen(g, 'E07', dAt(air), air.id);
  assert.equal(eg.x, ea.x);
  assert.equal(eg.y, ea.y);
  const t1 = buildNear(g, 'T01', eg);
  const t7 = buildNear(g, 'T07', eg);
  const t10 = buildNear(g, 'T10', eg);
  g.step(1);
  assert.equal(t1.target, eg);
  assert.equal(t7.target, ea);
  assert.deepEqual(new Set(t10.drones.map((d) => d.target)), new Set([eg, ea]));
});

test('一般傷害先扣護盾、溢出扣 HP；T01 無視護盾直扣 HP 且不改變護盾（R7）', () => {
  const g = rich();
  const e = frozen(g, 'E04', 20);
  e.shield = 30;
  g.damage(e, 42, false, null);
  assert.equal(e.shield, 0);
  assert.equal(e.hp, e.maxHp - 12);
  assert.ok(g.drainEvents().some((ev) => ev.type === 'shieldBreak'));

  const e2 = frozen(g, 'E04', 22);
  buildNear(g, 'T01', e2);
  // 直到命中一次
  for (let i = 0; i < 60 && e2.hp === e2.maxHp; i++) g.step(1);
  assert.equal(e2.hp, e2.maxHp - TOWER_BY_ID.T01.damage);
  assert.equal(e2.shield, e2.maxShield);
});

test('鏈式攻擊每跳 ×0.7，最多 2 跳，跳距內才連鎖（T06）', () => {
  const g = rich();
  const a = frozen(g, 'E03', 20);
  const b = frozen(g, 'E03', 21.5);
  const c = frozen(g, 'E03', 23);
  const far = frozen(g, 'E03', 30);
  const t = buildNear(g, 'T06', c, 3.5);
  g.fire(t, c);
  const d = TOWER_BY_ID.T06.damage;
  assert.equal(c.maxHp - c.hp, d);
  assert.ok(Math.abs(b.maxHp - b.hp - d * 0.7) < 1e-9);
  assert.ok(Math.abs(a.maxHp - a.hp - d * 0.49) < 1e-9);
  assert.equal(far.hp, far.maxHp);
});

test('直線穿透最多命中 3 名，未顯形隱形敵人不被直線命中（T02、Q3、R10）', () => {
  const g = rich();
  // M01 G1 第一段為 y=3 的水平直道；塔中心置於直道起點以測試純幾何
  const es = [2, 3, 4, 5].map((d) => frozen(g, 'E03', d));
  const ghost = frozen(g, 'E06', 3.5);
  const t = { def: TOWER_BY_ID.T02, cx: 0.5, cy: 3.5 };
  const hits = g.pierceHits(t, es[0]);
  assert.deepEqual(hits, es.slice(0, 3));
  assert.ok(!hits.includes(ghost));
});

test('範圍攻擊傷害未顯形隱形敵人但不使其顯形；只有 T05 6.0 格偵測顯形，離開 2 秒後重新隱形（R4、R10）', () => {
  const g = rich();
  const ghost = frozen(g, 'E06', 20);
  const t3 = buildNear(g, 'T03', ghost, 3.5);
  g.step(60);
  assert.equal(t3.target, null, '未顯形不可被鎖定');
  assert.equal(g.projectiles.length, 0);
  // 以可見敵人為爆心，隱形敵人在爆炸半徑內
  const decoy = frozen(g, 'E03', 20.5);
  g.step(1);
  assert.equal(t3.target, decoy);
  g.step(40);
  assert.ok(ghost.hp < ghost.maxHp, '範圍傷害命中隱形敵人');
  assert.equal(ghost.revealed, false);

  // T05：偵測 6.0 格
  const g2 = rich();
  const e = frozen(g2, 'E06', 20);
  const t5 = buildNear(g2, 'T05', e, 6.0, 4.0);
  g2.step(1);
  assert.equal(e.revealed, true, '6.0 格內顯形');
  assert.equal(t5.target, null, '偵測範圍外不攻擊（攻擊射程 3.0）');
  // 讓敵人向前移出偵測範圍
  e.baseSpeed = 5;
  let leftAt = null;
  for (let i = 0; i < 600; i++) {
    g2.step(1);
    const inside = Math.hypot(e.x - t5.cx, e.y - t5.cy) <= 6 + 1e-9;
    if (!inside && leftAt === null) {
      leftAt = g2.tick;
      e.baseSpeed = 0;
    }
    if (leftAt !== null && !e.revealed) break;
  }
  assert.ok(leftAt !== null);
  assert.equal(g2.tick - leftAt, 2 * TICKS_PER_SEC - 1, '離開後 2 秒重新隱形');
});

test('T05 對地減速 25%、T11 空地減速 30%；減速不疊加取最強（Q5）', () => {
  const g = rich('M05');
  const e = frozen(g, 'E01', 20);
  e.baseSpeed = 1;
  buildNear(g, 'T05', e, 2.5);
  g.step(1);
  assert.equal(g.slowFactor(e), 0.25);
  buildNear(g, 'T11', e, 2.8);
  g.step(1);
  assert.equal(g.slowFactor(e), 0.3);
  assert.equal(e.slows.size, 2);
});

test('T04 連續命中每秒 +10%，上限 +50%，切換目標歸零', () => {
  const g = rich();
  const e = frozen(g, 'E12', 20);
  e.hp = e.maxHp = 1e9;
  const t = buildNear(g, 'T04', e, 4);
  const shots = [];
  for (let i = 0; i < 8 * TICKS_PER_SEC; i++) {
    g.step(1);
    for (const ev of g.drainEvents()) if (ev.type === 'shot') shots.push(ev.mult);
  }
  assert.deepEqual(shots.slice(0, 16).map((m) => Math.round(m * 10) / 10), [1, 1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5]);
  const closer = frozen(g, 'E01', 21);
  closer.hp = closer.maxHp = 1e9;
  for (let i = 0; i < TICKS_PER_SEC; i++) g.step(1);
  assert.equal(t.target, closer);
  assert.ok(t.beamTicks < TICKS_PER_SEC);
});

test('E10 死亡生成 2 隻 E01 子體：計入擊敗、不給獎勵（Q10）', () => {
  const g = rich();
  const e = frozen(g, 'E10', 20);
  const cr = g.cr;
  g.damage(e, 1e6, false, null);
  assert.equal(g.cr, cr + 11);
  const kids = g.enemies.filter((x) => x.isChild);
  assert.equal(kids.length, 2);
  assert.ok(kids.every((k) => k.id === 'E01' && k.dist === 20 && k.maxHp === scaledHp(ENEMY_BY_ID.E01.hp, 1, 1, g.def.hpTune)));
  for (const k of kids) g.damage(k, 1e6, false, null);
  assert.equal(g.cr, cr + 11);
  assert.equal(g.stats.kills, 3);
});

test('經濟：初始資源、資源不足拒絕、第 2 波起發放津貼、主體生成完畢才可開下一波（R5、R6）', () => {
  const g = new Game('M01');
  assert.equal(g.cr, START_CR);
  const s = spotNear(g, 5, 5, 20);
  assert.ok(g.build('T12', s.tx, s.ty).ok);
  const left = START_CR - TOWER_BY_ID.T12.cost;
  assert.ok(left < TOWER_BY_ID.T12.cost);
  const s2 = spotNear(g, 20, 10, 20);
  assert.equal(g.build('T12', s2.tx, s2.ty).reason, 'funds');
  assert.equal(g.cr, left);
  assert.ok(g.startWave());
  assert.equal(g.cr, left, '第 1 波無津貼');
  assert.equal(g.canStartWave(), false);
  g.step((waveSize(1) - 1) * SPAWN_INTERVAL * TICKS_PER_SEC);
  assert.equal(g.canStartWave(), true);
  const before = g.cr;
  assert.ok(g.startWave());
  assert.equal(g.cr, before + WAVE_STIPEND_CR);
  assert.equal(g.build('T01', 24, 12).reason, 'blocked', '基地格不可建');
});

test('升級：Lv1→Lv3 扣升級費、傷害與射程提升並實際生效；資源不足或滿級拒絕且不扣款', () => {
  const g = new Game('M01');
  const e = frozen(g, 'E03', 20);
  const [lv1, lv2, lv3] = TOWER_LEVELS.T01;
  // 塔中心與敵人距離介於 Lv1 與 Lv3 射程之間：Lv1 打不到，Lv3 打得到
  const s = spotNear(g, e.x, e.y, lv3.range - 0.05, lv1.range + 0.05);
  const t = g.build('T01', s.tx, s.ty).tower;
  g.step(1);
  assert.equal(t.target, null);
  g.cr = lv1.upgradeCost - 1;
  assert.equal(g.upgrade(t).reason, 'funds');
  assert.equal(t.level, 1);
  assert.equal(g.cr, lv1.upgradeCost - 1);
  g.cr = 1000;
  assert.ok(g.upgrade(t).ok);
  assert.ok(g.upgrade(t).ok);
  const left = 1000 - lv1.upgradeCost - lv2.upgradeCost;
  assert.equal(g.cr, left);
  assert.equal(t.invested, lv1.cost + lv1.upgradeCost + lv2.upgradeCost);
  assert.equal(g.upgrade(t).reason, 'max');
  assert.equal(g.cr, left);
  const hp = e.hp;
  g.step(1);
  assert.equal(t.target, e);
  g.step(30); // 子彈 12 格／秒在 30 tick 內命中；下一發在 36 tick 後
  assert.equal(hp - e.hp, lv3.damage);
  assert.ok(lv3.damage > lv1.damage);
});

test('T03 預判落點：命中移動中的極速敵人（E11 在 0.6 秒飛行時間內移動超過爆炸半徑）', () => {
  const g = rich();
  const route = g.map.routes.find((r) => r.layer === 'ground').id;
  const e = g.spawn('E11', route, 8, 1, false);
  const t = buildNear(g, 'T03', e, 3.0);
  e.dist = 2;
  g.place(e);
  assert.ok(e.baseSpeed * PROJECTILE.T03.flightTicks / TICKS_PER_SEC > TOWER_BY_ID.T03.splash, '前提：飛行期間移動距離大於爆炸半徑');
  const hp = e.hp;
  while (!g.projectiles.length) g.step(1);
  assert.equal(g.projectiles[0].tower, t);
  g.step(PROJECTILE.T03.flightTicks);
  assert.ok(e.hp < hp, '落點應命中目標');
});

test('倍速：2×／4× 每畫面推進 2／4 倍 tick，暫停不推進，恢復維持原倍率（R11）', () => {
  const c = new SimClock();
  const run = (frames) => {
    let n = 0;
    for (let i = 0; i < frames; i++) n += c.advance(1 / 60);
    return n;
  };
  assert.equal(run(600), 600);
  c.setSpeed(2);
  assert.equal(run(600), 1200);
  c.setSpeed(4);
  assert.equal(run(600), 2400);
  c.togglePause();
  assert.equal(run(600), 0);
  c.togglePause();
  assert.equal(c.speed, 4);
  assert.equal(run(60), 240);
  assert.throws(() => c.setSpeed(3));
});

/** 固定配置：每波開始前在可負擔時依序建塔，並在允許時立刻開下一波。 */
function autoplay(mapId, order, clockSpeed = 1) {
  const g = new Game(mapId);
  const clock = new SimClock();
  clock.setSpeed(clockSpeed);
  let k = 0;
  const spots = [];
  for (let y = 0; y < 15; y++) for (let x = 0; x < 27; x++) if (canPlaceTower(g.map, x, y)) spots.push([x, y]);
  let spawned = 0;
  // 玩家在相同的模擬時刻做相同操作：逐 tick 決策，倍速只決定每畫面消化幾個 tick。
  while (!g.result) {
    const ticks = clock.advance(1 / 60);
    for (let t = 0; t < ticks && !g.result; t++) {
      while (order.length && g.cr >= TOWER_BY_ID[order[k % order.length]].cost) {
        const spot = spots.find(([x, y]) => g.canPlace('T01', x, y));
        if (!spot) break;
        g.build(order[k++ % order.length], spot[0], spot[1]);
      }
      if (g.canStartWave()) g.startWave();
      g.step(1);
      spawned += g.drainEvents().filter((e) => e.type === 'spawn' && !e.enemy.isChild).length;
    }
    assert.ok(g.tick < 3600 * TICKS_PER_SEC, `${mapId} 未在時限內結束`);
  }
  return { g, spawned };
}

test('不建塔時每張地圖都在波次中失敗，結束波次與漏怪統計正確（M5、R9、R12）', () => {
  for (const m of MAPS) {
    const { g } = autoplay(m.id, []);
    assert.equal(g.result, 'LOSE', m.id);
    assert.equal(g.baseHp, 0);
    assert.equal(g.snapshot.leaks, 20);
    assert.equal(g.snapshot.wave, g.wave);
    assert.ok(Object.isFrozen(g.snapshot));
  }
});

test('同一配置 1×／2×／4× 結果完全相同，且主體總數等於 ΣN(n)（Gate B 倍速一致）', () => {
  const order = ['T01', 'T07', 'T03', 'T05', 'T06', 'T10', 'T12', 'T04', 'T09'];
  const runs = [1, 2, 4].map((s) => autoplay('M01', order, s));
  const key = ({ g }) => JSON.stringify({ ...g.snapshot, tick: g.tick, cr: g.cr, log: g.waveLog });
  assert.equal(key(runs[0]), key(runs[1]));
  assert.equal(key(runs[0]), key(runs[2]));
  const { g, spawned } = runs[0];
  const total = (w) => WAVES.M01.slice(0, w).reduce((s, x) => s + x.reduce((a, [, c]) => a + c, 0), 0);
  if (g.result === 'WIN') assert.equal(spawned, total(20));
  else assert.ok(spawned > total(g.wave - 1) && spawned <= total(g.wave));
});

test('勝利判定：第 20 波全部生成且場上清空、基地存活才勝利', () => {
  const g = new Game('M01');
  g.wave = 20;
  g.pending = [{ enemy: 'E01', route: 'G1', at: g.tick + 5 }];
  g.step(1);
  assert.equal(g.result, null);
  g.step(10);
  assert.equal(g.enemies.length, 1);
  g.damage(g.enemies[0], 1e6, false, null);
  g.step(1);
  assert.equal(g.result, 'WIN');
  assert.equal(g.snapshot.wave, 20);
  const snap = g.snapshot;
  g.startWave();
  assert.equal(g.snapshot, snap);
});

test('每張地圖的所有路線都可從入口走到基地', () => {
  for (const m of MAPS) {
    const map = getMap(m.id);
    for (const r of map.routes) {
      const [x, y] = r.cells[r.cells.length - 1];
      assert.ok(map.baseCells.has(y * 28 + x), `${m.id} ${r.id}`);
    }
  }
});
