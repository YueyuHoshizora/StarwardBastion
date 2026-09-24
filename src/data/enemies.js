// 16 種敵人基礎值（規格第五節）。speed 以百分之一格／秒整數儲存。
// layer：ground 地面／air 空中。category 供波次上限規則使用。
export const ENEMIES = [
  { id: 'E01', name: '探路蜂', type: '一般地面', layer: 'ground', hp: 130, shield: 0, speed: 100, reward: 5, category: 'normal', earliest: 1, marker: '小型圓形機體、單一中央紅色光眼、短尾焰' },
  { id: 'E02', name: '裂步者', type: '快速地面', layer: 'ground', hp: 85, shield: 0, speed: 180, reward: 6, category: 'fast', earliest: 2, marker: '細長雙足剪影、前傾箭頭形機首、雙尾焰' },
  { id: 'E03', name: '堡壘機甲', type: '高生命地面', layer: 'ground', hp: 520, shield: 0, speed: 55, reward: 16, category: 'heavy', earliest: 5, marker: '大型方形裝甲外殼、四角裝甲板、中央艙門' },
  { id: 'E04', name: '護盾載體', type: '護盾地面', layer: 'ground', hp: 180, shield: 240, speed: 75, reward: 14, category: 'shield', earliest: 6, marker: '圓形本體外圍一圈分段六角盾片' },
  { id: 'E05', name: '鑽地獸', type: '重裝地面', layer: 'ground', hp: 780, shield: 0, speed: 65, reward: 20, category: 'heavy', earliest: 5, marker: '前端鑽頭、左右對稱裝甲、後方履帶形輪廓' },
  { id: 'E06', name: '幽影潛行者', type: '隱匿地面', layer: 'ground', hp: 160, shield: 0, speed: 125, reward: 12, category: 'stealth', earliest: 8, marker: '細長菱形機體、外圈斷續虛線環、雙側刃翼' },
  { id: 'E07', name: '斥候無人機', type: '快速空中', layer: 'air', hp: 105, shield: 0, speed: 200, reward: 7, category: 'fast', earliest: 4, marker: '小型三角機身、三片旋翼標記、短尾焰' },
  { id: 'E08', name: '重型空艇', type: '高生命空中', layer: 'air', hp: 450, shield: 0, speed: 70, reward: 17, category: 'heavy', earliest: 5, marker: '大型橢圓機身、四個對稱引擎、中央裝甲脊' },
  { id: 'E09', name: '護盾浮游炮', type: '護盾空中', layer: 'air', hp: 160, shield: 220, speed: 90, reward: 16, category: 'shield', earliest: 9, marker: '中央圓核、外圍三個分離護盾環節點' },
  { id: 'E10', name: '分裂核心', type: '分裂型地面', layer: 'ground', hp: 240, shield: 0, speed: 80, reward: 11, category: 'split', earliest: 10, marker: '球形核心外附三片可分離三角外殼；死亡時生成 2 隻 E01，子體不提供擊敗獎勵' },
  { id: 'E11', name: '磁軌疾行者', type: '極速地面', layer: 'ground', hp: 105, shield: 0, speed: 220, reward: 7, category: 'fast', earliest: 7, marker: '尖銳三稜箭頭外殼、兩條平行磁軌尾痕' },
  { id: 'E12', name: '裝甲搬運獸', type: '重甲地面', layer: 'ground', hp: 920, shield: 0, speed: 45, reward: 21, category: 'heavy', earliest: 10, marker: '寬扁六足輪廓、背部雙層方形貨艙' },
  { id: 'E13', name: '相位滑翔機', type: '快速空中', layer: 'air', hp: 140, shield: 0, speed: 165, reward: 9, category: 'fast', earliest: 8, marker: 'V 形雙翼、機首圓環、兩個側翼光點' },
  { id: 'E14', name: '堅盾空艇', type: '護盾空中', layer: 'air', hp: 250, shield: 300, speed: 60, reward: 18, category: 'shield', earliest: 12, marker: '六角飛艇主艙、外側雙層六角盾環' },
  { id: 'E15', name: '影子裂變體', type: '隱匿地面', layer: 'ground', hp: 210, shield: 0, speed: 95, reward: 13, category: 'stealth', earliest: 13, marker: '雙菱形錯位機身、四角斷續投影；不分裂' },
  { id: 'E16', name: '裂核指揮機', type: '高生命地面', layer: 'ground', hp: 680, shield: 0, speed: 60, reward: 19, category: 'heavy', earliest: 15, marker: '八角形厚重指揮艙、中央大型垂直標記' },
];

export const ENEMY_BY_ID = Object.fromEntries(ENEMIES.map((e) => [e.id, e]));

/** 波次上限分類（規格第四節）：重型、快速、隱形 */
export const CAP_GROUPS = {
  heavy: ['E03', 'E05', 'E08', 'E12', 'E14', 'E16'],
  fast: ['E02', 'E07', 'E11', 'E13'],
  stealth: ['E06', 'E15'],
};
export const capLimit = (group, n) =>
  group === 'heavy' ? Math.floor(n / 3) : group === 'fast' ? Math.floor(n / 2) : Math.floor(n / 4);

/** 星級波次限制分類（規格第四節難度表）：護盾、隱形、分裂 */
export const isShield = (id) => ENEMY_BY_ID[id].shield > 0;
export const isStealth = (id) => CAP_GROUPS.stealth.includes(id);
export const isSplit = (id) => id === 'E10';
