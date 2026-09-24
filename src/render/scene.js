// 戰場繪製：靜態圖層（地形、道路、航道、基地）與動態圖層（塔、敵人、投射物、特效、預覽）。
// 世界座標以格為單位；畫布依戰場區等比例縮放並以 devicePixelRatio 提高解析度。
import { GRID_W, GRID_H, featureCells, cellAt } from '../core/mapgeom.js';
import { TOWER_BY_ID } from '../data/towers.js';
import { drawTower, drawEnemy, TOWER_COLOR, ENEMY_SCALE } from './sprites.js';

const TAU = Math.PI * 2;

/** 地圖配色：地面色相、可建區、荒地、道路、主題地形 */
const PALETTES = {
  station: [215, 30], mars: [12, 45], moon: [230, 8], ice: [195, 45], sky: [205, 35], glass: [175, 35],
  reactor: [85, 30], bio: [120, 35], storm: [265, 30], orbit: [225, 25], lava: [8, 35], quantum: [285, 30],
  asteroid: [30, 18], dock: [205, 15], rift: [300, 30], fortress: [40, 20], photon: [55, 35], debris: [190, 18],
  furnace: [330, 30],
};
export function palette(name) {
  const [h, s] = PALETTES[name] ?? PALETTES.station;
  return {
    bg: `hsl(${h} ${s}% 7%)`,
    waste: `hsl(${h} ${s * 0.6}% 10%)`,
    wasteLine: `hsl(${h} ${s * 0.6}% 15%)`,
    build: `hsl(${h} ${s}% 17%)`,
    buildEdge: `hsl(${h} ${s}% 26%)`,
    road: `hsl(${h} ${s * 0.5}% 30%)`,
    roadEdge: `hsl(${h} ${s * 0.4}% 62%)`,
    roadMark: `hsl(${h} ${s * 0.4}% 44%)`,
    terrain: `hsl(${(h + 20) % 360} ${Math.min(80, s + 25)}% 22%)`,
    terrainMark: `hsl(${(h + 20) % 360} ${Math.min(90, s + 35)}% 45%)`,
    air: '#e9f3ff',
  };
}

/** 主題地形圖樣：不只以顏色，而以紋路區分（G11） */
const LOOK_PATTERN = {
  hull: 'plates', pit: 'rings', rock: 'dots', ridge: 'zig', crater: 'rings', crack: 'crack', pad: 'cross',
  crystal: 'diamond', core: 'hazard', dome: 'arc', debris: 'dots', lava: 'wave', lab: 'grid', asteroid: 'dots',
  gantry: 'truss', relay: 'cross', prism: 'diamond', void: 'star', wall: 'bricks', pylon: 'cross',
  furnace: 'hazard', rift: 'zig',
};

function drawPattern(ctx, kind, x, y, mark) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = mark;
  ctx.fillStyle = mark;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  switch (kind) {
    case 'plates':
      ctx.rect(0.12, 0.12, 0.76, 0.76);
      ctx.moveTo(0.12, 0.5);
      ctx.lineTo(0.88, 0.5);
      break;
    case 'rings':
      ctx.arc(0.5, 0.5, 0.32, 0, TAU);
      ctx.moveTo(0.64, 0.5);
      ctx.arc(0.5, 0.5, 0.14, 0, TAU);
      break;
    case 'dots':
      for (const [a, b] of [[0.25, 0.3], [0.7, 0.25], [0.5, 0.7]]) {
        ctx.moveTo(a + 0.09, b);
        ctx.arc(a, b, 0.09, 0, TAU);
      }
      ctx.fill();
      ctx.beginPath();
      break;
    case 'zig':
      ctx.moveTo(0, 0.7);
      ctx.lineTo(0.25, 0.3);
      ctx.lineTo(0.5, 0.7);
      ctx.lineTo(0.75, 0.3);
      ctx.lineTo(1, 0.7);
      break;
    case 'crack':
      ctx.moveTo(0.1, 0.1);
      ctx.lineTo(0.45, 0.45);
      ctx.lineTo(0.35, 0.7);
      ctx.lineTo(0.9, 0.9);
      ctx.moveTo(0.45, 0.45);
      ctx.lineTo(0.85, 0.3);
      break;
    case 'cross':
      ctx.moveTo(0.5, 0.15);
      ctx.lineTo(0.5, 0.85);
      ctx.moveTo(0.15, 0.5);
      ctx.lineTo(0.85, 0.5);
      break;
    case 'diamond':
      ctx.moveTo(0.5, 0.12);
      ctx.lineTo(0.85, 0.5);
      ctx.lineTo(0.5, 0.88);
      ctx.lineTo(0.15, 0.5);
      ctx.closePath();
      break;
    case 'hazard':
      for (let i = -1; i < 2; i++) {
        ctx.moveTo(i * 0.5, 1);
        ctx.lineTo(i * 0.5 + 1, 0);
      }
      ctx.lineWidth = 0.12;
      break;
    case 'arc':
      ctx.arc(0.5, 1, 0.45, Math.PI, TAU);
      ctx.moveTo(0.8, 1);
      ctx.arc(0.5, 1, 0.3, 0, Math.PI, true);
      break;
    case 'wave':
      ctx.moveTo(0, 0.4);
      ctx.bezierCurveTo(0.25, 0.15, 0.5, 0.65, 1, 0.4);
      ctx.moveTo(0, 0.75);
      ctx.bezierCurveTo(0.25, 0.5, 0.5, 1, 1, 0.75);
      break;
    case 'grid':
      ctx.rect(0.15, 0.15, 0.7, 0.7);
      ctx.moveTo(0.5, 0.15);
      ctx.lineTo(0.5, 0.85);
      ctx.moveTo(0.15, 0.5);
      ctx.lineTo(0.85, 0.5);
      break;
    case 'truss':
      ctx.rect(0.05, 0.2, 0.9, 0.6);
      ctx.moveTo(0.05, 0.2);
      ctx.lineTo(0.5, 0.8);
      ctx.lineTo(0.95, 0.2);
      break;
    case 'star':
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4;
        ctx.moveTo(0.5 + Math.cos(a) * 0.35, 0.5 + Math.sin(a) * 0.35);
        ctx.lineTo(0.5 - Math.cos(a) * 0.35, 0.5 - Math.sin(a) * 0.35);
      }
      break;
    case 'bricks':
      ctx.rect(0.04, 0.08, 0.92, 0.38);
      ctx.rect(0.04, 0.54, 0.92, 0.38);
      ctx.moveTo(0.5, 0.08);
      ctx.lineTo(0.5, 0.46);
      break;
    default:
      break;
  }
  ctx.stroke();
  ctx.restore();
}

function polyline(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](x, y));
}

/** 沿折線每隔 step 格回呼一次 (x, y, angle) */
function alongPath(path, step, offset, fn) {
  for (let d = offset; d < path.length - 0.5; d += step) {
    let i = 1;
    while (i < path.cum.length - 1 && path.cum[i] < d) i++;
    const a = path.pts[i - 1];
    const b = path.pts[i];
    const t = (d - path.cum[i - 1]) / (path.cum[i] - path.cum[i - 1]);
    fn(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0]));
  }
}

function chevron(ctx, x, y, ang, size, double) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  for (const o of double ? [-size * 0.55, size * 0.25] : [0]) {
    ctx.moveTo(o - size * 0.35, -size * 0.45);
    ctx.lineTo(o + size * 0.2, 0);
    ctx.lineTo(o - size * 0.35, size * 0.45);
  }
  ctx.stroke();
  ctx.restore();
}

function diamond(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
}

/** 繪製整張地圖靜態圖層（世界座標）；地圖選擇縮圖與戰場共用。 */
export function drawMapStatic(ctx, game, opts = {}) {
  const { map, def } = game;
  const pal = palette(def.palette);
  ctx.fillStyle = pal.waste;
  ctx.fillRect(0, 0, GRID_W, GRID_H);

  const looks = new Map();
  for (const f of def.terrain ?? []) for (const [x, y] of featureCells(f)) looks.set(y * GRID_W + x, f.look);

  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const c = cellAt(map, x, y);
      if (c === 0) {
        ctx.fillStyle = pal.build;
        ctx.fillRect(x, y, 1, 1);
        ctx.strokeStyle = pal.buildEdge;
        ctx.lineWidth = 0.04;
        ctx.strokeRect(x + 0.06, y + 0.06, 0.88, 0.88);
      } else if (c === 4) {
        ctx.strokeStyle = pal.wasteLine;
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(x, y + 0.5);
        ctx.lineTo(x + 0.5, y);
        ctx.moveTo(x + 0.5, y + 1);
        ctx.lineTo(x + 1, y + 0.5);
        ctx.stroke();
      } else if (c === 3) {
        ctx.fillStyle = pal.terrain;
        ctx.fillRect(x, y, 1, 1);
        if (!opts.mini) drawPattern(ctx, LOOK_PATTERN[looks.get(y * GRID_W + x)] ?? 'dots', x, y, pal.terrainMark);
      }
    }
  }

  const paths = Object.values(game.paths);
  // 地面道路：實心路面＋兩側邊線＋行進方向刻紋
  for (const p of paths.filter((q) => q.layer === 'ground')) {
    const w = map.routes.find((r) => r.id === p.id).width ?? 1;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'square';
    polyline(ctx, p.pts);
    ctx.strokeStyle = pal.roadEdge;
    ctx.lineWidth = w;
    ctx.stroke();
    polyline(ctx, p.pts);
    ctx.strokeStyle = pal.road;
    ctx.lineWidth = w - 0.12;
    ctx.stroke();
  }
  if (!opts.mini) {
    for (const p of paths.filter((q) => q.layer === 'ground')) {
      ctx.strokeStyle = pal.roadMark;
      ctx.lineWidth = 0.07;
      alongPath(p, 2, 1, (x, y, a) => chevron(ctx, x, y, a, 0.4, false));
    }
  }

  // 基地：2×2 六角能源核心
  const [bx, by] = def.base;
  ctx.save();
  ctx.translate(bx + 1, by + 1);
  ctx.fillStyle = '#0c1a2e';
  ctx.strokeStyle = '#7fe3ff';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos((i * TAU) / 6) * 0.95, Math.sin((i * TAU) / 6) * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 0.42, 0, TAU);
  ctx.fillStyle = '#39c6ff';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, 0.2, 0, TAU);
  ctx.fillStyle = '#eafcff';
  ctx.fill();
  ctx.restore();

  // 空中航道：懸空虛線＋右下投影＋雙箭頭（高度層級，不只靠顏色）
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of paths.filter((q) => q.layer === 'air')) {
    ctx.save();
    ctx.translate(0.14, 0.2);
    polyline(ctx, p.pts);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 0.14;
    ctx.setLineDash([0.34, 0.22]);
    ctx.stroke();
    ctx.restore();
    polyline(ctx, p.pts);
    ctx.strokeStyle = pal.air;
    ctx.lineWidth = 0.1;
    ctx.setLineDash([0.34, 0.22]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!opts.mini) {
      ctx.strokeStyle = pal.air;
      ctx.lineWidth = 0.07;
      alongPath(p, 3, 1.5, (x, y, a) => chevron(ctx, x, y, a, 0.36, true));
    }
  }

  // 地空共用段：每段中點雙層菱形
  if (!opts.mini) {
    for (const s of map.sharedSegments) {
      const mx = (s.a[0] + s.b[0]) / 2 + 0.5;
      const my = (s.a[1] + s.b[1]) / 2 + 0.5;
      diamond(ctx, mx, my, 0.24);
      ctx.fillStyle = 'rgba(10,14,24,0.85)';
      ctx.fill();
      ctx.strokeStyle = pal.air;
      ctx.lineWidth = 0.05;
      ctx.stroke();
      diamond(ctx, mx, my, 0.12);
      ctx.strokeStyle = pal.roadEdge;
      ctx.stroke();
    }
  }

  // 入口與路線 ID 標籤
  const seen = new Map();
  for (const r of map.routes) {
    const [x, y] = r.cells[0];
    const k = `${x},${y}`;
    const n = seen.get(k) ?? 0;
    seen.set(k, n + 1);
    ctx.save();
    ctx.translate(x + 0.5, y + 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, 0.36, 0, TAU);
    ctx.strokeStyle = r.layer === 'air' ? pal.air : '#ffb45c';
    ctx.lineWidth = 0.08;
    if (r.layer === 'air') ctx.setLineDash([0.15, 0.1]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!opts.mini) {
      const lx = x < 1 ? 0.55 : x > GRID_W - 2 ? -0.55 : 0;
      const ly = y < 1 ? 0.62 + n * 0.5 : y > GRID_H - 2 ? -0.62 - n * 0.5 : n * 0.5 - 0.1;
      ctx.translate(lx, ly);
      ctx.fillStyle = 'rgba(8,10,18,0.85)';
      ctx.fillRect(-0.34, -0.2, 0.68, 0.4);
      ctx.fillStyle = r.layer === 'air' ? pal.air : '#ffcf8f';
      ctx.font = 'bold 0.3px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.id, 0, 0.01);
    }
    ctx.restore();
  }
}

export class Scene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = null;
    this.static = document.createElement('canvas');
    this.effects = [];
    this.ppc = 1; // 每格裝置像素
    this.cssPpc = 1;
  }

  setGame(game) {
    this.game = game;
    this.effects = [];
    this.renderStatic();
  }

  /** 以戰場區 CSS 尺寸等比例縮放（不裁切）。 */
  resize(areaW, areaH) {
    const dpr = window.devicePixelRatio || 1;
    const cssPpc = Math.min(areaW / GRID_W, areaH / GRID_H);
    const w = Math.floor(cssPpc * GRID_W);
    const h = Math.floor(cssPpc * GRID_H);
    this.cssPpc = cssPpc;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ppc = this.canvas.width / GRID_W;
    this.renderStatic();
  }

  renderStatic() {
    if (!this.game) return;
    this.static.width = this.canvas.width;
    this.static.height = this.canvas.height;
    const ctx = this.static.getContext('2d');
    ctx.setTransform(this.ppc, 0, 0, this.ppc, 0, 0);
    drawMapStatic(ctx, this.game);
  }

  /** 視窗座標 → 世界座標（格） */
  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * GRID_W, ((clientY - r.top) / r.height) * GRID_H];
  }

  toClient(wx, wy) {
    const r = this.canvas.getBoundingClientRect();
    return [r.left + (wx / GRID_W) * r.width, r.top + (wy / GRID_H) * r.height];
  }

  /** 將模擬事件轉為視覺特效；特效以模擬 tick 計時，暫停時凍結。 */
  addEvents(events) {
    const t = this.game.tick;
    for (const ev of events) {
      switch (ev.type) {
        case 'shot':
          if (ev.kind === 'pierce' || ev.kind === 'beam' || ev.kind === 'chain' || ev.kind === 'drone') {
            this.effects.push({ kind: ev.kind, t, life: ev.kind === 'pierce' ? 14 : 9, from: ev.from, to: ev.to, points: ev.points, color: TOWER_COLOR[ev.tower.id], tower: ev.tower, drone: ev.drone });
          } else if (ev.kind === 'frost' || ev.kind === 'gravity' || ev.kind === 'burst') {
            this.effects.push({ kind: 'zap', t, life: 8, from: ev.from, to: ev.to, color: TOWER_COLOR[ev.tower.id] });
          }
          break;
        case 'explode':
          this.effects.push({ kind: `explode-${ev.kind}`, t, life: ev.kind === 'gravity' ? 30 : 22, x: ev.x, y: ev.y, r: ev.radius });
          break;
        case 'hit':
          if (!ev.hidden) this.effects.push({ kind: 'spark', t, life: 7, x: ev.enemy.x, y: ev.enemy.y, air: ev.enemy.layer === 'air' });
          break;
        case 'shieldBreak':
          if (ev.enemy.revealed) this.effects.push({ kind: 'shield', t, life: 30, x: ev.enemy.x, y: ev.enemy.y });
          break;
        case 'reveal':
          this.effects.push({ kind: 'reveal', t, life: 40, enemy: ev.enemy, x: ev.enemy.x, y: ev.enemy.y });
          break;
        case 'death':
          if (!ev.hidden) this.effects.push({ kind: 'death', t, life: 26, x: ev.enemy.x, y: ev.enemy.y, id: ev.enemy.id });
          break;
        case 'baseHit':
          this.effects.push({ kind: 'base', t, life: 36 });
          break;
        case 'build':
        case 'upgrade':
        case 'relocate':
        case 'sell':
          this.effects.push({ kind: 'build', t, life: 24, x: ev.tower.cx, y: ev.tower.cy });
          break;
        default:
          break;
      }
    }
  }

  /**
   * view：{ hover:[wx,wy]|null, placing:towerId|null, moving:tower|null, selected:tower|null, hoverEnemy, hoverRoute, time }
   */
  render(view) {
    const { ctx, game } = this;
    if (!game) return;
    const now = game.tick;
    this.effects = this.effects.filter((e) => now - e.t <= e.life);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.static, 0, 0);
    ctx.setTransform(this.ppc, 0, 0, this.ppc, 0, 0);

    if (view.hoverRoute) this.drawRouteHighlight(view.hoverRoute);
    this.drawBase(now);

    // 射程圈（位於塔與敵人之下，避免遮住生命條，UI6）
    if (view.selected) this.drawRanges(view.selected.def, view.selected.cx, view.selected.cy, true);

    for (const tw of game.towers) {
      ctx.save();
      ctx.translate(tw.cx, tw.cy);
      const pulse = tw.firedAt >= 0 ? Math.max(0, 1 - (now - tw.firedAt) / 10) : 0;
      drawTower(ctx, tw.id, tw.angle, pulse);
      if (tw.drones) this.drawDrones(tw, now);
      ctx.restore();
      if (tw.level > 1) this.drawLevelPips(tw);
      if (view.selected === tw) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.06;
        ctx.setLineDash([0.2, 0.12]);
        ctx.strokeRect(tw.x + 0.02, tw.y + 0.02, 1.96, 1.96);
        ctx.setLineDash([]);
      }
    }

    const ground = game.enemies.filter((e) => e.layer === 'ground' && e.revealed);
    const air = game.enemies.filter((e) => e.layer === 'air' && e.revealed);
    for (const e of ground) this.drawEnemy(e, view);
    for (const p of game.projectiles) if (p.kind === 'mortar') this.drawProjectile(p);
    this.drawEffects(now, false);
    for (const e of air) this.drawEnemy(e, view);
    for (const p of game.projectiles) if (p.kind !== 'mortar') this.drawProjectile(p);
    this.drawEffects(now, true);

    for (const e of [...ground, ...air]) this.drawBars(e, view.hoverEnemy === e);
    if (view.hover && (view.placing || view.moving)) {
      const [tx, ty] = placementCell(...view.hover);
      if (view.moving) {
        const tw = view.moving;
        this.drawPlacement(tw.id, tw.def, tx, ty, game.canRelocate(tw, tx, ty) && game.cr >= game.relocateCost(tw));
      } else {
        const def = TOWER_BY_ID[view.placing];
        this.drawPlacement(def.id, def, tx, ty, game.canPlace(def.id, tx, ty) && game.cr >= def.cost);
      }
    }
  }

  /** 塔等級標記：塔區塊右下角的菱形，Lv2 一顆、Lv3 兩顆（Lv1 不標）。 */
  drawLevelPips(tw) {
    const { ctx } = this;
    for (let i = 0; i < tw.level - 1; i++) {
      const x = tw.x + 1.8 - i * 0.26;
      const y = tw.y + 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y - 0.11);
      ctx.lineTo(x + 0.11, y);
      ctx.lineTo(x, y + 0.11);
      ctx.lineTo(x - 0.11, y);
      ctx.closePath();
      ctx.fillStyle = '#ffd966';
      ctx.fill();
      ctx.strokeStyle = '#0b1220';
      ctx.lineWidth = 0.03;
      ctx.stroke();
    }
  }

  drawRouteHighlight(routeId) {
    const { ctx } = this;
    const p = this.game.paths[routeId];
    if (!p) return;
    polyline(ctx, p.pts);
    ctx.strokeStyle = p.layer === 'air' ? 'rgba(233,243,255,0.35)' : 'rgba(255,180,92,0.4)';
    ctx.lineWidth = 0.55;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 0.06;
    alongPath(p, 1, 0.5, (x, y, a) => chevron(this.ctx, x, y, a, 0.3, p.layer === 'air'));
  }

  drawBase(now) {
    const { ctx, game } = this;
    const [bx, by] = game.def.base;
    const hit = this.effects.find((e) => e.kind === 'base');
    const cx = bx + 1;
    const cy = by + 1;
    // 基地生命環：20 段，已損失段落改為空心（不只靠顏色）
    for (let i = 0; i < 20; i++) {
      const a0 = -Math.PI / 2 + (i / 20) * TAU + 0.03;
      const a1 = -Math.PI / 2 + ((i + 1) / 20) * TAU - 0.03;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.08, a0, a1);
      const alive = i < game.baseHp;
      ctx.strokeStyle = alive ? '#7fe3ff' : 'rgba(255,90,90,0.55)';
      ctx.lineWidth = alive ? 0.12 : 0.04;
      ctx.stroke();
    }
    if (hit) {
      const k = (now - hit.t) / hit.life;
      ctx.beginPath();
      ctx.arc(cx, cy, 1.1 + k * 0.9, 0, TAU);
      ctx.strokeStyle = `rgba(255,70,70,${1 - k})`;
      ctx.lineWidth = 0.14;
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(255,220,220,${1 - k})`;
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.3);
      ctx.lineTo(0.3, 0.3);
      ctx.moveTo(0.3, -0.3);
      ctx.lineTo(-0.3, 0.3);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawDrones(tw, now) {
    const { ctx } = this;
    tw.drones.forEach((d, i) => {
      let x;
      let y;
      if (d.target && d.target.alive) {
        const a = now * 0.12 + i * Math.PI;
        x = d.target.x - tw.cx + Math.cos(a) * 0.45;
        y = d.target.y - tw.cy + Math.sin(a) * 0.45;
      } else {
        const a = now * 0.05 + i * Math.PI;
        x = Math.cos(a) * 0.5;
        y = Math.sin(a) * 0.5;
      }
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now * 0.3);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos((k * TAU) / 4) * 0.16, Math.sin((k * TAU) / 4) * 0.16);
      }
      ctx.strokeStyle = TOWER_COLOR.T10;
      ctx.lineWidth = 0.05;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 0.07, 0, TAU);
      ctx.fillStyle = '#fff3d6';
      ctx.fill();
      ctx.restore();
    });
  }

  drawEnemy(e, view) {
    const { ctx } = this;
    const lift = e.layer === 'air' ? 0.22 : 0;
    if (e.layer === 'air') {
      // 投影：表示位於飛行層
      ctx.beginPath();
      ctx.ellipse(e.x + 0.14, e.y + 0.24, 0.32 * ENEMY_SCALE[e.id], 0.2 * ENEMY_SCALE[e.id], 0, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
    }
    ctx.save();
    ctx.translate(e.x, e.y - lift);
    drawEnemy(ctx, e.id, e.heading, e.maxShield ? e.shield / e.maxShield : 0, this.game.tick / 60);
    // 減速：三道冰晶短刺環繞（形狀提示）
    const slow = this.game.slowFactor(e);
    if (slow > 0) {
      ctx.strokeStyle = '#bff4ff';
      ctx.lineWidth = 0.05;
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3 + this.game.tick * 0.03;
        const x = Math.cos(a) * 0.46;
        const y = Math.sin(a) * 0.46;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const b = (k * Math.PI) / 3;
          ctx.moveTo(x - Math.cos(b) * 0.09, y - Math.sin(b) * 0.09);
          ctx.lineTo(x + Math.cos(b) * 0.09, y + Math.sin(b) * 0.09);
        }
        ctx.stroke();
      }
    }
    // 已顯形的隱形敵人：四角掃描框
    if (e.stealth) {
      ctx.strokeStyle = '#d7c8ff';
      ctx.lineWidth = 0.05;
      const r = 0.5;
      ctx.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(sx * r, sy * r * 0.55);
        ctx.lineTo(sx * r, sy * r);
        ctx.lineTo(sx * r * 0.55, sy * r);
      }
      ctx.stroke();
    }
    if (view.hoverEnemy === e) {
      ctx.beginPath();
      ctx.arc(0, 0, 0.56, 0, TAU);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.05;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 生命條與護盾條置於敵人上方，最後繪製，避免被其他圖層遮蔽（UI4、UI6）。 */
  drawBars(e, hovered) {
    const damaged = e.hp < e.maxHp || e.shield < e.maxShield;
    if (!damaged && !hovered) return;
    const { ctx } = this;
    const w = 0.8;
    const x = e.x - w / 2;
    let y = e.y - (e.layer === 'air' ? 0.22 : 0) - 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - 0.03, y - 0.03, w + 0.06, (e.maxShield ? 0.24 : 0.14) + 0.02);
    ctx.fillStyle = '#ff5a5a';
    ctx.fillRect(x, y, w, 0.1);
    ctx.fillStyle = '#6dff8a';
    ctx.fillRect(x, y, (w * Math.max(0, e.hp)) / e.maxHp, 0.1);
    if (e.maxShield) {
      y += 0.12;
      ctx.fillStyle = '#6fd8ff';
      ctx.fillRect(x, y, (w * e.shield) / e.maxShield, 0.08);
      ctx.strokeStyle = '#e6f9ff';
      ctx.lineWidth = 0.02;
      ctx.strokeRect(x, y, w, 0.08);
    }
  }

  drawProjectile(p) {
    const { ctx } = this;
    ctx.save();
    if (p.kind === 'mortar') {
      const k = p.age / p.ticks;
      const h = Math.sin(k * Math.PI);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.1, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x, p.y - h * 0.9, 0.14 + h * 0.1, 0, TAU);
      ctx.fillStyle = '#ffb36b';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.03;
      ctx.stroke();
      // 落點標記
      ctx.beginPath();
      ctx.arc(p.tx, p.ty, p.tower.def.splash * (1 - k * 0.3), 0, TAU);
      ctx.strokeStyle = 'rgba(255,160,90,0.5)';
      ctx.setLineDash([0.15, 0.12]);
      ctx.lineWidth = 0.04;
      ctx.stroke();
    } else if (p.kind === 'missile') {
      ctx.translate(p.x, p.y - 0.2);
      ctx.rotate(p.angle ?? 0);
      ctx.beginPath();
      ctx.moveTo(0.18, 0);
      ctx.lineTo(-0.12, -0.07);
      ctx.lineTo(-0.12, 0.07);
      ctx.closePath();
      ctx.fillStyle = '#e8fff0';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.12, 0);
      ctx.lineTo(-0.4, 0);
      ctx.strokeStyle = 'rgba(125,255,176,0.7)';
      ctx.lineWidth = 0.06;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.08, 0, TAU);
      ctx.fillStyle = '#e8f7ff';
      ctx.fill();
    }
    ctx.restore();
  }

  drawEffects(now, airLayer) {
    const { ctx } = this;
    for (const fx of this.effects) {
      const k = (now - fx.t) / fx.life;
      const a = Math.max(0, 1 - k);
      ctx.save();
      switch (fx.kind) {
        case 'pierce':
        case 'beam':
        case 'zap':
        case 'drone':
          if (airLayer) break;
          ctx.beginPath();
          ctx.moveTo(fx.from[0], fx.from[1]);
          ctx.lineTo(fx.to[0], fx.to[1]);
          ctx.strokeStyle = fx.color;
          ctx.globalAlpha = a;
          ctx.lineWidth = fx.kind === 'pierce' ? 0.16 * a + 0.04 : fx.kind === 'beam' ? 0.12 : 0.05;
          if (fx.kind === 'drone' || fx.kind === 'zap') ctx.setLineDash([0.12, 0.1]);
          ctx.stroke();
          if (fx.kind === 'pierce' || fx.kind === 'beam') {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 0.04;
            ctx.stroke();
          }
          break;
        case 'chain':
          if (airLayer) break;
          ctx.globalAlpha = a;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 0.07;
          ctx.beginPath();
          for (let i = 1; i < fx.points.length; i++) {
            const [x0, y0] = fx.points[i - 1];
            const [x1, y1] = fx.points[i];
            ctx.moveTo(x0, y0);
            // 鋸齒電弧
            for (let s = 1; s <= 5; s++) {
              const t = s / 5;
              const off = s === 5 ? 0 : (s % 2 ? 0.14 : -0.14);
              const nx = -(y1 - y0);
              const ny = x1 - x0;
              const len = Math.hypot(nx, ny) || 1;
              ctx.lineTo(x0 + (x1 - x0) * t + (nx / len) * off, y0 + (y1 - y0) * t + (ny / len) * off);
            }
          }
          ctx.stroke();
          break;
        case 'explode-mortar':
        case 'explode-burst':
        case 'explode-frost':
        case 'explode-gravity': {
          const isAir = fx.kind === 'explode-burst';
          if (isAir !== airLayer && fx.kind !== 'explode-gravity') break;
          if (fx.kind === 'explode-gravity' && airLayer) break;
          ctx.translate(fx.x, fx.y);
          ctx.globalAlpha = a;
          if (fx.kind === 'explode-gravity') {
            // 向內收縮的同心圓
            for (let i = 0; i < 3; i++) {
              ctx.beginPath();
              ctx.arc(0, 0, fx.r * (1 - ((k + i / 3) % 1)), 0, TAU);
              ctx.strokeStyle = '#8f88ff';
              ctx.lineWidth = 0.05;
              ctx.stroke();
            }
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, fx.r * (0.4 + 0.6 * k), 0, TAU);
            ctx.fillStyle = fx.kind === 'explode-frost' ? 'rgba(168,240,255,0.18)' : fx.kind === 'explode-burst' ? 'rgba(197,155,255,0.2)' : 'rgba(255,140,70,0.25)';
            ctx.fill();
            ctx.strokeStyle = fx.kind === 'explode-frost' ? '#d8fbff' : fx.kind === 'explode-burst' ? '#e4d2ff' : '#ffc38a';
            ctx.lineWidth = 0.06;
            ctx.stroke();
            // 放射線（爆炸）或六向冰晶（冰霜）
            const n = fx.kind === 'explode-frost' ? 6 : 8;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
              const b = (i * TAU) / n;
              ctx.moveTo(Math.cos(b) * fx.r * 0.2, Math.sin(b) * fx.r * 0.2);
              ctx.lineTo(Math.cos(b) * fx.r * (0.4 + 0.5 * k), Math.sin(b) * fx.r * (0.4 + 0.5 * k));
            }
            ctx.stroke();
          }
          break;
        }
        case 'spark':
          if (fx.air !== airLayer) break;
          ctx.translate(fx.x, fx.y - (fx.air ? 0.22 : 0));
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#fffbe0';
          ctx.lineWidth = 0.05;
          ctx.beginPath();
          for (let i = 0; i < 4; i++) {
            const b = (i * TAU) / 4 + 0.4;
            ctx.moveTo(Math.cos(b) * 0.1, Math.sin(b) * 0.1);
            ctx.lineTo(Math.cos(b) * (0.18 + 0.15 * k), Math.sin(b) * (0.18 + 0.15 * k));
          }
          ctx.stroke();
          break;
        case 'shield':
          if (!airLayer) break;
          ctx.translate(fx.x, fx.y);
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#8fe4ff';
          ctx.lineWidth = 0.04;
          for (let i = 0; i < 6; i++) {
            const b = (i * TAU) / 6;
            const d = 0.4 + k * 0.6;
            ctx.save();
            ctx.translate(Math.cos(b) * d, Math.sin(b) * d);
            ctx.rotate(b + k * 3);
            ctx.beginPath();
            for (let j = 0; j < 6; j++) ctx.lineTo(Math.cos((j * TAU) / 6) * 0.1, Math.sin((j * TAU) / 6) * 0.1);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
          break;
        case 'reveal': {
          if (!airLayer) break;
          const e = fx.enemy;
          ctx.translate(e.alive ? e.x : fx.x, e.alive ? e.y : fx.y);
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(0, 0, 0.3 + k * 0.8, 0, TAU);
          ctx.strokeStyle = '#d7c8ff';
          ctx.lineWidth = 0.06;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 0.45px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('!', 0, -0.62);
          break;
        }
        case 'death':
          if (!airLayer) break;
          ctx.translate(fx.x, fx.y);
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#ffd08a';
          ctx.lineWidth = 0.07;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const b = (i * TAU) / 8 + 0.2;
            ctx.moveTo(Math.cos(b) * 0.15 * (1 + k), Math.sin(b) * 0.15 * (1 + k));
            ctx.lineTo(Math.cos(b) * (0.3 + 0.5 * k), Math.sin(b) * (0.3 + 0.5 * k));
          }
          ctx.stroke();
          break;
        case 'build':
          if (airLayer) break;
          ctx.globalAlpha = a;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.06;
          ctx.strokeRect(fx.x - 1 - k * 0.4, fx.y - 1 - k * 0.4, 2 + k * 0.8, 2 + k * 0.8);
          break;
        default:
          break;
      }
      ctx.restore();
    }
  }

  drawRanges(def, cx, cy, solid) {
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, def.range, 0, TAU);
    ctx.fillStyle = solid ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 0.05;
    ctx.stroke();
    if (def.detectRadius) {
      ctx.beginPath();
      ctx.arc(cx, cy, def.detectRadius, 0, TAU);
      ctx.strokeStyle = '#d7c8ff';
      ctx.setLineDash([0.3, 0.2]);
      ctx.lineWidth = 0.06;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#d7c8ff';
      ctx.font = 'bold 0.3px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('偵測 6.0', cx, cy - def.detectRadius - 0.12);
      ctx.fillStyle = '#ffffff';
      ctx.fillText('攻擊 3.0', cx, cy - def.range - 0.12);
    }
    ctx.restore();
  }

  /** 放置／移動預覽：可放置顯示實線框＋勾、不可放置顯示斜線框＋叉（不只靠顏色，UI3）。 */
  drawPlacement(towerId, def, tx, ty, ok) {
    const { ctx } = this;
    this.drawRanges(def, tx + 1, ty + 1, false);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(tx + 1, ty + 1);
    drawTower(ctx, towerId, -Math.PI / 2, 0);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = ok ? '#6dff8a' : '#ff5a5a';
    if (!ok) ctx.setLineDash([0.18, 0.12]);
    ctx.strokeRect(tx + 0.04, ty + 0.04, 1.92, 1.92);
    ctx.setLineDash([]);
    ctx.translate(tx + 1.72, ty + 0.28);
    ctx.beginPath();
    ctx.arc(0, 0, 0.22, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fill();
    ctx.beginPath();
    if (ok) {
      ctx.moveTo(-0.1, 0);
      ctx.lineTo(-0.02, 0.09);
      ctx.lineTo(0.12, -0.09);
    } else {
      ctx.moveTo(-0.09, -0.09);
      ctx.lineTo(0.09, 0.09);
      ctx.moveTo(0.09, -0.09);
      ctx.lineTo(-0.09, 0.09);
    }
    ctx.lineWidth = 0.06;
    ctx.stroke();
    ctx.restore();
  }
}

/** 游標世界座標 → 2×2 塔左上角格（以游標為塔中心） */
export function placementCell(wx, wy) {
  return [Math.round(wx - 1), Math.round(wy - 1)];
}
