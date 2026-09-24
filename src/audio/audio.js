// Web Audio 音訊引擎：20 首 8-bit 音序即時合成、事件音效、音樂／音效獨立靜音、暫停續播（R11、R13）。
// 音樂時鐘獨立於遊戲倍速：只以 AudioContext 實際時間排程，倍速不改變音高或播放速度。
import { TRACK_BY_MAP } from '../data/music.js';

const LOOKAHEAD = 0.18; // 秒
const TICK_MS = 25;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.track = null;
    this.playing = false;
    this.step = 0; // 下一個要排程的 16 分音符步
    this.nextTime = 0;
    this.timer = null;
    this.waves = new Map();
    this.lastSfx = new Map();
    this.shapers = new Map();
  }

  /** 首次使用者點擊後建立／恢復 AudioContext（瀏覽器自動播放政策）。 */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -12;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.5 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.6 : 0;
      this.sfxGain.connect(this.master);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get ready() {
    return !!this.ctx;
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.02);
  }

  setSfx(on) {
    this.sfxOn = on;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.02);
  }

  // ---------- 音樂 ----------

  /** 切換到地圖專屬曲，從頭播放。 */
  playTrack(mapId) {
    this.stopMusic();
    this.track = TRACK_BY_MAP[mapId];
    this.step = 0;
    this.resumeMusic();
  }

  get stepDur() {
    return 60 / this.track.bpm / 4;
  }

  get totalSteps() {
    return this.track.bars * 16;
  }

  resumeMusic() {
    if (!this.ctx || !this.track || this.playing) return;
    this.playing = true;
    this.bus = this.ctx.createGain();
    this.bus.connect(this.musicGain);
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  /** 暫停：記錄目前實際播放中的步，丟棄已排程但尚未發聲的音符；恢復時由該步續播。 */
  pauseMusic() {
    if (!this.playing) return;
    const ahead = Math.max(0, Math.ceil((this.nextTime - this.ctx.currentTime) / this.stepDur));
    this.step = (this.step - ahead + this.totalSteps * 4) % this.totalSteps;
    this.silenceBus();
  }

  stopMusic() {
    this.silenceBus();
    this.track = null;
  }

  silenceBus() {
    clearInterval(this.timer);
    this.timer = null;
    this.playing = false;
    if (this.bus) {
      const bus = this.bus;
      const t = this.ctx.currentTime;
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + 0.03);
      setTimeout(() => bus.disconnect(), 120);
      this.bus = null;
    }
  }

  schedule() {
    if (!this.playing) return;
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % this.totalSteps; // 無縫循環：最後一步後直接接第 0 步
    }
  }

  /** 依音序資料合成單一 16 分音符步的所有聲部。 */
  playStep(step, time) {
    const tr = this.track;
    const sd = this.stepDur;
    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const swing = tr.swing && inBar % 2 === 1 ? tr.swing * sd : 0;
    const t = time + swing;
    const chord = tr.progression[bar % tr.progression.length];
    const phrase = bar % 8;
    const section = Math.floor(bar / 8) % 2;

    // 主旋律：動機沿小節連續循環，隨和聲根音移調；每 8 小節最後一小節收尾留白
    const lead = (voice, notes, steps, base, startOffset = 0, activeBar = true) => {
      if (!activeBar) return;
      const len = steps.reduce((a, b) => a + b, 0);
      const pos = (((step - startOffset) % len) + len) % len;
      let acc = 0;
      for (let i = 0; i < notes.length; i++) {
        if (pos === acc) {
          const dur = steps[i] * sd * (voice.staccato ?? 0.9);
          const note = tr.root + base + notes[i] + chord + 12 * (voice.octave ?? 0);
          this.tone(voice, note, t, dur, 0.16, i);
          if (voice.echo) {
            for (let r = 1; r <= voice.echo.repeats; r++) this.tone(voice, note, t + r * voice.echo.delaySteps * sd, dur, 0.16 * voice.echo.gain ** r, i);
          }
        }
        acc += steps[i];
      }
    };
    const rest = phrase === 7 && inBar >= 8;
    const leadOn = !rest && !(tr.answer && !tr.answer.offsetSteps && bar % 2 === 1);
    lead(tr.lead, tr.motif.notes, tr.motif.steps, section ? 12 : 0, 0, leadOn);
    if (tr.harmony) lead(tr.harmony, tr.motif.notes, tr.motif.steps, (section ? 12 : 0) + tr.harmony.interval, tr.harmony.delaySteps, leadOn);
    if (tr.answer) {
      const alternate = !tr.answer.offsetSteps;
      lead(tr.answer, tr.answer.notes, tr.answer.steps, 0, tr.answer.offsetSteps ?? 0, !rest && (!alternate || bar % 2 === 1));
    }

    // 低音：每拍根音，第 3 拍五度
    if (inBar % 4 === 0) {
      const n = tr.root - 24 + chord + (inBar === 8 ? 7 : 0) + 12 * (tr.bass.octave ?? 0);
      this.tone(tr.bass, n, t, sd * 3.2, 0.2, 0);
    }

    // 鼓：16 步型；每 8 小節最後一小節改為過門
    const d = tr.drums;
    if (phrase === 7 && d.fill) {
      this.drum(d.fill[inBar], t);
    } else {
      for (const k of ['k', 's', 'h', 'n']) if (d[k] && d[k][inBar] !== '.') this.drum(d[k][inBar], t);
    }
  }

  pulseWave(duty) {
    const key = Math.round(duty * 1000);
    if (!this.waves.has(key)) {
      const n = 32;
      const real = new Float32Array(n);
      const imag = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      }
      this.waves.set(key, this.ctx.createPeriodicWave(real, imag));
    }
    return this.waves.get(key);
  }

  shaper(amount) {
    if (!this.shapers.has(amount)) {
      const ws = this.ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      const k = amount * 60;
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
      }
      ws.curve = curve;
      this.shapers.set(amount, ws);
    }
    return this.shapers.get(amount);
  }

  /** 晶片音色：方波／脈衝波／鋸齒波／三角波，短起音與釋放避免爆音。 */
  tone(voice, midi, t, dur, vol, idx, dest = this.bus) {
    if (!dest) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    if (voice.wave === 'pulse') {
      const duty = voice.dutySweep && idx % 2 ? voice.duty + voice.dutySweep : voice.duty;
      osc.setPeriodicWave(this.pulseWave(duty));
    } else {
      osc.type = voice.wave;
    }
    osc.frequency.setValueAtTime(mtof(midi), t);
    if (voice.arpeggio) {
      const n = Math.max(1, Math.floor(dur / 0.045));
      for (let i = 0; i < n; i++) osc.frequency.setValueAtTime(mtof(midi + voice.arpeggio[i % voice.arpeggio.length]), t + i * 0.045);
    }
    if (voice.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5;
      lg.gain.value = mtof(midi) * 0.01 * voice.vibrato * 2;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    const level = voice.wave === 'triangle' ? vol * 1.6 : voice.wave === 'sawtooth' ? vol * 0.6 : vol * 0.8;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.005);
    g.gain.setValueAtTime(level, t + Math.max(0.006, dur - 0.02));
    g.gain.linearRampToValueAtTime(0, t + dur);
    let node = osc.connect(g);
    if (voice.distortion) node = node.connect(this.shaper(voice.distortion));
    if (voice.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = voice.pan;
      node = node.connect(p);
    }
    node.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (seed / 0x7fffffff) * 2 - 1;
    }
    return buf;
  }

  noiseHit(t, dur, vol, filterType, freq, dest) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.01);
  }

  /** 電子鼓：k 大鼓、s 小鼓、h 腳踏鈸、n 噪訊打擊 */
  drum(kind, t, dest = this.bus) {
    if (!dest || kind === '.' || !kind) return;
    const ctx = this.ctx;
    if (kind === 'k') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.2);
    } else if (kind === 's') {
      this.noiseHit(t, 0.14, 0.3, 'highpass', 1500, dest);
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.1);
    } else if (kind === 'h') {
      this.noiseHit(t, 0.04, 0.12, 'highpass', 7000, dest);
    } else if (kind === 'n') {
      this.noiseHit(t, 0.1, 0.25, 'bandpass', 2500, dest);
    }
  }

  // ---------- 音效 ----------

  /** 事件音效；同類音效最短間隔 45ms，事件越多播放越頻繁，但不改變音高（R11）。 */
  sfx(type) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const last = this.lastSfx.get(type) ?? -1;
    if (now - last < 0.045) return;
    this.lastSfx.set(type, now);
    const t = now + 0.005;
    const d = this.sfxGain;
    const sq = { wave: 'pulse', duty: 0.5 };
    const p25 = { wave: 'pulse', duty: 0.25 };
    const tri = { wave: 'triangle' };
    const saw = { wave: 'sawtooth' };
    switch (type) {
      case 'build':
        this.tone(sq, 72, t, 0.06, 0.12, 0, d);
        this.tone(sq, 79, t + 0.06, 0.1, 0.12, 0, d);
        break;
      case 'waveStart':
        [60, 64, 67, 72].forEach((n, i) => this.tone(p25, n, t + i * 0.07, 0.09, 0.12, 0, d));
        break;
      case 'hit':
        this.tone(p25, 88, t, 0.025, 0.05, 0, d);
        break;
      case 'shieldBreak':
        this.noiseHit(t, 0.18, 0.2, 'highpass', 4000, d);
        this.tone(tri, 96, t, 0.05, 0.12, 0, d);
        this.tone(tri, 91, t + 0.05, 0.08, 0.1, 0, d);
        break;
      case 'death':
        this.noiseHit(t, 0.12, 0.16, 'bandpass', 900, d);
        this.tone(sq, 55, t, 0.07, 0.08, 0, d);
        break;
      case 'baseHit':
        this.tone(saw, 40, t, 0.25, 0.25, 0, d);
        this.tone(saw, 36, t + 0.1, 0.25, 0.2, 0, d);
        break;
      case 'deny':
        this.tone(sq, 45, t, 0.08, 0.1, 0, d);
        break;
      case 'win':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(sq, n, t + i * 0.11, i === 6 ? 0.6 : 0.1, 0.14, 0, d));
        break;
      case 'lose':
        [67, 63, 60, 55, 51].forEach((n, i) => this.tone(saw, n, t + i * 0.16, i === 4 ? 0.7 : 0.14, 0.14, 0, d));
        break;
      default:
        break;
    }
  }
}
