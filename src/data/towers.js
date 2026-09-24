// 12 種防禦塔（規格第三節「有效塔數值唯一來源」）。
// target：ground 地面／air 空中／both 空地共用。range 與半徑單位為格（1 格 = 64px）。
// 每座塔佔 2×2 格（128×128px），射程由塔中心（2×2 區塊中心）量測。
export const TOWERS = [
  { id: 'T01', name: '脈衝機砲', cost: 120, target: 'ground', range: 3.5, damage: 9, interval: 0.6, attack: 'bullet', ignoreShield: true,
    effect: '單體 15 DPS；無視護盾，直接扣 HP', silhouette: '圓形底座、中央單管炮口、炮管朝向目標旋轉' },
  { id: 'T02', name: '軌道穿透炮', cost: 230, target: 'ground', range: 5.0, damage: 42, interval: 1.8, attack: 'pierce', pierce: 3,
    effect: '直線最多命中 3 名，每名完整傷害', silhouette: '長矩形炮身、中央亮線、兩端對稱磁軌' },
  { id: 'T03', name: '等離子迫擊塔', cost: 280, target: 'ground', range: 4.0, damage: 48, interval: 2.4, attack: 'mortar', splash: 1.2,
    effect: '爆炸半徑 1.2 格，範圍每名完整傷害', silhouette: '六角形底座、中央大型圓形發射井、三片外伸散熱翼' },
  { id: 'T04', name: '熱熔光束塔', cost: 300, target: 'ground', range: 4.5, damage: 15, interval: 0.5, attack: 'beam', rampPerSec: 0.1, rampMax: 0.5,
    effect: '連續命中每秒增傷 10%，上限 50%，失去／切換目標歸零', silhouette: '三角形底座、中央細長透鏡、三條放射散熱槽' },
  { id: 'T05', name: '冰晶偵測塔', cost: 220, target: 'ground', range: 3.0, damage: 4, interval: 1.0, attack: 'frost', splash: 1.2, ignoreShield: true,
    slow: 0.25, slowDuration: 2, detectRadius: 6.0,
    effect: '攻擊半徑 1.2 格、地面減速 25% 持續 2 秒、無視護盾；6.0 格內空地隱形敵人持續顯形', silhouette: '六角冰晶核心、六向短翼、外圈雷達波紋' },
  { id: 'T06', name: '電弧跳躍塔', cost: 290, target: 'ground', range: 3.8, damage: 24, interval: 1.2, attack: 'chain', jumps: 2, jumpFalloff: 0.7, jumpRange: 1.8,
    effect: '主目標加最多 2 次跳躍；每跳傷害乘 0.7；跳距 1.8 格', silhouette: '三個不等距電極環繞中央核心，呈三叉形' },
  { id: 'T07', name: '防空追蹤塔', cost: 150, target: 'air', range: 5.5, damage: 30, interval: 1.2, attack: 'missile',
    effect: '單體追蹤，25 DPS', silhouette: '四角十字底座、中央雷達盤、四枚飛彈艙' },
  { id: 'T08', name: '高射線圈炮', cost: 260, target: 'air', range: 4.8, damage: 48, interval: 1.8, attack: 'pierce', pierce: 3,
    effect: '直線最多命中 3 名，每名完整傷害', silhouette: '雙平行線圈、長方形炮口、兩側對稱線圈標記' },
  { id: 'T09', name: '天穹光束陣列', cost: 330, target: 'air', range: 4.0, damage: 44, interval: 2.2, attack: 'burst', splash: 1.2,
    effect: '爆炸半徑 1.2 格，範圍每名完整傷害', silhouette: '四個外置發光節點包圍空心方形中心' },
  { id: 'T10', name: '蜂群無人機巢', cost: 310, target: 'both', range: 3.8, damage: 8, interval: 0.5, attack: 'drones', drones: 2,
    effect: '2 架無人機，最多攻擊 2 目標；各機 16 DPS、同目標合計 32 DPS', silhouette: '中央六角巢艙、六個環狀停泊孔、外圈六片短翼' },
  { id: 'T11', name: '重力井發生器', cost: 340, target: 'both', range: 3.2, damage: 6, interval: 1.0, attack: 'gravity', splash: 1.6, slow: 0.3, slowDuration: 1.5,
    effect: '脈衝半徑 1.6 格；空地減速 30% 持續 1.5 秒；不牽引；脈衝可傷隱形但不破隱', silhouette: '四個大型圓形錨點呈菱形排列，中央黑色圓井' },
  { id: 'T12', name: '相位棱鏡塔', cost: 360, target: 'both', range: 4.5, damage: 18, interval: 1.0, attack: 'chain', jumps: 2, jumpFalloff: 0.7, jumpRange: 2.0,
    effect: '最多 2 次連鎖，傷害每次乘 0.7；跳距 2.0 格', silhouette: '三角底座、中央菱形棱鏡、三道分叉光路刻線' },
];

export const TOWER_BY_ID = Object.fromEntries(TOWERS.map((t) => [t.id, t]));
export const TOWER_SIZE = 2; // 格
export const TARGET_LABEL = { ground: '地面', air: '空中', both: '空地共用' };

// 升級：每座塔 Lv1–Lv3。傷害為 Lv1 的倍率（四捨五入至整數），射程加成單位為格；
// 升級費用為造價的比例（四捨五入至 10 CR）。減速、偵測半徑、爆炸半徑、穿透與跳躍數不隨等級變化。
export const MAX_LEVEL = 3;
export const UPGRADE_STEPS = [
  { level: 2, costRatio: 0.6, damageMult: 1.4, rangeBonus: 0.25 },
  { level: 3, costRatio: 0.8, damageMult: 1.8, rangeBonus: 0.5 },
];

const levelDef = (t, step) => ({
  ...t,
  level: step ? step.level : 1,
  damage: step ? Math.round(t.damage * step.damageMult) : t.damage,
  range: step ? t.range + step.rangeBonus : t.range,
});

/** TOWER_LEVELS[id][level - 1]：該等級的有效數值；upgradeCost 為升到下一級的費用（滿級為 null）。 */
export const TOWER_LEVELS = Object.fromEntries(TOWERS.map((t) => {
  const defs = [levelDef(t, null), ...UPGRADE_STEPS.map((s) => levelDef(t, s))];
  defs.forEach((d, i) => {
    const next = UPGRADE_STEPS[i];
    d.upgradeCost = next ? Math.round((t.cost * next.costRatio) / 10) * 10 : null;
  });
  return [t.id, defs];
}));
