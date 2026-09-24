// 波次展開：路線分派與出怪時間表。遊戲本體與規格驗證共用同一實作。
import { WAVES } from '../data/waves.js';
import { ENEMY_BY_ID } from '../data/enemies.js';

/**
 * 全圖相鄰兩名主體敵人的生成間隔（秒，模擬時間）。規格下限 0.75 秒。
 * Gate B 平衡調整：全圖共用一個出怪佇列，多入口地圖不會同時湧入，任一入口的間隔必然 ≥ 此值。
 */
export const SPAWN_INTERVAL = 2.0;

export const waveGroups = (mapId, n) => WAVES[mapId][n - 1].map(([enemy, count]) => ({ enemy, count }));

/**
 * 依敵群順序逐一分派路線：同一層級（ground／air）的敵人按該層路線 ID 順序輪替。
 * 全圖共用一個出怪佇列：每 SPAWN_INTERVAL 秒生成一名，依序輪替各入口。
 * 回傳 [{ enemy, route, time }]，time 為本波開始後的秒數。
 */
export function buildSpawnSchedule(map, mapId, n) {
  const byLayer = { ground: map.routes.filter((r) => r.layer === 'ground'), air: map.routes.filter((r) => r.layer === 'air') };
  const turn = { ground: 0, air: 0 };
  let next = 0;
  const out = [];
  for (const g of waveGroups(mapId, n)) {
    const layer = ENEMY_BY_ID[g.enemy].layer;
    for (let i = 0; i < g.count; i++) {
      const routes = byLayer[layer];
      const route = routes[turn[layer]++ % routes.length];
      const time = next;
      next += SPAWN_INTERVAL;
      out.push({ enemy: g.enemy, route: route.id, time });
    }
  }
  return out;
}
