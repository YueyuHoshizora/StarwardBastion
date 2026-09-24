// Gate A 規格可執行性驗證：地圖、波次、塔、敵人與音樂資料必須符合《星域防線》規格。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAPS } from '../src/data/maps.js';
import { WAVES } from '../src/data/waves.js';
import { TOWERS } from '../src/data/towers.js';
import { ENEMIES, ENEMY_BY_ID, CAP_GROUPS, capLimit, isShield, isStealth, isSplit } from '../src/data/enemies.js';
import { DIFFICULTY, waveSize, scaledHp, scaledSpeed, START_CR, WAVE_STIPEND_CR } from '../src/data/difficulty.js';
import { TRACKS, MENU_TRACK, loopSeconds } from '../src/data/music.js';
import { buildMap, GRID_W, GRID_H } from '../src/core/mapgeom.js';
import { buildSpawnSchedule, SPAWN_INTERVAL } from '../src/core/waves.js';

const SPEC_MAPS = [
  ['M01', '新曙光環站', 1], ['M02', '赤砂採掘場', 1], ['M03', '月背訊號谷', 1], ['M04', '藍潮冰原', 1],
  ['M05', '雲端升降港', 2], ['M06', '玻璃峽谷', 2], ['M07', '廢棄反應爐', 2], ['M08', '藤蔓穹頂', 2],
  ['M09', '磁暴高原', 3], ['M10', '雙月轉運站', 3], ['M11', '黑曜熔谷', 3], ['M12', '量子迷宮', 4],
  ['M13', '破碎環帶', 4], ['M14', '深空船塢', 4], ['M15', '零點裂隙', 5], ['M16', '星核最後防線', 5],
  ['M17', '光子裂谷', 3], ['M18', '天環碎片場', 4], ['M19', '暗物質熔爐', 5], ['M20', '終焉軌道', 5],
];

test('地圖清單與星級符合規格表', () => {
  assert.deepEqual(MAPS.map((m) => [m.id, m.name, m.star]), SPEC_MAPS);
});

for (const def of MAPS) {
  test(`${def.id} 地圖幾何可機器判定`, () => {
    const map = buildMap(def);
    const baseKeys = map.baseCells;
    for (const r of map.routes) {
      for (const [x, y] of r.cells) assert.ok(x >= 0 && y >= 0 && x < GRID_W && y < GRID_H, `${r.id} 超出網格`);
      const [ex, ey] = r.cells[0];
      assert.ok(ex === 0 || ey === 0 || ex === GRID_W - 1 || ey === GRID_H - 1, `${r.id} 入口不在地圖邊緣`);
      const [lx, ly] = r.cells.at(-1);
      assert.ok(baseKeys.has(ly * GRID_W + lx), `${r.id} 終點不在基地內`);
    }
    assert.ok(map.routes.some((r) => r.layer === 'ground'));
    assert.ok(map.routes.some((r) => r.layer === 'air'));
    assert.ok(map.sharedSegments.length >= 1, '缺少地空共用段');
    const buildable = [...map.cells].filter((c) => c === 0).length;
    const expected = Math.floor((DIFFICULTY[def.star].buildPct * map.denominator + 50) / 100);
    assert.equal(buildable, expected);
    assert.equal(map.denominator, GRID_W * GRID_H - map.roadCount - 4);
  });
}

test('12 種塔數值符合唯一有效塔表，T05 射程 3.0／偵測 6.0，無 T13', () => {
  assert.deepEqual(TOWERS.map((t) => t.id), Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`));
  const t05 = TOWERS.find((t) => t.id === 'T05');
  assert.equal(t05.range, 3.0);
  assert.equal(t05.detectRadius, 6.0);
  assert.deepEqual(
    TOWERS.map((t) => [t.cost, t.target, t.range, t.damage, t.interval]),
    // 第三輪平衡：T08 260→230 CR；T09 330→280 CR、44→56、2.2→2.0 秒；T11 340→260 CR、6→12（提案第七節）
    [[120, 'ground', 3.5, 9, 0.6], [230, 'ground', 5.0, 42, 1.8], [280, 'ground', 4.0, 48, 2.4], [300, 'ground', 4.5, 15, 0.5],
      [220, 'ground', 3.0, 4, 1.0], [290, 'ground', 3.8, 24, 1.2], [150, 'air', 5.5, 30, 1.2], [230, 'air', 4.8, 48, 1.8],
      [280, 'air', 4.0, 56, 2.0], [310, 'both', 3.8, 8, 0.5], [260, 'both', 3.2, 12, 1.0], [360, 'both', 4.5, 18, 1.0]],
  );
});

test('敵人生命、護盾與移速依 round_half_up 計算', () => {
  assert.equal(ENEMIES.length, 16);
  assert.equal(scaledHp(130, 1, 2), 137); // 136.5 進位
  assert.equal(scaledHp(130, 2, 2), 157); // 156.975
  assert.equal(scaledHp(0, 5, 20), 0);
  assert.equal(scaledHp(920, 5, 20), 3140); // 920 × 1.75 × 1.95 = 3139.5 進位
  assert.equal(scaledSpeed(220, 5), 2.64);
  assert.equal(scaledSpeed(55, 2), 0.58); // 0.5775
});

for (const def of MAPS) {
  test(`${def.id} 20 波編成符合數量、登場與上限規則`, () => {
    const waves = WAVES[def.id];
    assert.equal(waves.length, 20);
    const rule = DIFFICULTY[def.star];
    waves.forEach((groups, i) => {
      const n = i + 1;
      const N = waveSize(n);
      const counts = {};
      for (const [id, c] of groups) {
        assert.ok(ENEMY_BY_ID[id], `未知敵人 ${id}`);
        assert.ok(c > 0);
        counts[id] = (counts[id] ?? 0) + c;
      }
      const ids = Object.keys(counts);
      assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), N, `第 ${n} 波總數`);
      assert.ok(ids.length <= rule.maxTypes, `第 ${n} 波敵種 ${ids.length} 超過上限`);
      for (const id of ids) assert.ok(ENEMY_BY_ID[id].earliest <= n, `${id} 第 ${n} 波提早登場`);
      for (const [g, members] of Object.entries(CAP_GROUPS)) {
        const total = members.reduce((s, id) => s + (counts[id] ?? 0), 0);
        assert.ok(total <= capLimit(g, N), `第 ${n} 波 ${g} 超過上限`);
      }
      const banned = (fn) => ids.some(fn);
      if (def.star === 1 && n <= 4) assert.ok(!banned((id) => isShield(id) || isStealth(id) || isSplit(id)));
      if (def.star === 2 && n <= 3) assert.ok(!banned((id) => isStealth(id) || isSplit(id)));
      if (def.star === 3 && n <= 2) assert.ok(!banned(isSplit));
      if (def.star === 4 && n <= 1) assert.ok(!banned(isSplit));
    });
    const half = (n) => Math.ceil(waveSize(n) / 2);
    const rest = (n) => Math.floor(waveSize(n) / 2);
    assert.deepEqual(waves[0], [['E01', 6]]);
    assert.deepEqual(waves[1], [['E01', half(2)], ['E02', rest(2)]]);
    assert.deepEqual(waves[2], [['E01', half(3)], ['E02', rest(3)]]);
    assert.deepEqual(waves[3], [['E01', half(4)], ['E07', rest(4)]]);
    const firstStealth = waves.findIndex((g) => g.some(([id]) => isStealth(id))) + 1;
    if (firstStealth > 0) assert.ok(START_CR + WAVE_STIPEND_CR * (firstStealth - 1) >= 220);
  });

  test(`${def.id} 出怪時間表每入口間隔不低於 0.75 秒`, () => {
    const map = buildMap(def);
    assert.ok(SPAWN_INTERVAL >= 0.75);
    for (let n = 1; n <= 20; n++) {
      const schedule = buildSpawnSchedule(map, def.id, n);
      assert.equal(schedule.length, waveSize(n));
      const last = new Map();
      for (const s of schedule) {
        const route = map.routes.find((r) => r.id === s.route);
        assert.equal(route.layer, ENEMY_BY_ID[s.enemy].layer, '敵人被分派到錯誤層級路線');
        const k = `${route.layer}:${route.cells[0]}`;
        if (last.has(k)) assert.ok(s.time - last.get(k) >= 0.75 - 1e-9);
        last.set(k, s.time);
      }
    }
  });
}

test('20 首音樂一對一綁定地圖且長度 60–90 秒、動機互不相同', () => {
  assert.equal(TRACKS.length, 20);
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, 20);
  assert.deepEqual(TRACKS.map((t) => t.mapId).sort(), MAPS.map((m) => m.id).sort());
  const signatures = new Set();
  for (const t of TRACKS) {
    const sec = loopSeconds(t);
    assert.ok(sec >= 60 && sec <= 90, `${t.id} 長度 ${sec}`);
    const sig = JSON.stringify([t.motif, t.drums.k, t.drums.s]);
    assert.ok(!signatures.has(sig), `${t.id} 動機或節奏型重複`);
    signatures.add(sig);
    for (const lane of ['k', 's', 'h', 'n', 'fill']) if (t.drums[lane]) assert.equal(t.drums[lane].length, 16);
  }
  // 首頁／地圖選擇共用的選單曲：同樣 60–90 秒，且不與任何地圖曲重複
  const menuSec = loopSeconds(MENU_TRACK);
  assert.ok(menuSec >= 60 && menuSec <= 90, `選單曲長度 ${menuSec}`);
  assert.ok(!signatures.has(JSON.stringify([MENU_TRACK.motif, MENU_TRACK.drums.k, MENU_TRACK.drums.s])), '選單曲與地圖曲重複');
  assert.ok(!TRACKS.some((t) => t.id === MENU_TRACK.id));
});
