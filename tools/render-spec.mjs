// 由資料模組產生規格附錄：node tools/render-spec.mjs
// 附錄內容完全由 src/data 推導，修改資料後重新執行即可同步。
import { SPAWN_INTERVAL } from '../src/core/waves.js';
import { writeFileSync } from 'node:fs';
import { MAPS } from '../src/data/maps.js';
import { WAVES } from '../src/data/waves.js';
import { ENEMY_BY_ID } from '../src/data/enemies.js';
import { DIFFICULTY, waveSize, scaledHp } from '../src/data/difficulty.js';
import { TRACKS, MENU_TRACK, loopSeconds } from '../src/data/music.js';
import { buildMap } from '../src/core/mapgeom.js';
import { buildSpawnSchedule } from '../src/core/waves.js';
import { renderAscii } from './map-preview.mjs';

const stars = (n) => '★'.repeat(n);
const pts = (p) => p.map(([x, y]) => `(${x},${y})`).join('→');
const LOOK = {
  hull: '環站殘骸', pit: '礦坑', rock: '礦石堆', ridge: '月岩稜線', crater: '隕石坑', crack: '冰裂隙', void: '高空開口', pad: '起降平台',
  crystal: '晶岩柱', core: '反應爐核心', dome: '穹頂牆', pylon: '磁暴塔', lava: '熔岩', lab: '量子實驗艙', asteroid: '小行星岩塊',
  gantry: '船塢龍門架', rift: '時空裂隙', wall: '要塞牆', prism: '光子晶簇', debris: '環站碎片', furnace: '熔爐機組', relay: '軌道中繼站',
};
const featureText = (f) => {
  const name = LOOK[f.look] ?? f.look;
  if (f.kind === 'rect') return `${name}：矩形 (${f.x},${f.y}) 起 ${f.w}×${f.h}`;
  if (f.kind === 'line') return `${name}：線段 ${pts(f.points)}`;
  if (f.kind === 'disc') return `${name}：圓形 中心 (${f.cx},${f.cy}) 半徑 ${f.r}`;
  return `${name}：環形 中心 (${f.cx},${f.cy}) 半徑 ${f.r}`;
};

// ── 附錄 A：地圖 ──
const a = [
  '# 附錄 A — 20 張地圖資料',
  '',
  '> 由 `node tools/render-spec.mjs` 從 `src/data/maps.js` 與 `src/core/mapgeom.js` 產生，請勿手動修改。',
  '',
  '座標為 `(x,y)` 格，原點在左上；網格 28×16 格，每格 64px，戰場原生 1792×1024px。塔佔 2×2 格（128px），道路與敵人 64px。',
  '',
  '圖例：`G` 地面入口、`A` 空中入口、`=` 地面道路（`ground`）、`^` 空中航道（`air`，其下格仍可建塔）、`+` 地空共用或交會格、`B` 基地（2×2）、`·` 可建塔格、`#` 主題禁建地形、`░` 邊陲荒地（禁建）。',
  '',
];
for (const def of MAPS) {
  const map = buildMap(def);
  const shared = map.sharedSegments.map((s) => `(${s.a})–(${s.b})`).join('、');
  a.push(`## ${def.id} ${def.name} ${stars(def.star)}`, '');
  a.push(`- 主題：${def.theme}`);
  a.push(`- 敵人生命：星級倍率 ×${(DIFFICULTY[def.star].hpPct / 100).toFixed(2)}、關卡 HP 調校 ${def.hpTune}%。`);
  a.push(`- 基地：左上角 (${def.base.join(',')})，佔 2×2 格；所有路線終點位於基地內。`);
  for (const r of def.ground) a.push(`- 地面路線 ${r.id}${r.width ? `（路寬 ${r.width} 格）` : ''}：${pts(r.points)}`);
  for (const r of def.air) a.push(`- 空中航道 ${r.id}：${pts(r.points)}`);
  a.push(`- 入口：${map.entrances.map((e) => `${e.route} (${e.cell.join(',')})`).join('、')}；出口：基地。`);
  a.push(`- 地空共用段（同時標記 \`ground\`＋\`air\`，共 ${map.sharedSegments.length} 段）：${shared}`);
  a.push(`- 主題禁建地形：${(def.terrain ?? []).map(featureText).join('；') || '無'}`);
  a.push(`- 道路格 ${map.roadCount}、基地格 4、分母（非道路非基地格）${map.denominator}；可建比例 ${DIFFICULTY[def.star].buildPct}% → 可建塔格 **${map.buildable}**，禁建 ${map.denominator - map.buildable}。`);
  a.push('', '```text', renderAscii(map), '```', '');
}
writeFileSync(new URL('../docs/附錄A_地圖資料.md', import.meta.url), a.join('\n'));

// ── 附錄 B：波次 ──
const b = [
  '# 附錄 B — 20 張地圖 × 20 波敵人編成',
  '',
  '> 由 `node tools/render-spec.mjs` 從 `src/data/waves.js` 產生，請勿手動修改。',
  '',
  `「編成」依生成順序列出敵群（\`E01×4\` 表示連續 4 名 E01）。路線分派：同層級敵人依序輪替該層路線（G1→G2→…；A1→A2→…）；全圖共用一個出怪佇列，每 ${SPAWN_INTERVAL.toFixed(1)} 秒生成一名。`,
  '「總 HP／總護盾」為主體敵人套用星級倍率、關卡 HP 調校與波次倍率後的合計，不含 E10 子體；「擊敗獎勵」為全數擊敗可得 CR（不含子體，子體不給獎勵）。',
  '',
];
for (const def of MAPS) {
  const map = buildMap(def);
  b.push(`## ${def.id} ${def.name} ${stars(def.star)}`, '');
  b.push('| 波 | N | 編成（生成順序） | 路線分派 | 總 HP | 總護盾 | 擊敗獎勵 CR |', '|---:|---:|---|---|---:|---:|---:|');
  WAVES[def.id].forEach((groups, i) => {
    const n = i + 1;
    let hp = 0;
    let sh = 0;
    let cr = 0;
    for (const [id, c] of groups) {
      const e = ENEMY_BY_ID[id];
      hp += c * scaledHp(e.hp, def.star, n, def.hpTune);
      sh += c * scaledHp(e.shield, def.star, n, def.hpTune);
      cr += c * e.reward;
    }
    const schedule = buildSpawnSchedule(map, def.id, n);
    const perRoute = {};
    for (const s of schedule) perRoute[s.route] = (perRoute[s.route] ?? 0) + 1;
    const routes = Object.entries(perRoute).sort().map(([r, c]) => `${r}:${c}`).join(' ');
    b.push(`| ${n} | ${waveSize(n)} | ${groups.map(([id, c]) => `${id}×${c}`).join(' → ')} | ${routes} | ${hp} | ${sh} | ${cr} |`);
  });
  b.push('');
}
writeFileSync(new URL('../docs/附錄B_波次編成.md', import.meta.url), b.join('\n'));

// ── 附錄 C：音樂 ──
const names = (s) => s.notes.join(', ');
const c = [
  '# 附錄 C — 20 首地圖 8-bit 音樂音序',
  '',
  '> 由 `node tools/render-spec.mjs` 從 `src/data/music.js` 產生，請勿手動修改。',
  '',
  '主旋律音高以相對主音的半音數表示；節奏以 16 分音符步數表示。鼓型：`k` 大鼓、`s` 小鼓、`h` 腳踏鈸、`n` 噪訊打擊。',
  '',
  '| 音軌 ID | 地圖 | 曲名 | BPM | 小節 | 循環秒數 | 主音 MIDI | 主旋律音高 | 主旋律節奏 | 主音色 | 大鼓 | 小鼓 | 識別（製作表） |',
  '|---|---|---|---:|---:|---:|---:|---|---|---|---|---|---|',
];
for (const t of [...TRACKS, MENU_TRACK]) {
  const tone = `${t.lead.wave}${t.lead.duty ? ` ${t.lead.duty * 100}%` : ''}${t.lead.distortion ? ' 失真' : ''}`;
  c.push(`| ${t.id} | ${t.mapId ?? '首頁／地圖選擇'} | ${t.title} | ${t.bpm} | ${t.bars} | ${loopSeconds(t).toFixed(1)} | ${t.root} | ${names(t.motif)} | ${t.motif.steps.join('-')} | ${tone} | \`${t.drums.k}\` | \`${t.drums.s}\` | ${t.identity} |`);
}
c.push('', '`BGM-MENU` 為首頁與地圖選擇共用的選單曲，不計入 20 首地圖曲；兩個畫面間切換不會重新開始播放。首頁載入即嘗試播放；瀏覽器要求使用者操作時，首頁顯示提示，首次點擊或按鍵後開始。', '');
writeFileSync(new URL('../docs/附錄C_音樂音序.md', import.meta.url), c.join('\n'));
console.log('已更新 docs/附錄A_地圖資料.md、docs/附錄B_波次編成.md、docs/附錄C_音樂音序.md');
