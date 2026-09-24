// 核心模擬：決定性固定步長（1/60 秒），不依賴 DOM，瀏覽器與 Node 共用。
// 所有計時以整數 tick 計算；倍速只改變每個畫面推進的 tick 數（R11）。
import { MAP_BY_ID } from '../data/maps.js';
import { TOWER_BY_ID, TOWER_LEVELS, TOWER_SIZE, relocateCost, sellRefund } from '../data/towers.js';
import { ENEMY_BY_ID } from '../data/enemies.js';
import { BASE_HP, START_CR, WAVE_STIPEND_CR, WAVES_PER_MAP, scaledHp, scaledSpeed } from '../data/difficulty.js';
import { buildMap, canPlaceTower, cellKey } from './mapgeom.js';
import { buildSpawnSchedule } from './waves.js';

export const TICKS_PER_SEC = 60;
export const DT = 1 / TICKS_PER_SEC;
const EPS = 1e-9;
/** 規格未定義、由 Q7 定稿的投射物參數 */
export const PROJECTILE = { T01: { speed: 12 }, T07: { speed: 8 }, T03: { flightTicks: 36 } };
/** Q3：直線穿透的命中寬度（敵人中心至直線距離，格） */
export const PIERCE_HALF_WIDTH = 0.5;
/** R10：離開全部偵測範圍後重新隱形的延遲 */
export const RESTEALTH_TICKS = 2 * TICKS_PER_SEC;
const sec = (s) => Math.round(s * TICKS_PER_SEC);

const mapCache = new Map();
export function getMap(mapId) {
  if (!mapCache.has(mapId)) mapCache.set(mapId, buildMap(MAP_BY_ID[mapId]));
  return mapCache.get(mapId);
}

/** 路線折線（格中心座標）與累積長度 */
function routePath(route) {
  const pts = route.cells.map(([x, y]) => [x + 0.5, y + 0.5]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { id: route.id, layer: route.layer, pts, cum, length: cum[cum.length - 1] };
}

function pointAt(path, d) {
  const { pts, cum } = path;
  if (d <= 0) return [pts[0][0], pts[0][1], pts.length > 1 ? Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) : 0];
  let lo = 0;
  let hi = cum.length - 1;
  if (d >= cum[hi]) {
    const a = pts[hi - 1];
    const b = pts[hi];
    return [b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo];
  const b = pts[hi];
  const t = (d - cum[lo]) / (cum[hi] - cum[lo]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
}

const canHit = (towerDef, enemy) => towerDef.target === 'both' || towerDef.target === enemy.layer;
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const within = (ax, ay, bx, by, r) => dist2(ax, ay, bx, by) <= r * r + EPS;

export class Game {
  constructor(mapId) {
    this.mapId = mapId;
    this.def = MAP_BY_ID[mapId];
    if (!this.def) throw new Error(`未知地圖 ${mapId}`);
    this.star = this.def.star;
    this.map = getMap(mapId);
    this.paths = Object.fromEntries(this.map.routes.map((r) => [r.id, routePath(r)]));
    this.tick = 0;
    this.cr = START_CR;
    this.baseHp = BASE_HP;
    this.wave = 0;
    this.pending = []; // 本波尚未生成：{ enemy, route, at }
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.occupied = new Set();
    this.events = [];
    this.result = null; // 'WIN' | 'LOSE'
    this.snapshot = null;
    this.uid = 0;
    this.stats = { kills: 0, leaks: 0, towersBuilt: 0, towerTypes: new Set(), spent: 0, earned: 0, stipend: 0, relocations: 0, sold: 0, refunded: 0 };
    this.waveLog = []; // 每波：{ wave, leaks, kills, earned, stipend, spent, refunded }
  }

  // ---------- 玩家操作 ----------

  canPlace(towerId, x, y) {
    const t = TOWER_BY_ID[towerId];
    return !!t && !this.result && canPlaceTower(this.map, x, y, this.occupied);
  }

  /** 放置塔；回傳 { ok, reason }。資源不足或位置不合法時拒絕（R1、R6）。 */
  build(towerId, x, y) {
    const t = TOWER_BY_ID[towerId];
    if (!t) return { ok: false, reason: 'unknown' };
    if (this.result) return { ok: false, reason: 'ended' };
    if (!canPlaceTower(this.map, x, y, this.occupied)) return { ok: false, reason: 'blocked' };
    if (this.cr < t.cost) return { ok: false, reason: 'funds' };
    this.cr -= t.cost;
    this.occupy(x, y, true);
    const tower = {
      uid: ++this.uid, id: towerId, def: TOWER_LEVELS[towerId][0], level: 1, invested: t.cost, x, y, cx: x + TOWER_SIZE / 2, cy: y + TOWER_SIZE / 2,
      cooldown: 0, target: null, angle: -Math.PI / 2, beamTicks: 0, firedAt: -1,
      drones: t.drones ? Array.from({ length: t.drones }, () => ({ cooldown: 0, target: null })) : null,
    };
    this.towers.push(tower);
    this.stats.towersBuilt++;
    this.stats.towerTypes.add(towerId);
    this.stats.spent += t.cost;
    this.curLog().spent += t.cost;
    this.events.push({ type: 'build', tower });
    return { ok: true, tower };
  }

  /** 升級已建造的塔；回傳 { ok, reason }。滿級或資源不足時拒絕（不得產生負資源）。 */
  upgrade(tower) {
    if (this.result) return { ok: false, reason: 'ended' };
    if (!this.towers.includes(tower)) return { ok: false, reason: 'unknown' };
    const cost = tower.def.upgradeCost;
    if (cost == null) return { ok: false, reason: 'max' };
    if (this.cr < cost) return { ok: false, reason: 'funds' };
    this.cr -= cost;
    tower.level++;
    tower.def = TOWER_LEVELS[tower.id][tower.level - 1];
    tower.invested += cost;
    this.stats.spent += cost;
    this.curLog().spent += cost;
    this.events.push({ type: 'upgrade', tower });
    return { ok: true, tower };
  }

  /** 出售退款：依該塔累計投資計算。 */
  sellRefund(tower) {
    return sellRefund(tower.invested);
  }

  /** 出售已建造的塔：立即退款並釋放佔地；已發射的投射物照常結算。 */
  sell(tower) {
    if (this.result) return { ok: false, reason: 'ended' };
    const i = this.towers.indexOf(tower);
    if (i < 0) return { ok: false, reason: 'unknown' };
    const refund = this.sellRefund(tower);
    this.towers.splice(i, 1);
    this.occupy(tower.x, tower.y, false);
    this.cr += refund;
    this.stats.sold++;
    this.stats.refunded += refund;
    this.curLog().refunded += refund;
    this.events.push({ type: 'sell', tower, refund });
    return { ok: true, tower, refund };
  }

  /** 移動費：依該塔累計投資計算。 */
  relocateCost(tower) {
    return relocateCost(tower.invested);
  }

  /** 塔可否移到左上角 (x, y)：新位置可與自己原佔地重疊，但不能是原位。 */
  canRelocate(tower, x, y) {
    if (this.result || !this.towers.includes(tower) || (tower.x === x && tower.y === y)) return false;
    this.occupy(tower.x, tower.y, false);
    const ok = canPlaceTower(this.map, x, y, this.occupied);
    this.occupy(tower.x, tower.y, true);
    return ok;
  }

  /** 移動已建造的塔；回傳 { ok, reason }。保留等級、冷卻與鎖定狀態（不停機）；位置不合法或資源不足時拒絕且不扣款。 */
  relocate(tower, x, y) {
    if (this.result) return { ok: false, reason: 'ended' };
    if (!this.towers.includes(tower)) return { ok: false, reason: 'unknown' };
    if (!this.canRelocate(tower, x, y)) return { ok: false, reason: 'blocked' };
    const cost = this.relocateCost(tower);
    if (this.cr < cost) return { ok: false, reason: 'funds' };
    this.cr -= cost;
    const from = { x: tower.x, y: tower.y };
    this.occupy(tower.x, tower.y, false);
    this.occupy(x, y, true);
    Object.assign(tower, { x, y, cx: x + TOWER_SIZE / 2, cy: y + TOWER_SIZE / 2 });
    this.stats.relocations++;
    this.stats.spent += cost;
    this.curLog().spent += cost;
    this.events.push({ type: 'relocate', tower, from, cost });
    return { ok: true, tower, cost };
  }

  occupy(x, y, on) {
    for (let oy = 0; oy < TOWER_SIZE; oy++) {
      for (let ox = 0; ox < TOWER_SIZE; ox++) {
        if (on) this.occupied.add(cellKey(x + ox, y + oy));
        else this.occupied.delete(cellKey(x + ox, y + oy));
      }
    }
  }

  get spawnsDone() {
    return this.pending.length === 0;
  }

  /** R5／Q11：第 1 波隨時可開；之後需本波主體全部生成完畢。 */
  canStartWave() {
    return !this.result && this.wave < WAVES_PER_MAP && this.spawnsDone;
  }

  startWave() {
    if (!this.canStartWave()) return false;
    this.wave++;
    if (this.wave >= 2) {
      this.cr += WAVE_STIPEND_CR;
      this.stats.stipend += WAVE_STIPEND_CR;
    }
    this.waveLog.push({ wave: this.wave, leaks: 0, kills: 0, earned: 0, stipend: this.wave >= 2 ? WAVE_STIPEND_CR : 0, spent: 0, refunded: 0 });
    this.pending = buildSpawnSchedule(this.map, this.mapId, this.wave).map((s) => ({ ...s, at: this.tick + sec(s.time) }));
    this.events.push({ type: 'waveStart', wave: this.wave });
    this.spawnDue();
    return true;
  }

  curLog() {
    return this.waveLog[this.waveLog.length - 1] ?? (this.preLog ??= { wave: 0, leaks: 0, kills: 0, earned: 0, stipend: 0, spent: 0, refunded: 0 });
  }

  // ---------- 模擬 ----------

  /** 推進 n 個固定步長。 */
  step(n = 1) {
    for (let i = 0; i < n && !this.result; i++) this.stepOnce();
  }

  stepOnce() {
    this.tick++;
    this.spawnDue();
    this.moveEnemies();
    if (this.result) return;
    this.updateStealth();
    for (const t of this.towers) this.updateTower(t);
    this.updateProjectiles();
    this.enemies = this.enemies.filter((e) => e.alive);
    this.checkVictory();
  }

  spawnDue() {
    while (this.pending.length && this.pending[0].at <= this.tick) {
      const s = this.pending.shift();
      this.spawn(s.enemy, s.route, 0, this.wave, false);
    }
  }

  spawn(enemyId, routeId, distance, wave, isChild) {
    const def = ENEMY_BY_ID[enemyId];
    const path = this.paths[routeId];
    const hp = scaledHp(def.hp, this.star, wave, this.def.hpTune);
    const shield = scaledHp(def.shield, this.star, wave, this.def.hpTune);
    const stealth = def.category === 'stealth';
    const e = {
      uid: ++this.uid, id: enemyId, def, layer: def.layer, wave, isChild,
      hp, maxHp: hp, shield, maxShield: shield, baseSpeed: scaledSpeed(def.speed, this.star),
      path, dist: distance, x: 0, y: 0, heading: 0, alive: true,
      stealth, revealed: !stealth, hideTicks: 0, slows: new Map(),
    };
    this.place(e);
    this.enemies.push(e);
    this.events.push({ type: 'spawn', enemy: e });
    return e;
  }

  place(e) {
    const [x, y, h] = pointAt(e.path, e.dist);
    e.x = x;
    e.y = y;
    e.heading = h;
  }

  slowFactor(e) {
    let s = 0;
    for (const v of e.slows.values()) if (v.factor > s) s = v.factor;
    return s;
  }

  moveEnemies() {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const speed = e.baseSpeed * (1 - this.slowFactor(e));
      e.dist += speed * DT;
      for (const [src, v] of e.slows) if (--v.ticks <= 0) e.slows.delete(src);
      if (e.dist >= e.path.length) {
        e.alive = false;
        e.dist = e.path.length;
        this.place(e);
        this.baseHp = Math.max(0, this.baseHp - 1);
        this.stats.leaks++;
        this.curLog().leaks++;
        this.events.push({ type: 'baseHit', enemy: e, hp: this.baseHp });
        if (this.baseHp <= 0) {
          this.finish('LOSE');
          return;
        }
      } else {
        this.place(e);
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  /** R10：T05 的 6.0 格偵測取聯集；離開後 2 秒重新隱形。範圍傷害不影響此計時。 */
  updateStealth() {
    const detectors = this.towers.filter((t) => t.def.detectRadius);
    for (const e of this.enemies) {
      if (!e.stealth) continue;
      const seen = detectors.some((t) => within(t.cx, t.cy, e.x, e.y, t.def.detectRadius));
      if (seen) {
        if (!e.revealed) this.events.push({ type: 'reveal', enemy: e });
        e.revealed = true;
        e.hideTicks = RESTEALTH_TICKS;
      } else if (e.revealed && --e.hideTicks <= 0) {
        e.revealed = false;
        this.events.push({ type: 'restealth', enemy: e });
      }
    }
  }

  /** 可鎖定目標：類別符合、已顯形、在射程內；Q6 依距離基地最近排序。 */
  targetsFor(t) {
    const r = t.def.range;
    const list = [];
    for (const e of this.enemies) {
      if (!e.alive || !e.revealed || !canHit(t.def, e)) continue;
      if (within(t.cx, t.cy, e.x, e.y, r)) list.push(e);
    }
    return list.sort((a, b) => a.path.length - a.dist - (b.path.length - b.dist) || a.uid - b.uid);
  }

  updateTower(t) {
    const def = t.def;
    if (t.drones) {
      const targets = this.targetsFor(t);
      t.drones.forEach((d, i) => {
        d.target = targets[i] ?? targets[0] ?? null;
        if (d.cooldown > 0) d.cooldown--;
        if (d.cooldown === 0 && d.target) {
          d.cooldown = sec(def.interval);
          this.damage(d.target, def.damage, false, t);
          this.events.push({ type: 'shot', tower: t, kind: 'drone', drone: i, from: [t.cx, t.cy], to: [d.target.x, d.target.y] });
        }
      });
      t.target = targets[0] ?? null;
      return;
    }
    if (t.cooldown > 0) t.cooldown--;
    const prev = t.target;
    const target = this.targetsFor(t)[0] ?? null;
    t.target = target;
    if (target) t.angle = Math.atan2(target.y - t.cy, target.x - t.cx);
    if (def.attack === 'beam') {
      if (!target || target !== prev) t.beamTicks = 0;
      else t.beamTicks++;
    }
    if (!target || t.cooldown > 0) return;
    t.cooldown = sec(def.interval);
    t.firedAt = this.tick;
    this.fire(t, target);
  }

  fire(t, target) {
    const def = t.def;
    const from = [t.cx, t.cy];
    switch (def.attack) {
      case 'bullet':
      case 'missile':
        this.projectiles.push({ uid: ++this.uid, kind: def.attack, tower: t, target, x: t.cx, y: t.cy, speed: PROJECTILE[t.id].speed });
        this.events.push({ type: 'shot', tower: t, kind: def.attack, from, to: [target.x, target.y] });
        break;
      case 'mortar': {
        // 預判落點：以目標目前（含減速）速度推算飛行時間後在路線上的位置
        const ticks = PROJECTILE.T03.flightTicks;
        const lead = target.baseSpeed * (1 - this.slowFactor(target)) * ticks * DT;
        const [tx, ty] = pointAt(target.path, Math.min(target.path.length, target.dist + lead));
        this.projectiles.push({ uid: ++this.uid, kind: 'mortar', tower: t, x0: t.cx, y0: t.cy, tx, ty, x: t.cx, y: t.cy, age: 0, ticks });
        this.events.push({ type: 'shot', tower: t, kind: 'mortar', from, to: [tx, ty] });
        break;
      }
      case 'pierce': {
        const hits = this.pierceHits(t, target);
        const len = def.range;
        const ang = Math.atan2(target.y - t.cy, target.x - t.cx);
        this.events.push({ type: 'shot', tower: t, kind: 'pierce', from, to: [t.cx + Math.cos(ang) * len, t.cy + Math.sin(ang) * len], hits: hits.length });
        for (const e of hits) this.damage(e, def.damage, false, t);
        break;
      }
      case 'beam': {
        const mult = 1 + Math.min(def.rampMax, def.rampPerSec * Math.floor(t.beamTicks / TICKS_PER_SEC));
        this.events.push({ type: 'shot', tower: t, kind: 'beam', from, to: [target.x, target.y], mult });
        this.damage(target, def.damage * mult, false, t);
        break;
      }
      case 'frost':
      case 'gravity':
      case 'burst':
        this.events.push({ type: 'shot', tower: t, kind: def.attack, from, to: [target.x, target.y] });
        this.splash(t, target.x, target.y);
        break;
      case 'chain': {
        const chain = this.chainTargets(t, target);
        let dmg = def.damage;
        const pts = [from];
        for (const e of chain) {
          pts.push([e.x, e.y]);
          this.damage(e, dmg, false, t);
          dmg *= def.jumpFalloff;
        }
        this.events.push({ type: 'shot', tower: t, kind: 'chain', from, to: pts[pts.length - 1], points: pts });
        break;
      }
      default:
        throw new Error(`未知攻擊方式 ${def.attack}`);
    }
  }

  /** Q3：塔中心朝目標延伸至射程邊界；只命中已顯形、類別符合者。 */
  pierceHits(t, target) {
    const def = t.def;
    const ang = Math.atan2(target.y - t.cy, target.x - t.cx);
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const hits = [];
    for (const e of this.enemies) {
      if (!e.alive || !e.revealed || !canHit(def, e)) continue;
      const dx = e.x - t.cx;
      const dy = e.y - t.cy;
      const along = dx * ux + dy * uy;
      if (along < -EPS || along > def.range + EPS) continue;
      if (Math.abs(dx * uy - dy * ux) > PIERCE_HALF_WIDTH + EPS) continue;
      hits.push({ e, along });
    }
    return hits.slice(0, def.pierce).map((h) => h.e);
  }

  /** Q4：由上一命中目標出發，跳距內最近、未命中、已顯形且類別符合者。 */
  chainTargets(t, first) {
    const def = t.def;
    const chain = [first];
    let cur = first;
    for (let j = 0; j < def.jumps; j++) {
      let best = null;
      let bestD = Infinity;
      for (const e of this.enemies) {
        if (!e.alive || !e.revealed || !canHit(def, e) || chain.includes(e)) continue;
        const d = dist2(cur.x, cur.y, e.x, e.y);
        if (d <= def.jumpRange * def.jumpRange + EPS && (d < bestD || (d === bestD && e.uid < best.uid))) {
          best = e;
          bestD = d;
        }
      }
      if (!best) break;
      chain.push(best);
      cur = best;
    }
    return chain;
  }

  /** R4／R10：範圍內所有類別符合敵人（含未顯形）受完整傷害；不改變隱形狀態。 */
  splash(t, x, y) {
    const def = t.def;
    const victims = this.enemies.filter((e) => e.alive && canHit(def, e) && within(x, y, e.x, e.y, def.splash));
    this.events.push({ type: 'explode', kind: def.attack, x, y, radius: def.splash, tower: t });
    for (const e of victims) {
      if (def.slow) {
        const cur = e.slows.get(t.uid);
        e.slows.set(t.uid, { factor: def.slow, ticks: sec(def.slowDuration) });
        if (!cur) this.events.push({ type: 'slow', enemy: e });
      }
      this.damage(e, def.damage, !!def.ignoreShield, t);
    }
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      if (p.kind === 'mortar') {
        p.age++;
        const k = p.age / p.ticks;
        p.x = p.x0 + (p.tx - p.x0) * k;
        p.y = p.y0 + (p.ty - p.y0) * k;
        if (p.age >= p.ticks) {
          p.done = true;
          this.splash(p.tower, p.tx, p.ty);
        }
        continue;
      }
      const e = p.target;
      if (!e.alive) {
        p.done = true;
        continue;
      }
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      const stepLen = p.speed * DT;
      if (d <= stepLen) {
        p.done = true;
        this.damage(e, p.tower.def.damage, !!p.tower.def.ignoreShield, p.tower);
      } else {
        p.x += (dx / d) * stepLen;
        p.y += (dy / d) * stepLen;
        p.angle = Math.atan2(dy, dx);
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.done);
  }

  /** R7：一般傷害先扣護盾，溢出扣 HP；無視護盾傷害直扣 HP 且不改變護盾。 */
  damage(e, amount, ignoreShield, tower) {
    if (!e.alive || amount <= 0) return;
    let rest = amount;
    if (!ignoreShield && e.shield > 0) {
      const absorbed = Math.min(e.shield, rest);
      e.shield -= absorbed;
      rest -= absorbed;
      if (e.shield <= EPS) {
        e.shield = 0;
        this.events.push({ type: 'shieldBreak', enemy: e });
      }
    }
    e.hp -= rest;
    this.events.push({ type: 'hit', enemy: e, amount, tower, hidden: !e.revealed });
    if (e.hp <= EPS) this.kill(e);
  }

  kill(e) {
    e.alive = false;
    e.hp = 0;
    e.shield = 0;
    this.stats.kills++;
    const log = this.curLog();
    log.kills++;
    if (!e.isChild) {
      this.cr += e.def.reward;
      this.stats.earned += e.def.reward;
      log.earned += e.def.reward;
    }
    this.events.push({ type: 'death', enemy: e, hidden: !e.revealed });
    if (e.def.category === 'split') {
      for (let i = 0; i < 2; i++) this.spawn('E01', e.path.id, e.dist, e.wave, true);
    }
  }

  checkVictory() {
    if (!this.result && this.wave === WAVES_PER_MAP && this.spawnsDone && this.enemies.length === 0 && this.baseHp > 0) this.finish('WIN');
  }

  /** R12：鎖定統計快照；之後不再變動。 */
  finish(result) {
    this.result = result;
    this.pending = [];
    this.snapshot = Object.freeze({
      mapId: this.mapId,
      mapName: this.def.name,
      star: this.star,
      result,
      wave: this.wave,
      kills: this.stats.kills,
      leaks: this.stats.leaks,
      baseHp: this.baseHp,
      towersBuilt: this.stats.towersBuilt,
      towerTypes: this.stats.towerTypes.size,
    });
    this.events.push({ type: result === 'WIN' ? 'win' : 'lose', snapshot: this.snapshot });
  }

  drainEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
}

/**
 * 倍速時鐘（R11）：暫停不推進；1×／2×／4× 將實際經過時間乘上倍率後換算為整數 tick，
 * 餘數保留到下一畫面，確保長時間累積誤差為零。
 */
export class SimClock {
  constructor() {
    this.speed = 1;
    this.paused = false;
    this.acc = 0;
  }

  setSpeed(s) {
    if (![1, 2, 4].includes(s)) throw new Error(`不支援的倍速 ${s}`);
    this.speed = s;
    this.paused = false;
  }

  togglePause() {
    this.paused = !this.paused;
  }

  /** 回傳本畫面應推進的 tick 數；realDt 以秒計並限制上限避免分頁切回時暴衝。 */
  advance(realDt) {
    if (this.paused) return 0;
    this.acc += Math.min(realDt, 0.25) * this.speed * TICKS_PER_SEC;
    const n = Math.floor(this.acc + 1e-6);
    this.acc -= n;
    return n;
  }
}
