// 介面控制：畫面切換、對局迴圈、滑鼠與鍵盤操作、HUD、提示面板、結算與分享卡。
import { MAPS, MAP_BY_ID } from '../data/maps.js';
import { TOWERS, TOWER_BY_ID, TOWER_LEVELS, MAX_LEVEL, TARGET_LABEL } from '../data/towers.js';
import { WAVES_PER_MAP } from '../data/difficulty.js';
import { Game, SimClock } from '../core/game.js';
import { Scene, drawMapStatic, placementCell } from '../render/scene.js';
import { drawTower } from '../render/sprites.js';
import { GRID_W, GRID_H } from '../core/mapgeom.js';
import { AudioEngine } from '../audio/audio.js';
import { drawCard, downloadCard, STAT_ROWS } from './sharecard.js';

const $ = (sel) => document.querySelector(sel);
const KEY_TO_TOWER = { 1: 'T01', 2: 'T02', 3: 'T03', 4: 'T04', 5: 'T05', 6: 'T06', 7: 'T07', 8: 'T08', 9: 'T09', 0: 'T10', '-': 'T11', '=': 'T12' };
const TOWER_KEY = Object.fromEntries(Object.entries(KEY_TO_TOWER).map(([k, v]) => [v, k]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

const fmtRange = (r) => r.toFixed(2).replace(/0$/, '');

function towerDetails(t) {
  const range = t.detectRadius ? `攻擊 ${fmtRange(t.range)} 格／偵測 ${t.detectRadius.toFixed(1)} 格` : `${fmtRange(t.range)} 格`;
  return [
    ['造價', `${t.cost} CR`],
    ['目標', TARGET_LABEL[t.target] + (t.detectRadius ? '（偵測：空地）' : '')],
    ['射程', range],
    ['傷害', `${t.damage}／${t.interval} 秒${t.drones ? `（每機，${t.drones} 架）` : ''}`],
    ['效果', t.effect],
    ['外觀', t.silhouette],
  ];
}

/** 已建造塔的資訊列：造價改為等級與已投入；外觀列（場上可見）改為下一級的傷害與射程預覽。 */
function builtDetails(tw) {
  const rows = towerDetails(tw.def);
  rows[0] = ['等級', `Lv${tw.level} / Lv${MAX_LEVEL}（已投入 ${tw.invested} CR）`];
  rows.pop();
  if (tw.level < MAX_LEVEL) {
    const next = TOWER_LEVELS[tw.id][tw.level];
    rows.push(['下一級', `傷害 ${tw.def.damage}→${next.damage}、射程 ${fmtRange(tw.def.range)}→${fmtRange(next.range)} 格`]);
  }
  return rows;
}

const dl = (rows) => `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;

export class App {
  constructor() {
    this.audio = new AudioEngine();
    this.clock = new SimClock();
    this.game = null;
    this.scene = new Scene($('#battle'));
    this.placing = null;
    this.selected = null;
    this.hover = null;
    this.hoverEnemy = null;
    this.hoverRoute = null;
    this.last = 0;
    this.buildTowerMenu();
    this.buildMapGrid();
    this.bind();
    this.syncAudioButtons();
    requestAnimationFrame((t) => this.frame(t));
  }

  show(id) {
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
    this.hideTooltip();
    if (id === 'screen-select') {
      this.drawMapThumbs();
      if (this.audio.ready) this.audio.playMenu();
    }
  }

  // ---------- 建構 ----------

  buildTowerMenu() {
    const grid = $('#tower-grid');
    for (const t of TOWERS) {
      const b = document.createElement('button');
      b.className = 'tower-btn';
      b.dataset.tower = t.id;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', `${t.id} ${t.name} ${t.cost} CR`);
      b.innerHTML = `<span class="key">${TOWER_KEY[t.id]}</span><span class="tgt">${{ ground: '地', air: '空', both: '空地' }[t.target]}</span><canvas width="96" height="96"></canvas><span class="cost">${t.cost}</span>`;
      const ctx = b.querySelector('canvas').getContext('2d');
      ctx.setTransform(46, 0, 0, 46, 48, 48);
      drawTower(ctx, t.id, -Math.PI / 2, 0, true);
      b.addEventListener('click', () => this.selectTower(this.placing === t.id ? null : t.id));
      b.addEventListener('mouseenter', () => this.showTooltip(b, this.towerTooltip(t)));
      b.addEventListener('mouseleave', () => this.hideTooltip());
      b.addEventListener('focus', () => this.showTooltip(b, this.towerTooltip(t)));
      b.addEventListener('blur', () => this.hideTooltip());
      grid.appendChild(b);
    }
  }

  towerTooltip(t) {
    return `<h4>${t.id} ${t.name}</h4>${dl(towerDetails(t).slice(0, 5))}`;
  }

  buildMapGrid() {
    const grid = $('#map-grid');
    for (const m of MAPS) {
      const b = document.createElement('button');
      b.className = 'map-card';
      b.dataset.map = m.id;
      b.innerHTML = `<canvas width="560" height="320"></canvas><span class="mc-name"><b>${m.id} ${m.name}</b><span class="stars" aria-label="${m.star} 星">${stars(m.star)}</span></span>`;
      b.addEventListener('click', () => this.startMap(m.id));
      b.addEventListener('mouseenter', () => this.showTooltip(b, `<h4>${m.id} ${m.name}</h4><p style="margin:0">${m.theme}</p>`));
      b.addEventListener('mouseleave', () => this.hideTooltip());
      b.addEventListener('focus', () => this.showTooltip(b, `<h4>${m.id} ${m.name}</h4><p style="margin:0">${m.theme}</p>`));
      b.addEventListener('blur', () => this.hideTooltip());
      grid.appendChild(b);
    }
    this.thumbsDrawn = false;
  }

  drawMapThumbs() {
    if (this.thumbsDrawn) return;
    this.thumbsDrawn = true;
    for (const b of document.querySelectorAll('.map-card')) {
      const c = b.querySelector('canvas');
      const ctx = c.getContext('2d');
      ctx.setTransform(c.width / GRID_W, 0, 0, c.height / GRID_H, 0, 0);
      drawMapStatic(ctx, new Game(b.dataset.map), { mini: true });
    }
  }

  bind() {
    // 首頁：瀏覽器需使用者操作才能發聲，首次點擊或按鍵即開始播放選單曲（與地圖選擇共用）。
    const titleGesture = () => {
      if (!$('#screen-title').classList.contains('active')) return;
      this.audio.unlock();
      this.audio.playMenu();
    };
    window.addEventListener('pointerdown', titleGesture);
    window.addEventListener('keydown', titleGesture);
    $('#btn-start').addEventListener('click', () => {
      this.audio.unlock();
      this.show('screen-select');
    });
    $('#btn-wave').addEventListener('click', () => this.startWave());
    $('#info').addEventListener('click', (e) => {
      if (e.target.closest('#btn-upgrade')) this.upgradeSelected();
    });
    $('#btn-maps').addEventListener('click', () => this.backToMaps());
    for (const b of document.querySelectorAll('[data-speed]')) {
      b.addEventListener('click', () => (b.dataset.speed === 'pause' ? this.togglePause() : this.setSpeed(Number(b.dataset.speed))));
    }
    const toggleMusic = () => this.setMusic(!this.audio.musicOn);
    const toggleSfx = () => this.setSfx(!this.audio.sfxOn);
    $('#btn-music').addEventListener('click', toggleMusic);
    $('#sel-music').addEventListener('click', toggleMusic);
    $('#btn-sfx').addEventListener('click', toggleSfx);
    $('#sel-sfx').addEventListener('click', toggleSfx);
    $('#btn-download').addEventListener('click', () => this.download());
    $('#btn-restart').addEventListener('click', () => this.startMap(this.game.mapId));
    $('#btn-back').addEventListener('click', () => this.backToMaps());

    const cv = $('#battle');
    cv.addEventListener('mousemove', (e) => this.onMove(e));
    cv.addEventListener('mouseleave', () => {
      this.hover = null;
      this.hoverEnemy = null;
      this.hoverRoute = null;
      this.hideTooltip();
    });
    cv.addEventListener('click', (e) => this.onClick(e));
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.selectTower(null);
      this.selected = null;
      this.renderInfo();
    });
    window.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => this.layout()).observe($('#field'));
  }

  layout() {
    const f = $('#field');
    this.scene.resize(f.clientWidth, f.clientHeight);
  }

  // ---------- 對局流程 ----------

  startMap(mapId) {
    this.audio.unlock();
    this.game = new Game(mapId);
    this.clock = new SimClock();
    this.placing = null;
    this.selected = null;
    this.hoverEnemy = null;
    $('#result').hidden = true;
    $('#result-error').hidden = true;
    this.show('screen-game');
    this.scene.setGame(this.game);
    this.layout();
    const m = MAP_BY_ID[mapId];
    $('#hud-map').textContent = `${m.id} ${m.name}`;
    $('#hud-star').textContent = stars(m.star);
    $('#hud-star').setAttribute('aria-label', `${m.star} 星`);
    this.audio.playTrack(mapId);
    this.renderInfo();
    this.updateHud();
  }

  backToMaps() {
    this.game = null;
    $('#result').hidden = true;
    this.show('screen-select');
  }

  startWave() {
    if (!this.game || !this.game.startWave()) return;
    this.updateHud();
  }

  setSpeed(s) {
    const wasPaused = this.clock.paused;
    this.clock.setSpeed(s);
    if (wasPaused) this.audio.resumeMusic();
    this.updateHud();
  }

  togglePause() {
    if (!this.game || this.game.result) return;
    this.clock.togglePause();
    if (this.clock.paused) this.audio.pauseMusic();
    else this.audio.resumeMusic();
    this.updateHud();
  }

  cycleSpeed() {
    const order = [1, 2, 4];
    this.setSpeed(order[(order.indexOf(this.clock.speed) + 1) % order.length]);
  }

  setMusic(on) {
    this.audio.setMusic(on);
    this.syncAudioButtons();
  }

  setSfx(on) {
    this.audio.setSfx(on);
    this.syncAudioButtons();
  }

  syncAudioButtons() {
    for (const id of ['#btn-music', '#sel-music']) {
      $(id).setAttribute('aria-pressed', String(this.audio.musicOn));
      $(id).title = this.audio.musicOn ? '音樂：開（M 切換）' : '音樂：關（M 切換）';
    }
    for (const id of ['#btn-sfx', '#sel-sfx']) {
      $(id).setAttribute('aria-pressed', String(this.audio.sfxOn));
      $(id).title = this.audio.sfxOn ? '音效：開（N 切換）' : '音效：關（N 切換）';
    }
  }

  selectTower(id) {
    this.placing = id;
    if (id) this.selected = null;
    for (const b of document.querySelectorAll('.tower-btn')) b.classList.toggle('selected', b.dataset.tower === id);
    this.renderInfo();
  }

  // ---------- 輸入 ----------

  onMove(e) {
    if (!this.game) return;
    const [wx, wy] = this.scene.toWorld(e.clientX, e.clientY);
    this.hover = [wx, wy];
    // 游標指向的已顯形敵人（UI4）；未顯形隱形敵人不可被指向
    let best = null;
    let bd = 0.55 ** 2;
    for (const en of this.game.enemies) {
      if (!en.revealed) continue;
      const d = (en.x - wx) ** 2 + (en.y - (en.layer === 'air' ? 0.22 : 0) - wy) ** 2;
      if (d < bd) {
        bd = d;
        best = en;
      }
    }
    this.hoverEnemy = best;
    // 入口指向時高亮完整路線（M12 等多路線地圖）
    this.hoverRoute = null;
    for (const r of this.game.map.routes) {
      const [x, y] = r.cells[0];
      if (Math.hypot(x + 0.5 - wx, y + 0.5 - wy) < 0.8) this.hoverRoute = r.id;
    }
    if (best) {
      const rows = [['生命', `${Math.ceil(best.hp)} / ${best.maxHp}`]];
      if (best.maxShield) rows.push(['護盾', `${Math.ceil(best.shield)} / ${best.maxShield}`]);
      rows.push(['類型', `${best.def.type}${best.isChild ? '（分裂子體）' : ''}`], ['移速', `${best.baseSpeed} 格／秒`], ['獎勵', best.isChild ? '0 CR（子體）' : `${best.def.reward} CR`]);
      this.showTooltipAt(e.clientX, e.clientY, `<h4>${best.id} ${best.def.name}</h4>${dl(rows)}`);
    } else if (this.hoverRoute) {
      const r = this.game.map.routes.find((x) => x.id === this.hoverRoute);
      this.showTooltipAt(e.clientX, e.clientY, `<h4>路線 ${r.id}</h4><p style="margin:0">${r.layer === 'air' ? '空中航道（虛線）' : '地面路線（實心路面）'}：已高亮完整行進路徑</p>`);
    } else {
      this.hideTooltip();
    }
  }

  onClick(e) {
    if (!this.game) return;
    const [wx, wy] = this.scene.toWorld(e.clientX, e.clientY);
    if (this.placing) {
      const [tx, ty] = placementCell(wx, wy);
      const r = this.game.build(this.placing, tx, ty);
      if (!r.ok) {
        this.audio.sfx('deny');
        this.flash(r.reason === 'funds' ? '資源不足' : r.reason === 'ended' ? '對局已結束' : '此處不可建塔');
      } else if (!e.shiftKey && this.game.cr < TOWER_BY_ID[this.placing].cost) {
        this.selectTower(null);
      }
      this.updateHud();
      return;
    }
    const tw = this.game.towers.find((t) => wx >= t.x && wx < t.x + 2 && wy >= t.y && wy < t.y + 2);
    this.selected = tw ?? null;
    this.renderInfo();
  }

  /** 升級目前選取的已建造塔（按鈕或 U 鍵）。 */
  upgradeSelected() {
    if (!this.game || !this.selected) return;
    const r = this.game.upgrade(this.selected);
    if (!r.ok) {
      this.audio.sfx('deny');
      this.flash(r.reason === 'funds' ? '資源不足' : r.reason === 'max' ? '已達最高等級' : '對局已結束');
    }
    this.renderInfo();
    this.updateHud();
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'm' || k === 'M') return this.setMusic(!this.audio.musicOn);
    if (k === 'n' || k === 'N') return this.setSfx(!this.audio.sfxOn);
    if (!$('#screen-game').classList.contains('active') || !this.game) return;
    if (!$('#result').hidden) return;
    if (k in KEY_TO_TOWER) {
      const id = KEY_TO_TOWER[k];
      this.selectTower(this.placing === id ? null : id);
    } else if (k === 'Escape') {
      this.selectTower(null);
      this.selected = null;
      this.renderInfo();
    } else if (k === ' ') {
      e.preventDefault();
      this.startWave();
    } else if (k === 'p' || k === 'P') {
      this.togglePause();
    } else if (k === 'f' || k === 'F') {
      this.cycleSpeed();
    } else if (k === 'u' || k === 'U') {
      this.upgradeSelected();
    }
  }

  flash(msg) {
    const b = $('#banner');
    b.textContent = msg;
    b.hidden = false;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.updateBanner(), 1200);
  }

  updateBanner() {
    const b = $('#banner');
    if (this.game && this.clock.paused && !this.game.result) {
      b.textContent = '⏸ 已暫停 — 仍可建塔；按 P 或速度按鈕繼續';
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  // ---------- 提示面板（限制於視口內，UI9） ----------

  showTooltip(anchor, html) {
    const r = anchor.getBoundingClientRect();
    const tip = $('#tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    // 優先放在錨點左側（塔選單在右側，避免遮住選單本身），不足則放右側／下方
    let x = r.left - w - 8;
    if (x < 8) x = r.right + 8;
    let y = r.top;
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  showTooltipAt(cx, cy, html) {
    const tip = $('#tooltip');
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    let x = cx + 16;
    let y = cy + 16;
    if (x + w > window.innerWidth - 8) x = cx - w - 16;
    if (y + h > window.innerHeight - 8) y = cy - h - 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }

  hideTooltip() {
    $('#tooltip').hidden = true;
  }

  // ---------- HUD 與資訊區 ----------

  renderInfo() {
    const info = $('#info');
    const t = this.placing ? TOWER_BY_ID[this.placing] : this.selected?.def;
    if (t && this.placing) {
      info.innerHTML = `<h3><span>${t.id} ${t.name}</span><span class="lbl">選取中</span></h3>${dl(towerDetails(t))}` +
        '<p class="hint">左鍵放置（2×2 格）・Shift＋左鍵連續放置・Esc／右鍵取消</p>';
    } else if (t) {
      const tw = this.selected;
      const cost = tw.def.upgradeCost;
      info.innerHTML = `<h3><span>${t.id} ${t.name}</span><span class="lbl">已建造・Lv${tw.level}</span></h3>${dl(builtDetails(tw))}` +
        (cost == null ? '<p class="hint">已達最高等級・塔不可出售</p>'
          : `<button id="btn-upgrade" class="upgrade-btn" type="button">升級至 Lv${tw.level + 1}（${cost} CR）<kbd>U</kbd></button><p class="hint">塔不可出售</p>`);
    } else {
      info.innerHTML = '<h3>操作說明</h3><p class="hint">從上方選塔（或按 1–0、-、=），在可建塔格（方格底紋）上點擊放置；塔佔 2×2 格。點擊已建造的塔可升級（最高 Lv3）。</p>' +
        '<p class="hint">實心路面＝地面路線；懸空虛線＋投影＝空中航道；◇＝地空共用段。指向入口可高亮整條路線。</p>' +
        '<p class="hint">斜線＝邊陲荒地、紋路色塊＝主題地形，皆不可建塔。隱形敵人需 T05 偵測 6.0 格內才會顯形。</p>' +
        '<p class="hint">Space 開始下一波・P 暫停・F 倍速・U 升級・M 音樂・N 音效</p>';
    }
  }

  updateHud() {
    const g = this.game;
    if (!g) return;
    $('#hud-wave').textContent = `${g.wave}/${WAVES_PER_MAP}`;
    $('#hud-hp').textContent = String(g.baseHp);
    $('#hud-cr').textContent = String(g.cr);
    $('#hud-speed').textContent = this.clock.paused ? '暫停' : `${this.clock.speed}×`;
    for (const b of document.querySelectorAll('[data-speed]')) {
      const v = b.dataset.speed;
      const active = v === 'pause' ? this.clock.paused : !this.clock.paused && Number(v) === this.clock.speed;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    const btn = $('#btn-wave');
    btn.disabled = !g.canStartWave();
    btn.textContent = g.wave === 0 ? '開始第 1 波' : g.wave >= WAVES_PER_MAP ? '最終波' : '開始下一波';
    for (const b of document.querySelectorAll('.tower-btn')) b.classList.toggle('poor', g.cr < TOWER_BY_ID[b.dataset.tower].cost);
    const up = $('#btn-upgrade');
    if (up && this.selected) up.disabled = g.cr < this.selected.def.upgradeCost || !!g.result;
    this.updateBanner();
  }

  // ---------- 主迴圈 ----------

  frame(now) {
    const dt = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    const g = this.game;
    if (g && $('#screen-game').classList.contains('active')) {
      if (!g.result) g.step(this.clock.advance(dt));
      const events = g.drainEvents();
      if (events.length) this.handleEvents(events);
      this.scene.render({ hover: this.hover, placing: this.placing, selected: this.selected, hoverEnemy: this.hoverEnemy?.alive && this.hoverEnemy.revealed ? this.hoverEnemy : null, hoverRoute: this.hoverRoute });
      this.updateHud();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  handleEvents(events) {
    this.scene.addEvents(events);
    for (const ev of events) {
      switch (ev.type) {
        case 'build':
        case 'upgrade':
        case 'waveStart':
        case 'shieldBreak':
        case 'baseHit':
          this.audio.sfx(ev.type);
          break;
        case 'hit':
          this.audio.sfx('hit');
          break;
        case 'death':
          this.audio.sfx('death');
          break;
        case 'win':
        case 'lose':
          this.audio.stopMusic();
          this.audio.sfx(ev.type);
          this.showResult(ev.snapshot);
          break;
        default:
          break;
      }
    }
  }

  showResult(s) {
    this.selectTower(null);
    this.hideTooltip();
    this.resultSnapshot = s;
    this.resultGame = this.game;
    const win = s.result === 'WIN';
    $('#result-title').textContent = win ? '✔ 勝利 VICTORY' : '✖ 失敗 DEFEAT';
    $('#result-stats').innerHTML = STAT_ROWS(s).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    drawCard($('#card-preview'), s, this.game);
    $('#result-error').hidden = true;
    $('#result').hidden = false;
    $('#btn-download').focus();
  }

  async download() {
    const err = $('#result-error');
    err.hidden = true;
    try {
      await downloadCard(this.resultSnapshot, this.resultGame);
    } catch (e) {
      err.textContent = `下載失敗：${e.message}。戰果已保留，請再試一次。`;
      err.hidden = false;
    }
  }
}

