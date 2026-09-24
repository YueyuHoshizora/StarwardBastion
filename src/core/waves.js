// 波次展開：路線分派與出怪時間表。遊戲本體與規格驗證共用同一實作。
import { WAVES } from '../data/waves.js';
import { ENEMY_BY_ID } from '../data/enemies.js';

/** 同一入口相鄰兩名主體敵人的生成間隔（秒，模擬時間）。規格下限 0.75 秒。 */
export const SPAWN_INTERVAL = 1.0;

export const waveGroups = (mapId, n) => WAVES[mapId][n - 1].map(([enemy, count]) => ({ enemy, count }));

/**
 * 依敵群順序逐一分派路線：同一層級（ground／air）的敵人按該層路線 ID 順序輪替。
 * 共用同一入口格的路線共享出怪佇列；每個入口每 SPAWN_INTERVAL 秒最多生成一名。
 * 回傳 [{ enemy, route, time }]，time 為本波開始後的秒數。
 */
export function buildSpawnSchedule(map, mapId, n) {
  const byLayer = { ground: map.routes.filter((r) => r.layer === 'ground'), air: map.routes.filter((r) => r.layer === 'air') };
  const turn = { ground: 0, air: 0 };
  const nextAt = new Map();
  const out = [];
  for (const g of waveGroups(mapId, n)) {
    const layer = ENEMY_BY_ID[g.enemy].layer;
    for (let i = 0; i < g.count; i++) {
      const routes = byLayer[layer];
      const route = routes[turn[layer]++ % routes.length];
      const entrance = `${layer}:${route.cells[0].join(',')}`;
      const time = nextAt.get(entrance) ?? 0;
      nextAt.set(entrance, time + SPAWN_INTERVAL);
      out.push({ enemy: g.enemy, route: route.id, time });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
