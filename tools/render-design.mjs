// 由資料模組產生 DESIGN.md（數值設計紀錄）。任何數值只從 src/data 與 src/core 讀取，文件不得手改。
import { writeFileSync } from 'node:fs';
import { TOWERS, TARGET_LABEL } from '../src/data/towers.js';
import { ENEMIES } from '../src/data/enemies.js';
import { DIFFICULTY, BASE_HP, START_CR, WAVE_STIPEND_CR, WAVES_PER_MAP, waveSize, waveMultPct, scaledHp, scaledSpeed } from '../src/data/difficulty.js';
import { MAPS } from '../src/data/maps.js';
import { WAVES } from '../src/data/waves.js';
import { TRACKS, loopSeconds } from '../src/data/music.js';
import { getMap, TICKS_PER_SEC, PROJECTILE, PIERCE_HALF_WIDTH, RESTEALTH_TICKS } from '../src/core/game.js';
import { SPAWN_INTERVAL } from '../src/core/waves.js';
import { ENEMY_BY_ID } from '../src/data/enemies.js';

const L = [];
const p = (s = '') => L.push(s);
const row = (cells) => p(`| ${cells.join(' | ')} |`);
const head = (cells, align) => {
  row(cells);
  row(align ?? cells.map(() => '---'));
};
const fmt = (n, d = 2) => (Number.isInteger(n) ? String(n) : n.toFixed(d));

p('# DESIGN.md — 數值設計紀錄');
p();
p('> 本文件由 `npm run spec:docs`（`tools/render-design.mjs`）自 `src/data/` 與 `src/core/` 產生，**請勿手改**。');
p('> 固定數值來源為規格初稿與已確認的 [`docs/規格補完提案.md`](docs/規格補完提案.md)；平衡實測見 [`docs/平衡測試報告.md`](docs/平衡測試報告.md)。');
p('> Gate B 平衡調整（使用者授權）：初始資源 240→500 CR、津貼 60→180 CR、敵人基礎 HP 與護盾 ×0.375、出怪改為全圖每 2.0 秒一名，並重構多入口地圖與空中航道（提案第七節）。');
p();

p('## 1. 全域經濟與生命');
p();
head(['項目', '數值'], ['---', '---:']);
row(['初始資源', `${START_CR} CR`]);
row(['波次津貼（第 2–20 波按下開始時）', `${WAVE_STIPEND_CR} CR`]);
row(['基地生命', String(BASE_HP)]);
row(['每張地圖波數', String(WAVES_PER_MAP)]);
row(['每名漏怪扣基地生命', '1']);
row(['出售／升級／利息', '無（第一版）']);
p();
p('公式：每波主體數 `N(n)=6+⌊n/2⌋`；波次倍率 `W(n)=1+0.05×(n−1)`；實際 HP／護盾＝`round_half_up(基礎 × 星級生命倍率 × W(n))`；實際移速＝`round_half_up(基礎 × 星級速度倍率, 2)`；擊敗獎勵不乘倍率。');
p();
head(['n', ...Array.from({ length: 20 }, (_, i) => String(i + 1))]);
row(['N(n)', ...Array.from({ length: 20 }, (_, i) => String(waveSize(i + 1)))]);
row(['W(n)', ...Array.from({ length: 20 }, (_, i) => fmt(waveMultPct(i + 1) / 100))]);
p();

p('## 2. 難度星級');
p();
head(['星級', '生命倍率', '速度倍率', '可建塔比例', '每波最多敵種', '早期限制'], ['---', '---:', '---:', '---:', '---:', '---']);
const early = { 1: '第 1–4 波無護盾、隱形、分裂', 2: '第 1–3 波無隱形、分裂', 3: '第 1–2 波無分裂', 4: '第 1 波無分裂', 5: '無' };
for (const d of Object.values(DIFFICULTY)) row([`${'★'.repeat(d.star)}`, fmt(d.hpPct / 100), fmt(d.speedPct / 100), `${d.buildPct}%`, String(d.maxTypes), early[d.star]]);
p();

p('## 3. 防禦塔（T01–T12）');
p();
head(['ID', '名稱', '造價', '目標', '射程', '傷害', '間隔', '單體 DPS', 'DPS／100 CR', '攻擊方式', '效果'], ['---', '---', '---:', '---', '---:', '---:', '---:', '---:', '---:', '---', '---']);
const ATTACK = { bullet: '追蹤彈', pierce: '直線穿透', mortar: '拋射爆炸', beam: '持續光束', frost: '冰霜範圍', chain: '鏈式', missile: '追蹤飛彈', burst: '範圍爆炸', drones: '無人機', gravity: '重力脈衝' };
for (const t of TOWERS) {
  const dps = (t.damage / t.interval) * (t.drones ?? 1);
  row([t.id, t.name, String(t.cost), TARGET_LABEL[t.target], t.detectRadius ? `${fmt(t.range, 1)}／偵測 ${fmt(t.detectRadius, 1)}` : fmt(t.range, 1), String(t.damage), fmt(t.interval, 1), fmt(dps, 1), fmt((dps / t.cost) * 100, 2), ATTACK[t.attack], t.effect]);
}
p();
p('單體 DPS＝傷害÷間隔（T10 為 2 架合計）；範圍、穿透、鏈式與增傷的總效益另計，不視為單體 DPS（R3）。');
p();

p('## 4. 敵人（E01–E16）基礎值');
p();
head(['ID', '名稱', '類型', '層級', 'HP', '護盾', '移速', '獎勵', '最早登場', '上限分類'], ['---', '---', '---', '---', '---:', '---:', '---:', '---:', '---:', '---']);
const CAT = { normal: '—', fast: '快速', heavy: '重型', shield: '護盾', stealth: '隱形', split: '分裂' };
for (const e of ENEMIES) row([e.id, e.name, e.type, e.layer === 'air' ? '空中' : '地面', String(e.hp), String(e.shield), fmt(e.speed / 100), String(e.reward), `第 ${e.earliest} 波`, CAT[e.category]]);
p();

p('### 4.1 實際 HP（＋護盾）：第 1 波／第 20 波');
p();
head(['ID', ...[1, 2, 3, 4, 5].map((s) => `${'★'.repeat(s)}`)], ['---', '---:', '---:', '---:', '---:', '---:']);
for (const e of ENEMIES) {
  row([e.id, ...[1, 2, 3, 4, 5].map((s) => {
    const a = scaledHp(e.hp, s, 1);
    const b = scaledHp(e.hp, s, 20);
    const sa = scaledHp(e.shield, s, 1);
    const sb = scaledHp(e.shield, s, 20);
    return e.shield ? `${a}+${sa}／${b}+${sb}` : `${a}／${b}`;
  })]);
}
p();

p('### 4.2 實際移速（格／秒）');
p();
head(['ID', ...[1, 2, 3, 4, 5].map((s) => `${'★'.repeat(s)}`)], ['---', '---:', '---:', '---:', '---:', '---:']);
for (const e of ENEMIES) row([e.id, ...[1, 2, 3, 4, 5].map((s) => fmt(scaledSpeed(e.speed, s)))]);
p();

p('## 5. 地圖與波次總量');
p();
p('收入上限＝初始資源＋19 次津貼＋全部主體擊敗獎勵（E10 子體無獎勵）。總 HP 含護盾，不含 E10 子體。');
p();
head(['地圖', '星級', '可建塔格', '最長地面路徑格數', '20 波主體數', '20 波總 HP', '第 20 波 HP', '收入上限 CR'], ['---', '---', '---:', '---:', '---:', '---:', '---:', '---:']);
for (const m of MAPS) {
  const map = getMap(m.id);
  let count = 0;
  let hp = 0;
  let last = 0;
  let reward = 0;
  WAVES[m.id].forEach((w, i) => {
    for (const [id, c] of w) {
      const e = ENEMY_BY_ID[id];
      const h = (scaledHp(e.hp, m.star, i + 1) + scaledHp(e.shield, m.star, i + 1)) * c;
      count += c;
      hp += h;
      if (i === 19) last += h;
      reward += e.reward * c;
    }
  });
  const longest = Math.max(...map.routes.filter((r) => r.layer === 'ground').map((r) => r.cells.length));
  row([`${m.id} ${m.name}`, '★'.repeat(m.star), String(map.buildable), String(longest), String(count), String(hp), String(last), String(START_CR + WAVE_STIPEND_CR * 19 + reward)]);
}
p();

p('## 6. 模擬參數（規格判定 Q1–Q14 的實作值）');
p();
head(['參數', '數值', '依據'], ['---', '---', '---']);
row(['模擬步長', `1/${TICKS_PER_SEC} 秒（整數 tick）`, 'R11 倍速一致']);
row(['倍速', '暫停／1×／2×／4×', 'R11']);
row(['出怪間隔（每入口）', `${SPAWN_INTERVAL} 秒`, '第四節下限 0.75 秒']);
row(['T01 追蹤彈速度', `${PROJECTILE.T01.speed} 格／秒`, 'Q7']);
row(['T07 追蹤飛彈速度', `${PROJECTILE.T07.speed} 格／秒`, 'Q7']);
row(['T03 拋射飛行時間', `${PROJECTILE.T03.flightTicks / TICKS_PER_SEC} 秒`, 'Q7']);
row(['直線穿透命中半寬', `${PIERCE_HALF_WIDTH} 格`, 'Q3']);
row(['重新隱形延遲', `${RESTEALTH_TICKS / TICKS_PER_SEC} 秒`, 'R10']);
row(['目標優先', '射程內距基地剩餘路程最短', 'Q6']);
row(['減速疊加', '不疊加，取最強；同源刷新', 'Q5']);
row(['T04 增傷', '×(1＋0.1×⌊連續秒數⌋)，上限 ×1.5', 'Q8']);
row(['格子尺寸', '1 格＝64px；塔 2×2；地圖 28×16', '使用者指示']);
p();

p('## 7. 音樂');
p();
head(['音軌', '地圖', '曲名', 'BPM', '小節', '循環秒數', '識別'], ['---', '---', '---', '---:', '---:', '---:', '---']);
for (const t of TRACKS) row([t.id, t.mapId, t.title, String(t.bpm), String(t.bars), fmt(loopSeconds(t), 1), t.identity]);
p();

writeFileSync(new URL('../DESIGN.md', import.meta.url), `${L.join('\n')}`);
console.log('已產生 DESIGN.md');
