// 20 張地圖定義（規格第四節）。網格 28×16 格，每格 64px，戰場原生尺寸 1792×1024px。
// ground：地面路線（僅正交折線）；air：空中航道（正交或 45° 斜段）；base：基地 2×2 左上角。
// 每條路線最後一點位於基地內；每張圖至少一段空中航道與地面路線共用相鄰格線段。
// terrain：主題禁建地形；其餘超出星級可建比例的格子依距離路線遠近轉為邊陲荒地。
export const MAPS = [
  {
    id: 'M01', name: '新曙光環站', star: 1, theme: '殖民地環站外圍；單一路線、寬闊建塔區', palette: 'station',
    base: [24, 12],
    ground: [{ id: 'G1', points: [[0, 3], [22, 3], [22, 8], [5, 8], [5, 13], [24, 13]] }],
    air: [{ id: 'A1', points: [[16, 0], [16, 13], [24, 13]] }],
    terrain: [
      { kind: 'rect', x: 0, y: 10, w: 3, h: 3, look: 'hull' },
      { kind: 'rect', x: 25, y: 4, w: 3, h: 3, look: 'hull' },
    ],
  },
  {
    id: 'M02', name: '赤砂採掘場', star: 1, theme: '紅色行星礦區；直線與大型轉彎組合', palette: 'mars',
    base: [14, 7],
    ground: [{ id: 'G1', points: [[0, 4], [21, 4], [21, 12], [6, 12], [6, 8], [14, 8]] }],
    air: [{ id: 'A1', points: [[10, 0], [10, 8], [14, 8]] }],
    terrain: [
      { kind: 'disc', cx: 25, cy: 2.5, r: 2, look: 'pit' },
      { kind: 'disc', cx: 2.5, cy: 13.5, r: 2, look: 'pit' },
      { kind: 'rect', x: 16, y: 6, w: 2, h: 3, look: 'rock' },
    ],
  },
  {
    id: 'M03', name: '月背訊號谷', star: 1, theme: '月球陰影谷地；長直路段、少量交叉地形', palette: 'moon',
    base: [20, 2],
    ground: [{ id: 'G1', points: [[0, 1], [25, 1], [25, 6], [2, 6], [2, 11], [20, 11], [20, 3]] }],
    air: [{ id: 'A1', points: [[27, 9], [20, 9], [20, 3]] }],
    terrain: [
      { kind: 'line', points: [[4, 13], [8, 9]], look: 'ridge' },
      { kind: 'line', points: [[12, 15], [15, 12]], look: 'ridge' },
      { kind: 'rect', x: 10, y: 3, w: 2, h: 2, look: 'crater' },
    ],
  },
  {
    id: 'M04', name: '藍潮冰原', star: 1, theme: '冰封衛星表面；寬路、冰裂隙形成建塔限制', palette: 'ice',
    base: [24, 10],
    ground: [{ id: 'G1', width: 3, points: [[0, 4], [13, 4], [13, 11], [24, 11]] }],
    air: [{ id: 'A1', points: [[19, 0], [19, 11], [24, 11]] }],
    terrain: [
      { kind: 'line', points: [[3, 8], [7, 12]], look: 'crack' },
      { kind: 'line', points: [[8, 14], [11, 14]], look: 'crack' },
      { kind: 'line', points: [[16, 1], [16, 7]], look: 'crack' },
      { kind: 'line', points: [[22, 3], [25, 6]], look: 'crack' },
      { kind: 'line', points: [[4, 0], [8, 0]], look: 'crack' },
    ],
  },
  {
    id: 'M05', name: '雲端升降港', star: 2, theme: '高空物流港；地面路線與空中航道並行', palette: 'sky',
    base: [20, 12],
    ground: [{ id: 'G1', points: [[0, 3], [23, 3], [23, 8], [4, 8], [4, 13], [20, 13]] }],
    air: [{ id: 'A1', points: [[0, 1], [25, 1], [25, 10], [7, 10], [7, 13], [20, 13]] }],
    terrain: [
      { kind: 'rect', x: 0, y: 9, w: 2, h: 7, look: 'void' },
      { kind: 'rect', x: 26, y: 12, w: 2, h: 4, look: 'void' },
      { kind: 'rect', x: 12, y: 5, w: 3, h: 1, look: 'pad' },
    ],
  },
  {
    id: 'M06', name: '玻璃峽谷', star: 2, theme: '透明晶岩峽谷；多個連續彎道', palette: 'glass',
    base: [5, 13],
    ground: [{ id: 'G1', points: [[0, 2], [4, 2], [4, 7], [9, 7], [9, 2], [14, 2], [14, 7], [19, 7], [19, 2], [24, 2], [24, 11], [15, 11], [15, 14], [6, 14]] }],
    air: [{ id: 'A1', points: [[20, 0], [10, 10], [10, 14], [6, 14]] }],
    terrain: [
      { kind: 'rect', x: 26, y: 0, w: 2, h: 16, look: 'crystal' },
      { kind: 'disc', cx: 20.5, cy: 14, r: 1.6, look: 'crystal' },
      { kind: 'rect', x: 0, y: 9, w: 2, h: 3, look: 'crystal' },
    ],
  },
  {
    id: 'M07', name: '廢棄反應爐', star: 2, theme: '失控能源設施；中央禁建區切割路線', palette: 'reactor',
    base: [8, 6],
    ground: [{ id: 'G1', points: [[0, 2], [24, 2], [24, 13], [4, 13], [4, 7], [8, 7]] }],
    air: [{ id: 'A1', points: [[27, 15], [20, 8], [6, 8], [6, 7], [8, 7]] }],
    terrain: [
      { kind: 'rect', x: 11, y: 5, w: 8, h: 6, look: 'core' },
      { kind: 'rect', x: 14, y: 11, w: 2, h: 2, look: 'core' },
      { kind: 'rect', x: 14, y: 3, w: 2, h: 2, look: 'core' },
    ],
  },
  {
    id: 'M08', name: '藤蔓穹頂', star: 2, theme: '生態殖民穹頂；道路穿越多個圓形區塊', palette: 'bio',
    base: [25, 4],
    ground: [{ id: 'G1', points: [[0, 5], [10, 5], [10, 10], [19, 10], [19, 5], [25, 5]] }],
    air: [{ id: 'A1', points: [[14, 0], [19, 5], [25, 5]] }],
    terrain: [
      { kind: 'ring', cx: 5, cy: 5.5, r: 4, look: 'dome' },
      { kind: 'ring', cx: 14.5, cy: 10.5, r: 4, look: 'dome' },
      { kind: 'ring', cx: 22, cy: 5.5, r: 3.5, look: 'dome' },
    ],
  },
  {
    id: 'M09', name: '磁暴高原', star: 3, theme: '磁暴行星高原；多入口匯流至基地', palette: 'storm',
    base: [23, 7],
    ground: [
      { id: 'G1', points: [[0, 2], [10, 2], [10, 8], [23, 8]] },
      { id: 'G2', points: [[0, 13], [10, 13], [10, 8], [23, 8]] },
      { id: 'G3', points: [[17, 15], [17, 8], [23, 8]] },
    ],
    air: [{ id: 'A1', points: [[27, 0], [20, 7], [20, 8], [23, 8]] }],
    terrain: [
      { kind: 'rect', x: 4, y: 6, w: 2, h: 4, look: 'pylon' },
      { kind: 'rect', x: 14, y: 3, w: 2, h: 2, look: 'pylon' },
      { kind: 'rect', x: 21, y: 12, w: 2, h: 2, look: 'pylon' },
    ],
  },
  {
    id: 'M10', name: '雙月轉運站', star: 3, theme: '雙月軌道轉運設施；兩條路線交替接近基地', palette: 'station',
    base: [13, 7],
    ground: [
      { id: 'G1', points: [[0, 1], [25, 1], [25, 4], [3, 4], [3, 8], [13, 8]] },
      { id: 'G2', points: [[27, 14], [2, 14], [2, 11], [24, 11], [24, 8], [14, 8]] },
    ],
    air: [
      { id: 'A1', points: [[18, 0], [18, 8], [14, 8]] },
      { id: 'A2', points: [[9, 15], [9, 8], [13, 8]] },
    ],
    terrain: [
      { kind: 'disc', cx: 13.5, cy: 5.5, r: 1.2, look: 'hull' },
      { kind: 'rect', x: 26, y: 5, w: 2, h: 5, look: 'hull' },
    ],
  },
  {
    id: 'M11', name: '黑曜熔谷', star: 3, theme: '熔岩裂谷地表；可建塔平台分散且狹窄', palette: 'lava',
    base: [25, 5],
    ground: [{ id: 'G1', points: [[0, 7], [6, 7], [6, 2], [14, 2], [14, 13], [22, 13], [22, 6], [25, 6]] }],
    air: [{ id: 'A1', points: [[27, 15], [23, 11], [23, 6], [25, 6]] }],
    terrain: [
      { kind: 'rect', x: 8, y: 5, w: 4, h: 11, look: 'lava' },
      { kind: 'rect', x: 16, y: 0, w: 4, h: 11, look: 'lava' },
      { kind: 'rect', x: 0, y: 10, w: 5, h: 6, look: 'lava' },
      { kind: 'rect', x: 0, y: 0, w: 4, h: 4, look: 'lava' },
      { kind: 'rect', x: 24, y: 9, w: 2, h: 4, look: 'lava' },
    ],
  },
  {
    id: 'M12', name: '量子迷宮', star: 4, theme: '量子研究區；多岔路與交會點，實際敵人路線必須明確標示', palette: 'quantum',
    base: [25, 7],
    ground: [
      { id: 'G1', points: [[0, 7], [5, 7], [5, 2], [15, 2], [15, 7], [25, 7]] },
      { id: 'G2', points: [[0, 7], [5, 7], [5, 12], [15, 12], [15, 7], [25, 7]] },
      { id: 'G3', points: [[11, 15], [11, 12], [15, 12], [15, 7], [25, 7]] },
      { id: 'G4', points: [[10, 0], [10, 2], [15, 2], [15, 7], [25, 7]] },
    ],
    air: [{ id: 'A1', points: [[27, 15], [20, 8], [20, 7], [25, 7]] }],
    terrain: [
      { kind: 'rect', x: 8, y: 6, w: 3, h: 3, look: 'lab' },
      { kind: 'rect', x: 20, y: 2, w: 2, h: 2, look: 'lab' },
      { kind: 'rect', x: 20, y: 12, w: 2, h: 2, look: 'lab' },
    ],
  },
  {
    id: 'M13', name: '破碎環帶', star: 4, theme: '小行星基地群；多入口、長距離空中航道', palette: 'asteroid',
    base: [23, 9],
    ground: [
      { id: 'G1', points: [[0, 3], [8, 3], [8, 10], [23, 10]] },
      { id: 'G2', points: [[15, 0], [15, 10], [23, 10]] },
      { id: 'G3', points: [[0, 14], [8, 14], [8, 10], [23, 10]] },
    ],
    air: [{ id: 'A1', points: [[27, 15], [3, 15], [1, 13], [1, 1], [20, 1], [20, 10], [23, 10]] }],
    terrain: [
      { kind: 'disc', cx: 12, cy: 6, r: 1.5, look: 'asteroid' },
      { kind: 'disc', cx: 25.5, cy: 4, r: 2, look: 'asteroid' },
      { kind: 'disc', cx: 17.5, cy: 13.5, r: 1.2, look: 'asteroid' },
    ],
  },
  {
    id: 'M14', name: '深空船塢', star: 4, theme: '廢棄巨型船塢；狹長建塔區與多重轉彎', palette: 'dock',
    base: [20, 12],
    ground: [{ id: 'G1', points: [[0, 1], [25, 1], [25, 4], [2, 4], [2, 7], [25, 7], [25, 10], [2, 10], [2, 13], [20, 13]] }],
    air: [{ id: 'A1', points: [[27, 15], [15, 15], [15, 13], [20, 13]] }],
    terrain: [
      { kind: 'rect', x: 26, y: 0, w: 2, h: 12, look: 'gantry' },
      { kind: 'rect', x: 0, y: 11, w: 2, h: 5, look: 'gantry' },
    ],
  },
  {
    id: 'M15', name: '零點裂隙', star: 5, theme: '時空異常區；多入口、多路線與高空敵人混合進攻', palette: 'rift',
    base: [21, 7],
    ground: [
      { id: 'G1', points: [[0, 2], [12, 2], [12, 8], [21, 8]] },
      { id: 'G2', points: [[0, 13], [16, 13], [16, 8], [21, 8]] },
      { id: 'G3', points: [[27, 1], [21, 1], [21, 7]] },
      { id: 'G4', points: [[27, 14], [24, 14], [24, 8], [22, 8]] },
    ],
    air: [
      { id: 'A1', points: [[5, 0], [12, 7], [12, 8], [21, 8]] },
      { id: 'A2', points: [[27, 10], [24, 10], [24, 8], [22, 8]] },
      { id: 'A3', points: [[0, 9], [4, 13], [16, 13], [16, 8], [21, 8]] },
    ],
    terrain: [
      { kind: 'line', points: [[4, 5], [8, 9]], look: 'rift' },
      { kind: 'line', points: [[18, 3], [18, 6]], look: 'rift' },
      { kind: 'disc', cx: 8, cy: 15, r: 1.2, look: 'rift' },
    ],
  },
  {
    id: 'M16', name: '星核最後防線', star: 5, theme: '星核外圍要塞；多入口匯流、建塔空間受限、地空混合波次', palette: 'fortress',
    base: [18, 7],
    ground: [
      { id: 'G1', points: [[0, 1], [9, 1], [9, 8], [18, 8]] },
      { id: 'G2', points: [[0, 14], [9, 14], [9, 8], [18, 8]] },
      { id: 'G3', points: [[27, 2], [18, 2], [18, 7]] },
      { id: 'G4', points: [[27, 13], [19, 13], [19, 8]] },
    ],
    air: [
      { id: 'A1', points: [[13, 0], [13, 8], [18, 8]] },
      { id: 'A2', points: [[27, 10], [24, 13], [19, 13], [19, 8]] },
    ],
    terrain: [
      { kind: 'rect', x: 3, y: 4, w: 3, h: 2, look: 'wall' },
      { kind: 'rect', x: 3, y: 10, w: 3, h: 2, look: 'wall' },
      { kind: 'rect', x: 22, y: 6, w: 2, h: 4, look: 'wall' },
    ],
  },
  {
    id: 'M17', name: '光子裂谷', star: 3, theme: '光子採集區；雙入口平行路線與中央建塔帶', palette: 'photon',
    base: [23, 7],
    ground: [
      { id: 'G1', points: [[0, 3], [21, 3], [21, 7], [23, 7]] },
      { id: 'G2', points: [[0, 12], [21, 12], [21, 8], [23, 8]] },
    ],
    air: [{ id: 'A1', points: [[14, 15], [21, 8], [23, 8]] }],
    terrain: [
      { kind: 'rect', x: 4, y: 0, w: 6, h: 2, look: 'prism' },
      { kind: 'rect', x: 12, y: 14, w: 6, h: 2, look: 'prism' },
      { kind: 'rect', x: 25, y: 0, w: 3, h: 4, look: 'prism' },
    ],
  },
  {
    id: 'M18', name: '天環碎片場', star: 4, theme: '環形太空站殘骸；交錯地面通道與獨立空中航道', palette: 'debris',
    base: [23, 7],
    ground: [
      { id: 'G1', points: [[0, 4], [17, 4], [17, 8], [23, 8]] },
      { id: 'G2', points: [[7, 0], [7, 12], [21, 12], [21, 8], [23, 8]] },
    ],
    air: [{ id: 'A1', points: [[0, 14], [14, 14], [14, 12], [18, 12], [26, 4], [24, 6], [24, 7]] }],
    terrain: [
      { kind: 'line', points: [[1, 6], [4, 9]], look: 'debris' },
      { kind: 'rect', x: 10, y: 7, w: 3, h: 2, look: 'debris' },
      { kind: 'line', points: [[20, 0], [24, 0]], look: 'debris' },
    ],
  },
  {
    id: 'M19', name: '暗物質熔爐', star: 5, theme: '高能熔爐設施；三入口分流與稀疏建塔區', palette: 'furnace',
    base: [13, 13],
    ground: [
      { id: 'G1', points: [[0, 2], [7, 2], [7, 14], [13, 14]] },
      { id: 'G2', points: [[14, 0], [14, 4], [18, 4], [18, 10], [11, 10], [11, 14], [13, 14]] },
      { id: 'G3', points: [[27, 2], [22, 2], [22, 14], [14, 14]] },
    ],
    air: [
      { id: 'A1', points: [[0, 8], [6, 14], [13, 14]] },
      { id: 'A2', points: [[27, 8], [21, 14], [14, 14]] },
    ],
    terrain: [
      { kind: 'disc', cx: 12, cy: 6.5, r: 1.6, look: 'furnace' },
      { kind: 'rect', x: 24, y: 5, w: 3, h: 3, look: 'furnace' },
      { kind: 'rect', x: 1, y: 5, w: 3, h: 2, look: 'furnace' },
    ],
  },
  {
    id: 'M20', name: '終焉軌道', star: 5, theme: '軌道防禦網最後節點；多路匯流、地空協同進攻', palette: 'orbit',
    base: [13, 7],
    ground: [
      { id: 'G1', points: [[0, 1], [6, 1], [6, 8], [13, 8]] },
      { id: 'G2', points: [[27, 1], [21, 1], [21, 7], [14, 7]] },
      { id: 'G3', points: [[8, 15], [8, 12], [11, 12], [11, 8], [13, 8]] },
      { id: 'G4', points: [[27, 14], [19, 14], [19, 11], [14, 11], [14, 8]] },
    ],
    air: [
      { id: 'A1', points: [[0, 5], [3, 8], [13, 8]] },
      { id: 'A2', points: [[27, 4], [24, 7], [14, 7]] },
      { id: 'A3', points: [[14, 15], [14, 8]] },
    ],
    terrain: [
      { kind: 'disc', cx: 13.5, cy: 3.5, r: 1.5, look: 'relay' },
      { kind: 'rect', x: 1, y: 11, w: 3, h: 3, look: 'relay' },
      { kind: 'rect', x: 24, y: 9, w: 2, h: 2, look: 'relay' },
    ],
  },
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m]));
