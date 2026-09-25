// 介面控制：畫面切換、對局迴圈、滑鼠與鍵盤操作、HUD、提示面板、結算與分享卡。
import { MAPS, MAP_BY_ID } from '../data/maps.js';
import { TOWERS, TOWER_BY_ID, TOWER_LEVELS, MAX_LEVEL } from '../data/towers.js';
import { WAVES_PER_MAP } from '../data/difficulty.js';
import { Game, SimClock } from '../core/game.js';
import { Scene, drawMapStatic, placementCell } from '../render/scene.js';
import { drawTower } from '../render/sprites.js';
import { GRID_W, GRID_H } from '../core/mapgeom.js';
import { AudioEngine } from '../audio/audio.js';
import { t as tr, onLangChange } from '../i18n/index.js';
import { drawCard, downloadCard, STAT_ROWS } from './sharecard.js';

const $ = (sel) => document.querySelector(sel);
const KEY_TO_TOWER = { 1: 'T01', 2: 'T02', 3: 'T03', 4: 'T04', 5: 'T05', 6: 'T06', 7: 'T07', 8: 'T08', 9: 'T09', 0: 'T10', '-': 'T11', '=': 'T12' };
const TOWER_KEY = Object.fromEntries(Object.entries(KEY_TO_TOWER).map(([k, v]) => [v, k]));
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const AUDIO_PREFS = 'sb-audio'; // localStorage：{ musicOn, sfxOn, music, sfx }（音量 0–100）

const fmtRange = (r) => r.toFixed(2).replace(/0$/, '');

function towerDetails(t) {
  const range = t.detectRadius
    ? tr('ui.attackRange', { range: fmtRange(t.range), detect: t.detectRadius.toFixed(1) })
    : tr('ui.rangeValue', { range: fmtRange(t.range) });
  return [
    [tr('ui.cost'), `${t.cost} CR`],
    [tr('ui.target'), `${tr(`target.${t.target}`)}${t.detectRadius ? tr('ui.detectAir') : ''}`],
    [tr('ui.range'), range],
    [tr('ui.damage'), t.drones ? tr('ui.droneDamageRate', { damage: t.damage, interval: t.interval, drones: t.drones }) : tr('ui.damageRate', { damage: t.damage, interval: t.interval })],
    [tr('ui.effect'), tr(`tower.${t.id}.effect`)],
    [tr('ui.appearance'), tr(`tower.${t.id}.silhouette`)],
  ];
}

/** 已建造塔的資訊列：造價改為等級與已投入；外觀列（場上可見）改為下一級的傷害與射程預覽。 */
function builtDetails(tw) {
  const rows = towerDetails(tw.def);
  rows[0] = [tr('ui.level'), tr('ui.invested', { level: tw.level, max: MAX_LEVEL, amount: tw.invested })];
  rows.pop();
  if (tw.level < MAX_LEVEL) {
    const next = TOWER_LEVELS[tw.id][tw.level];
    rows.push([tr('ui.nextLevel'), tr('ui.nextStats', { damage: tw.def.damage, nextDamage: next.damage, range: fmtRange(tw.def.range), nextRange: fmtRange(next.range) })]);
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
    this.moving = null; // 移動中的已建造塔（V 鍵或按鈕拿起，左鍵放下）
    this.hover = null;
    this.hoverEnemy = null;
    this.hoverRoute = null;
    this.last = 0;
    this.buildTowerMenu();
    this.buildMapGrid();
    this.langUnsubscribe = onLangChange(() => this.refreshLanguage());
    this.bind();
    this.loadAudioPrefs();
    this.syncAudioButtons();
    // 首頁載入即嘗試播放選單曲：瀏覽器允許自動播放時立即發聲，否則等第一次點擊或按鍵（見 bind）。
    this.audio.onstatechange = () => this.syncAudioHint();
    this.audio.unlock();
    this.audio.playMenu();
    this.syncAudioHint();
    requestAnimationFrame((t) => this.frame(t));
  }

  onMenu() {
    return $('#screen-title').classList.contains('active') || $('#screen-select').classList.contains('active');
  }

  syncAudioHint() {
    $('#audio-hint').hidden = this.audio.running;
  }

  refreshLanguage() {
    for (const b of document.querySelectorAll('.tower-btn')) {
      const tower = TOWER_BY_ID[b.dataset.tower];
      b.setAttribute('aria-label', `${tower.id} ${tr(`tower.${tower.id}.name`)} ${tower.cost} CR`);
      b.querySelector('.tgt').textContent = tr(`targetShort.${tower.target}`);
    }
    for (const b of document.querySelectorAll('.map-card')) {
      const map = MAP_BY_ID[b.dataset.map];
      b.querySelector('.mc-name b').textContent = `${map.id} ${tr(`map.${map.id}.name`)}`;
      b.querySelector('.stars').setAttribute('aria-label', tr('ui.stars', { count: map.star }));
    }
    this.syncAudioButtons();
    this.renderInfo();
    if (this.game) {
      const map = MAP_BY_ID[this.game.mapId];
      $('#hud-map').textContent = `${map.id} ${tr(`map.${map.id}.name`)}`;
      $('#hud-star').setAttribute('aria-label', tr('ui.stars', { count: map.star }));
      this.updateHud();
      this.scene.refreshLanguage();
    }
    if (this.resultSnapshot) {
      this.renderResult();
      drawCard($('#card-preview'), this.resultSnapshot, this.resultGame);
      const error = $('#result-error');
      if (!error.hidden && this.downloadError) {
        error.textContent = tr('ui.downloadError', {
          message: this.downloadError.code === 'PNG_ENCODING' ? tr('card.error.png') : this.downloadError.message,
        });
      }
    }
    this.hideTooltip();
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
      b.setAttribute('aria-label', `${t.id} ${tr(`tower.${t.id}.name`)} ${t.cost} CR`);
      b.innerHTML = `<span class="key">${TOWER_KEY[t.id]}</span><span class="tgt">${tr(`targetShort.${t.target}`)}</span><canvas width="96" height="96"></canvas><span class="cost">${t.cost}</span>`;
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
    return `<h4>${t.id} ${tr(`tower.${t.id}.name`)}</h4>${dl(towerDetails(t).slice(0, 5))}`;
  }

  buildMapGrid() {
    const grid = $('#map-grid');
    for (const m of MAPS) {
      const b = document.createElement('button');
      b.className = 'map-card';
      b.dataset.map = m.id;
      b.innerHTML = `<canvas width="560" height="320"></canvas><span class="mc-name"><b>${m.id} ${tr(`map.${m.id}.name`)}</b><span class="stars" aria-label="${tr('ui.stars', { count: m.star })}">${stars(m.star)}</span></span>`;
      const tooltip = () => `<h4>${m.id} ${tr(`map.${m.id}.name`)}</h4><p style="margin:0">${tr(`map.${m.id}.theme`)}</p>`;
      b.addEventListener('click', () => this.startMap(m.id));
      b.addEventListener('mouseenter', () => this.showTooltip(b, tooltip()));
      b.addEventListener('mouseleave', () => this.hideTooltip());
      b.addEventListener('focus', () => this.showTooltip(b, tooltip()));
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
    // 首頁與地圖選擇：瀏覽器需使用者操作才能發聲；任何點擊或按鍵都恢復 AudioContext 並播放選單曲（兩頁共用、不中斷）。
    // 以捕獲階段監聽，確保在按鈕自身的處理（例如 M 鍵切換音樂）之前完成解鎖；click／touchend 涵蓋只認這些事件為使用者操作的瀏覽器。
    const menuGesture = () => {
      if (!this.onMenu()) return;
      this.audio.unlock();
      this.audio.playMenu();
    };
    for (const type of ['pointerdown', 'keydown', 'click', 'touchend']) window.addEventListener(type, menuGesture, true);
    // 首頁與地圖選擇的按鈕點擊音效：地圖卡為確認音，其餘按鈕為點擊音。
    for (const id of ['#screen-title', '#screen-select']) {
      $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) this.audio.sfx(b.classList.contains('map-card') ? 'confirm' : 'click');
      });
    }
    $('#btn-start').addEventListener('click', () => this.show('screen-select'));
    $('#btn-wave').addEventListener('click', () => this.startWave());
    $('#info').addEventListener('click', (e) => {
      if (e.target.closest('#btn-upgrade')) this.upgradeSelected();
      else if (e.target.closest('#btn-move')) this.toggleMove();
      else if (e.target.closest('#btn-sell')) this.sellSelected();
    });
    $('#btn-maps').addEventListener('click', () => this.backToMaps());
    for (const b of document.querySelectorAll('[data-speed]')) {
      b.addEventListener('click', () => (b.dataset.speed === 'pause' ? this.togglePause() : this.setSpeed(Number(b.dataset.speed))));
    }
    for (const b of document.querySelectorAll('[data-audio]')) {
      b.addEventListener('click', () => (b.dataset.audio === 'music' ? this.setMusic(!this.audio.musicOn) : this.setSfx(!this.audio.sfxOn)));
    }
    for (const r of document.querySelectorAll('[data-vol]')) {
      r.addEventListener('input', () => this.setVolume(r.dataset.vol, Number(r.value)));
      // 放開音效滑桿時試播一聲，讓玩家聽到新音量。
      if (r.dataset.vol === 'sfx') r.addEventListener('change', () => this.audio.sfx('click'));
    }
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
    this.moving = null;
    this.hoverEnemy = null;
    this.resultSnapshot = null;
    $('#result').hidden = true;
    $('#result-error').hidden = true;
    this.show('screen-game');
    this.scene.setGame(this.game);
    this.layout();
    const m = MAP_BY_ID[mapId];
    $('#hud-map').textContent = `${m.id} ${tr(`map.${m.id}.name`)}`;
    $('#hud-star').textContent = stars(m.star);
    $('#hud-star').setAttribute('aria-label', tr('ui.stars', { count: m.star }));
    this.audio.playTrack(mapId);
    this.renderInfo();
    this.updateHud();
  }

  backToMaps() {
    this.game = null;
    this.placing = null;
    this.selected = null;
    this.moving = null;
    this.resultSnapshot = null;
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

  /** 滑桿音量 0–100；拖到大於 0 時自動解除該聲道靜音。 */
  setVolume(kind, pct) {
    const v = pct / 100;
    if (kind === 'music') {
      this.audio.setMusicVolume(v);
      if (v > 0 && !this.audio.musicOn) this.audio.setMusic(true);
    } else {
      this.audio.setSfxVolume(v);
      if (v > 0 && !this.audio.sfxOn) this.audio.setSfx(true);
    }
    this.syncAudioButtons();
  }

  loadAudioPrefs() {
    let p = null;
    try {
      p = JSON.parse(localStorage.getItem(AUDIO_PREFS));
    } catch {}
    if (!p || typeof p !== 'object') return;
    const pct = (x) => (Number.isFinite(x) ? Math.min(100, Math.max(0, x)) / 100 : 1);
    this.audio.setMusicVolume(pct(p.music));
    this.audio.setSfxVolume(pct(p.sfx));
    this.audio.setMusic(p.musicOn !== false);
    this.audio.setSfx(p.sfxOn !== false);
  }

  /** 同步所有畫面的靜音按鈕與音量滑桿，並保存設定。 */
  syncAudioButtons() {
    const a = this.audio;
    const state = {
      music: { on: a.musicOn, vol: a.musicVol, name: tr('ui.music'), key: 'M' },
      sfx: { on: a.sfxOn, vol: a.sfxVol, name: tr('ui.sfx'), key: 'N' },
    };
    for (const b of document.querySelectorAll('[data-audio]')) {
      const s = state[b.dataset.audio];
      b.setAttribute('aria-pressed', String(s.on));
      b.title = tr('ui.audioToggleTitle', { name: s.name, state: tr(s.on ? 'ui.audioOn' : 'ui.audioOff'), key: s.key });
    }
    for (const r of document.querySelectorAll('[data-vol]')) {
      const s = state[r.dataset.vol];
      const pct = Math.round(s.vol * 100);
      if (document.activeElement !== r) r.value = String(pct);
      r.title = tr('ui.audioVolumeTitle', { name: s.name, percent: pct });
      r.classList.toggle('muted', !s.on);
    }
    try {
      localStorage.setItem(AUDIO_PREFS, JSON.stringify({ musicOn: a.musicOn, sfxOn: a.sfxOn, music: Math.round(a.musicVol * 100), sfx: Math.round(a.sfxVol * 100) }));
    } catch {}
  }

  selectTower(id) {
    this.placing = id;
    this.moving = null;
    if (id) this.selected = null;
    for (const b of document.querySelectorAll('.tower-btn')) b.classList.toggle('selected', b.dataset.tower === id);
    this.renderInfo();
  }

  // ---------- 輸入 ----------

  onMove(e) {
    if (!this.game) return;
    const [wx, wy] = this.scene.toWorld(e.clientX, e.clientY);
    this.hover = [wx, wy];
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
    this.hoverRoute = null;
    for (const r of this.game.map.routes) {
      const [x, y] = r.cells[0];
      if (Math.hypot(x + 0.5 - wx, y + 0.5 - wy) < 0.8) this.hoverRoute = r.id;
    }
    if (best) {
      const rows = [[tr('ui.hp'), `${Math.ceil(best.hp)} / ${best.maxHp}`]];
      if (best.maxShield) rows.push([tr('ui.shield'), `${Math.ceil(best.shield)} / ${best.maxShield}`]);
      const type = tr(`enemy.${best.def.id}.type`);
      rows.push([tr('ui.type'), best.isChild ? tr('ui.childType', { type }) : type], [tr('ui.enemySpeed'), tr('ui.speedRate', { speed: best.baseSpeed })], [tr('ui.reward'), best.isChild ? tr('ui.childReward') : `${best.def.reward} CR`]);
      this.showTooltipAt(e.clientX, e.clientY, `<h4>${best.id} ${tr(`enemy.${best.def.id}.name`)}</h4>${dl(rows)}`);
    } else if (this.hoverRoute) {
      const r = this.game.map.routes.find((x) => x.id === this.hoverRoute);
      this.showTooltipAt(e.clientX, e.clientY, `<h4>${tr('ui.route', { id: r.id })}</h4><p style="margin:0">${r.layer === 'air' ? tr('ui.airRoute') : tr('ui.groundRoute')}: ${tr('ui.routeHighlight')}</p>`);
    } else {
      this.hideTooltip();
    }
  }

  onClick(e) {
    if (!this.game) return;
    const [wx, wy] = this.scene.toWorld(e.clientX, e.clientY);
    if (this.moving) {
      const [tx, ty] = placementCell(wx, wy);
      const r = this.game.relocate(this.moving, tx, ty);
      if (r.ok) {
        this.moving = null;
        this.renderInfo();
      } else {
        this.audio.sfx('deny');
        this.flash(r.reason === 'funds' ? 'ui.errFunds' : r.reason === 'ended' ? 'ui.errEnded' : 'ui.errMove');
      }
      this.updateHud();
      return;
    }
    if (this.placing) {
      const [tx, ty] = placementCell(wx, wy);
      const r = this.game.build(this.placing, tx, ty);
      if (!r.ok) {
        this.audio.sfx('deny');
        this.flash(r.reason === 'funds' ? 'ui.errFunds' : r.reason === 'ended' ? 'ui.errEnded' : 'ui.errBuild');
      } else if (!e.shiftKey && this.game.cr < TOWER_BY_ID[this.placing].cost) {
        this.selectTower(null);
      }
      this.updateHud();
      return;
    }
    const tower = this.game.towers.find((t) => wx >= t.x && wx < t.x + 2 && wy >= t.y && wy < t.y + 2);
    this.selected = tower ?? null;
    this.renderInfo();
  }

  /** 升級目前選取的已建造塔（按鈕或 U 鍵）。 */
  upgradeSelected() {
    if (!this.game || !this.selected) return;
    const r = this.game.upgrade(this.selected);
    if (!r.ok) {
      this.audio.sfx('deny');
      this.flash(r.reason === 'funds' ? 'ui.errFunds' : r.reason === 'max' ? 'ui.errMax' : 'ui.errEnded');
    }
    this.renderInfo();
    this.updateHud();
  }

  /** 拿起／放回目前選取的已建造塔（按鈕或 V 鍵）；拿起後左鍵選擇新位置。 */
  toggleMove() {
    if (!this.game || !this.selected || this.game.result) return;
    this.moving = this.moving ? null : this.selected;
    this.renderInfo();
  }

  /** 出售目前選取的已建造塔（按鈕或 S 鍵），退還累計投資的固定比例。 */
  sellSelected() {
    if (!this.game || !this.selected) return;
    const r = this.game.sell(this.selected);
    if (!r.ok) {
      this.audio.sfx('deny');
      this.flash('ui.errEnded');
      return;
    }
    this.flash('ui.sold', { refund: r.refund });
    this.selected = null;
    this.moving = null;
    this.renderInfo();
    this.updateHud();
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.matches?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = e.key;
    if (e.target.closest?.('[data-lang]') && (k === ' ' || k === 'Enter')) return;
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
    } else if (k === 'v' || k === 'V') {
      this.toggleMove();
    } else if (k === 's' || k === 'S') {
      this.sellSelected();
    }
  }

  flash(key, params = {}) {
    this.flashMessage = [key, params];
    const b = $('#banner');
    b.textContent = tr(key, params);
    b.hidden = false;
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      this.flashMessage = null;
      this.updateBanner();
    }, 1200);
  }

  updateBanner() {
    const b = $('#banner');
    if (this.game && this.clock.paused && !this.game.result) {
      b.textContent = tr('ui.pausedStatus');
      b.hidden = false;
    } else if (this.flashMessage) {
      b.textContent = tr(this.flashMessage[0], this.flashMessage[1]);
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
    const tower = this.placing ? TOWER_BY_ID[this.placing] : this.selected?.def;
    if (tower && this.placing) {
      info.innerHTML = `<h3><span>${tower.id} ${tr(`tower.${tower.id}.name`)}</span><span class="lbl">${tr('ui.selected')}</span></h3>${dl(towerDetails(tower))}` +
        `<p class="hint">${tr('ui.placeHint')}</p>`;
    } else if (tower && this.moving) {
      info.innerHTML = `<h3><span>${tower.id} ${tr(`tower.${tower.id}.name`)}</span><span class="lbl">${tr('ui.movingLevel', { level: this.moving.level })}</span></h3>${dl(builtDetails(this.moving))}` +
        `<p class="hint">${tr('ui.moveHint', { cost: this.game.relocateCost(this.moving) })}</p>`;
    } else if (tower) {
      const tw = this.selected;
      const cost = tw.def.upgradeCost;
      info.innerHTML = `<h3><span>${tower.id} ${tr(`tower.${tower.id}.name`)}</span><span class="lbl">${tr('ui.builtLevel', { level: tw.level })}</span></h3>${dl(builtDetails(tw))}` +
        (cost == null ? `<p class="hint">${tr('ui.maxLevel')}</p>`
          : `<button id="btn-upgrade" class="upgrade-btn" type="button">${tr('ui.upgrade', { level: tw.level + 1, cost })}<kbd>U</kbd></button>`) +
        `<div class="tower-actions"><button id="btn-move" class="upgrade-btn" type="button">${tr('ui.move', { cost: this.game.relocateCost(tw) })}<kbd>V</kbd></button>` +
        `<button id="btn-sell" class="upgrade-btn" type="button">${tr('ui.sell', { refund: this.game.sellRefund(tw) })}<kbd>S</kbd></button></div>`;
    } else {
      info.innerHTML = `<h3>${tr('ui.instructions')}</h3><p class="hint">${tr('ui.instructionsBuild')}</p>` +
        `<p class="hint">${tr('ui.instructionsRoutes')}</p><p class="hint">${tr('ui.instructionsTerrain')}</p>` +
        `<p class="hint">${tr('ui.instructionsKeys')}</p>`;
    }
  }

  updateHud() {
    const g = this.game;
    if (!g) return;
    $('#hud-wave').textContent = `${g.wave}/${WAVES_PER_MAP}`;
    $('#hud-hp').textContent = String(g.baseHp);
    $('#hud-cr').textContent = String(g.cr);
    $('#hud-speed').textContent = this.clock.paused ? tr('ui.pause') : `${this.clock.speed}×`;
    for (const b of document.querySelectorAll('[data-speed]')) {
      const v = b.dataset.speed;
      const active = v === 'pause' ? this.clock.paused : !this.clock.paused && Number(v) === this.clock.speed;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    const btn = $('#btn-wave');
    btn.disabled = !g.canStartWave();
    btn.textContent = g.wave === 0 ? tr('ui.waveStartFirst') : g.wave >= WAVES_PER_MAP ? tr('ui.waveFinal') : tr('ui.waveStartNext');
    for (const b of document.querySelectorAll('.tower-btn')) b.classList.toggle('poor', g.cr < TOWER_BY_ID[b.dataset.tower].cost);
    const up = $('#btn-upgrade');
    if (up && this.selected) up.disabled = g.cr < this.selected.def.upgradeCost || !!g.result;
    const mv = $('#btn-move');
    if (mv && this.selected) mv.disabled = g.cr < g.relocateCost(this.selected) || !!g.result;
    const sell = $('#btn-sell');
    if (sell) sell.disabled = !!g.result;
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
      this.scene.render({ hover: this.hover, placing: this.placing, moving: this.moving, selected: this.selected, hoverEnemy: this.hoverEnemy?.alive && this.hoverEnemy.revealed ? this.hoverEnemy : null, hoverRoute: this.hoverRoute });
      this.updateHud();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  handleEvents(events) {
    this.scene.addEvents(events);
    for (const ev of events) {
      switch (ev.type) {
        case 'relocate':
          this.audio.sfx('build');
          break;
        case 'build':
        case 'upgrade':
        case 'sell':
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
    this.renderResult();
    drawCard($('#card-preview'), s, this.game);
    $('#result-error').hidden = true;
    $('#result').hidden = false;
    $('#btn-download').focus();
  }

  renderResult() {
    const s = this.resultSnapshot;
    if (!s) return;
    $('#result-title').textContent = s.result === 'WIN' ? tr('ui.victory') : tr('ui.defeat');
    $('#result-stats').innerHTML = STAT_ROWS(s).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  }

  async download() {
    const err = $('#result-error');
    err.hidden = true;
    this.downloadError = null;
    try {
      await downloadCard(this.resultSnapshot, this.resultGame);
    } catch (e) {
      this.downloadError = e;
      err.textContent = tr('ui.downloadError', { message: e.message });
      err.hidden = false;
    }
  }
}

