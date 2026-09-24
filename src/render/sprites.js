// 俯視向量圖示：12 種塔頂輪廓與 16 種敵人輪廓（M4：不只依賴顏色）。
// 座標單位為格；塔以中心為原點、佔 [-1, 1]²；敵人以中心為原點、基準外框 1 格。
const TAU = Math.PI * 2;

export const TOWER_COLOR = {
  T01: '#7fd3ff', T02: '#9fa8ff', T03: '#ff9d5c', T04: '#ff6b6b', T05: '#a8f0ff', T06: '#ffe45c',
  T07: '#7dffb0', T08: '#5ce1c9', T09: '#c59bff', T10: '#ffc36b', T11: '#b0b8d0', T12: '#ff8ae0',
};

function poly(ctx, n, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fs(ctx, fill, stroke, lw = 0.05) {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

const DARK = '#141a2b';
const EDGE = '#0a0e18';

/**
 * 繪製塔頂。angle：朝向目標的角度（弧度）；pulse：0–1 發射後閃光。
 * plate=false 時不畫 2×2 佔地底板（選單圖示可用）。
 */
export function drawTower(ctx, id, angle = -Math.PI / 2, pulse = 0, plate = true) {
  const c = TOWER_COLOR[id];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (plate) {
    roundRect(ctx, -0.94, -0.94, 1.88, 1.88, 0.18);
    fs(ctx, '#1b2336', '#3a4a6a', 0.04);
  }
  const glow = pulse > 0 ? `rgba(255,255,255,${0.5 * pulse})` : null;
  switch (id) {
    case 'T01': // 圓形底座、中央單管炮口、炮管朝向目標旋轉
      circle(ctx, 0, 0, 0.72);
      fs(ctx, DARK, c, 0.08);
      ctx.save();
      ctx.rotate(angle);
      roundRect(ctx, 0, -0.12, 0.86, 0.24, 0.05);
      fs(ctx, c, EDGE, 0.04);
      circle(ctx, 0.86, 0, 0.1);
      fs(ctx, glow ?? '#e8f7ff');
      ctx.restore();
      circle(ctx, 0, 0, 0.26);
      fs(ctx, c, EDGE, 0.04);
      break;
    case 'T02': // 長矩形炮身、中央亮線、兩端對稱磁軌
      ctx.save();
      ctx.rotate(angle);
      roundRect(ctx, -0.82, -0.3, 1.64, 0.6, 0.08);
      fs(ctx, DARK, c, 0.07);
      for (const s of [-1, 1]) {
        roundRect(ctx, -0.9, s * 0.38 - 0.07, 0.42, 0.14, 0.04);
        fs(ctx, c);
        roundRect(ctx, 0.48, s * 0.38 - 0.07, 0.42, 0.14, 0.04);
        fs(ctx, c);
      }
      ctx.beginPath();
      ctx.moveTo(-0.7, 0);
      ctx.lineTo(0.9, 0);
      ctx.strokeStyle = glow ?? '#f2f4ff';
      ctx.lineWidth = 0.09;
      ctx.stroke();
      ctx.restore();
      break;
    case 'T03': // 六角形底座、中央大型圓形發射井、三片外伸散熱翼
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate(-Math.PI / 2 + (i * TAU) / 3);
        ctx.beginPath();
        ctx.moveTo(0.55, -0.16);
        ctx.lineTo(0.95, -0.1);
        ctx.lineTo(0.95, 0.1);
        ctx.lineTo(0.55, 0.16);
        ctx.closePath();
        fs(ctx, c, EDGE, 0.03);
        ctx.restore();
      }
      poly(ctx, 6, 0.7, Math.PI / 6);
      fs(ctx, DARK, c, 0.08);
      circle(ctx, 0, 0, 0.42);
      fs(ctx, '#05070d', c, 0.08);
      circle(ctx, 0, 0, 0.2);
      fs(ctx, glow ?? '#ff5a1f');
      break;
    case 'T04': // 三角形底座、中央細長透鏡、三條放射散熱槽
      poly(ctx, 3, 0.9, -Math.PI / 2);
      fs(ctx, DARK, c, 0.08);
      for (let i = 0; i < 3; i++) {
        const a = Math.PI / 2 + (i * TAU) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 0.2, Math.sin(a) * 0.2);
        ctx.lineTo(Math.cos(a) * 0.55, Math.sin(a) * 0.55);
        ctx.strokeStyle = c;
        ctx.lineWidth = 0.08;
        ctx.stroke();
      }
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(0.1, 0, 0.42, 0.11, 0, 0, TAU);
      fs(ctx, glow ?? '#ffd2d2', c, 0.04);
      ctx.restore();
      break;
    case 'T05': // 六角冰晶核心、六向短翼、外圈雷達波紋
      for (const r of [0.86, 0.72]) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) ctx.arc(0, 0, r, (i * TAU) / 6 + 0.25, ((i + 1) * TAU) / 6 - 0.25);
        ctx.strokeStyle = c;
        ctx.lineWidth = 0.035;
        ctx.setLineDash([0.12, 0.08]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / 6);
        ctx.beginPath();
        ctx.moveTo(0.3, -0.07);
        ctx.lineTo(0.58, 0);
        ctx.lineTo(0.3, 0.07);
        ctx.closePath();
        fs(ctx, c, EDGE, 0.02);
        ctx.restore();
      }
      poly(ctx, 6, 0.34, 0);
      fs(ctx, glow ?? '#e8fdff', c, 0.05);
      poly(ctx, 6, 0.16, Math.PI / 6);
      fs(ctx, c);
      break;
    case 'T06': { // 三個不等距電極環繞中央核心，呈三叉形
      const angs = [-Math.PI / 2, -Math.PI / 2 + 1.9, -Math.PI / 2 - 1.55];
      for (const a of angs) {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 0.66, Math.sin(a) * 0.66);
        ctx.strokeStyle = c;
        ctx.lineWidth = 0.1;
        ctx.stroke();
        circle(ctx, Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0.17);
        fs(ctx, DARK, c, 0.07);
      }
      circle(ctx, 0, 0, 0.3);
      fs(ctx, glow ?? '#fff6c2', c, 0.07);
      break;
    }
    case 'T07': // 四角十字底座、中央雷達盤、四枚飛彈艙
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / 4);
        ctx.rect(-0.22, -0.92, 0.44, 0.92);
        ctx.restore();
      }
      fs(ctx, DARK, c, 0.06);
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + (i * TAU) / 4;
        ctx.save();
        ctx.translate(Math.cos(a) * 0.52, Math.sin(a) * 0.52);
        ctx.rotate(a);
        roundRect(ctx, -0.15, -0.09, 0.3, 0.18, 0.08);
        fs(ctx, c, EDGE, 0.03);
        ctx.restore();
      }
      circle(ctx, 0, 0, 0.3);
      fs(ctx, '#0d2a1b', c, 0.06);
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0.3, 0);
      ctx.strokeStyle = glow ?? c;
      ctx.lineWidth = 0.06;
      ctx.stroke();
      ctx.restore();
      break;
    case 'T08': // 雙平行線圈、長方形炮口、兩側對稱線圈標記
      ctx.save();
      ctx.rotate(angle);
      for (const s of [-1, 1]) {
        roundRect(ctx, -0.7, s * 0.28 - 0.13, 1.3, 0.26, 0.06);
        fs(ctx, DARK, c, 0.05);
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.moveTo(-0.6 + i * 0.2, s * 0.28 - 0.12);
          ctx.lineTo(-0.6 + i * 0.2, s * 0.28 + 0.12);
          ctx.strokeStyle = c;
          ctx.lineWidth = 0.04;
          ctx.stroke();
        }
        roundRect(ctx, -0.2, s * 0.72 - 0.08, 0.4, 0.16, 0.05);
        fs(ctx, c);
      }
      ctx.beginPath();
      ctx.rect(0.6, -0.13, 0.3, 0.26);
      fs(ctx, glow ?? '#dffff8', c, 0.04);
      ctx.restore();
      break;
    case 'T09': // 四個外置發光節點包圍空心方形中心
      ctx.beginPath();
      ctx.rect(-0.38, -0.38, 0.76, 0.76);
      fs(ctx, null, c, 0.12);
      ctx.beginPath();
      ctx.rect(-0.2, -0.2, 0.4, 0.4);
      fs(ctx, null, c, 0.04);
      for (const [x, y] of [[-0.7, 0], [0.7, 0], [0, -0.7], [0, 0.7]]) {
        circle(ctx, x, y, 0.17);
        fs(ctx, glow ?? '#f0e3ff', c, 0.05);
      }
      break;
    case 'T10': // 中央六角巢艙、六個環狀停泊孔、外圈六片短翼
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / 6 + Math.PI / 6);
        ctx.beginPath();
        ctx.moveTo(0.72, -0.14);
        ctx.lineTo(0.94, 0);
        ctx.lineTo(0.72, 0.14);
        ctx.closePath();
        fs(ctx, c, EDGE, 0.02);
        ctx.restore();
      }
      poly(ctx, 6, 0.66, 0);
      fs(ctx, DARK, c, 0.05);
      for (let i = 0; i < 6; i++) {
        const a = (i * TAU) / 6 + Math.PI / 6;
        circle(ctx, Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0.1);
        fs(ctx, '#05070d', c, 0.04);
      }
      poly(ctx, 6, 0.24, 0);
      fs(ctx, glow ?? c, EDGE, 0.03);
      break;
    case 'T11': // 四個大型圓形錨點呈菱形排列，中央黑色圓井
      for (const [x, y] of [[0, -0.6], [0.6, 0], [0, 0.6], [-0.6, 0]]) {
        circle(ctx, x, y, 0.28);
        fs(ctx, DARK, c, 0.08);
        circle(ctx, x, y, 0.1);
        fs(ctx, c);
      }
      circle(ctx, 0, 0, 0.34);
      fs(ctx, '#000000', glow ?? '#6c63ff', 0.07);
      break;
    case 'T12': // 三角底座、中央菱形棱鏡、三道分叉光路刻線
      poly(ctx, 3, 0.9, Math.PI / 2);
      fs(ctx, DARK, c, 0.07);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * TAU) / 3;
        const bx = Math.cos(a) * 0.3;
        const by = Math.sin(a) * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(bx, by);
        ctx.moveTo(bx, by);
        ctx.lineTo(Math.cos(a - 0.35) * 0.55, Math.sin(a - 0.35) * 0.55);
        ctx.moveTo(bx, by);
        ctx.lineTo(Math.cos(a + 0.35) * 0.55, Math.sin(a + 0.35) * 0.55);
        ctx.strokeStyle = c;
        ctx.lineWidth = 0.04;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, -0.34);
      ctx.lineTo(0.2, 0);
      ctx.lineTo(0, 0.34);
      ctx.lineTo(-0.2, 0);
      ctx.closePath();
      fs(ctx, glow ?? '#ffe0f7', c, 0.05);
      break;
    default:
      throw new Error(`未知塔 ${id}`);
  }
  ctx.restore();
}

export const ENEMY_COLOR = {
  E01: '#e8ecf5', E02: '#d7f26b', E03: '#9aa6bd', E04: '#8fd6ff', E05: '#d7a15a', E06: '#b69cff',
  E07: '#f5f08a', E08: '#b9c3d9', E09: '#7fe0ff', E10: '#ff9ad0', E11: '#ffe06b', E12: '#c7b18a',
  E13: '#9cffd9', E14: '#a2c4ff', E15: '#d09cff', E16: '#ff7a7a',
};

/** 敵人在地圖上的相對大小（外框 1 格的比例） */
export const ENEMY_SCALE = {
  E01: 0.62, E02: 0.7, E03: 0.95, E04: 0.8, E05: 0.95, E06: 0.78, E07: 0.62, E08: 0.98,
  E09: 0.82, E10: 0.8, E11: 0.72, E12: 1.0, E13: 0.78, E14: 0.98, E15: 0.82, E16: 1.0,
};

/**
 * 繪製敵人。heading：行進方向（弧度），機首朝 +x。
 * shieldFrac：剩餘護盾比例（>0 時繪製對應數量的盾片）。
 */
export function drawEnemy(ctx, id, heading = 0, shieldFrac = 0, time = 0) {
  const c = ENEMY_COLOR[id];
  const s = ENEMY_SCALE[id];
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.rotate(heading);
  ctx.scale(s, s);
  const shieldSegs = (n, r) => {
    const k = Math.ceil(shieldFrac * n - 1e-9);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ctx.save();
      ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
      ctx.rotate(a);
      poly(ctx, 6, 0.1, 0);
      if (i < k) fs(ctx, '#6fd8ff', '#e6f9ff', 0.025);
      else fs(ctx, null, 'rgba(111,216,255,0.35)', 0.02);
      ctx.restore();
    }
  };
  switch (id) {
    case 'E01': // 小型圓形機體、單一中央紅色光眼、短尾焰
      ctx.beginPath();
      ctx.moveTo(-0.3, -0.1);
      ctx.lineTo(-0.52, 0);
      ctx.lineTo(-0.3, 0.1);
      fs(ctx, '#ff9a3c');
      circle(ctx, 0, 0, 0.34);
      fs(ctx, c, EDGE, 0.05);
      circle(ctx, 0.05, 0, 0.12);
      fs(ctx, '#ff2a2a', EDGE, 0.03);
      break;
    case 'E02': // 細長雙足剪影、前傾箭頭形機首、雙尾焰
      for (const y of [-0.16, 0.16]) {
        ctx.beginPath();
        ctx.moveTo(-0.3, y);
        ctx.lineTo(-0.5, y * 1.2);
        ctx.strokeStyle = '#ff9a3c';
        ctx.lineWidth = 0.07;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-0.22, y * 2.2);
        ctx.strokeStyle = c;
        ctx.lineWidth = 0.08;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0.5, 0);
      ctx.lineTo(-0.1, -0.2);
      ctx.lineTo(0.02, 0);
      ctx.lineTo(-0.1, 0.2);
      ctx.closePath();
      fs(ctx, c, EDGE, 0.04);
      break;
    case 'E03': // 大型方形裝甲外殼、四角裝甲板、中央艙門
      roundRect(ctx, -0.4, -0.4, 0.8, 0.8, 0.06);
      fs(ctx, c, EDGE, 0.05);
      for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.rect(x * 0.46 - 0.12, y * 0.46 - 0.12, 0.24, 0.24);
        fs(ctx, '#5a6478', EDGE, 0.04);
      }
      ctx.beginPath();
      ctx.rect(-0.16, -0.16, 0.32, 0.32);
      fs(ctx, '#39414f', '#e0e6f0', 0.04);
      ctx.beginPath();
      ctx.moveTo(0, -0.16);
      ctx.lineTo(0, 0.16);
      ctx.stroke();
      break;
    case 'E04': // 圓形本體外圍一圈分段六角盾片
      circle(ctx, 0, 0, 0.26);
      fs(ctx, c, EDGE, 0.05);
      circle(ctx, 0.06, 0, 0.08);
      fs(ctx, EDGE);
      shieldSegs(8, 0.42);
      break;
    case 'E05': // 前端鑽頭、左右對稱裝甲、後方履帶形輪廓
      for (const y of [-0.3, 0.3]) {
        roundRect(ctx, -0.48, y - 0.1, 0.62, 0.2, 0.08);
        fs(ctx, '#3b3f48', EDGE, 0.03);
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(-0.42 + i * 0.12, y - 0.1);
          ctx.lineTo(-0.42 + i * 0.12, y + 0.1);
          ctx.strokeStyle = '#8b8f99';
          ctx.lineWidth = 0.02;
          ctx.stroke();
        }
      }
      roundRect(ctx, -0.34, -0.24, 0.56, 0.48, 0.08);
      fs(ctx, c, EDGE, 0.04);
      ctx.beginPath();
      ctx.moveTo(0.22, -0.2);
      ctx.lineTo(0.55, 0);
      ctx.lineTo(0.22, 0.2);
      ctx.closePath();
      fs(ctx, '#e6e9ef', EDGE, 0.04);
      ctx.beginPath();
      ctx.moveTo(0.28, -0.1);
      ctx.lineTo(0.45, 0.04);
      ctx.moveTo(0.28, 0.08);
      ctx.lineTo(0.38, 0.16);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 0.025;
      ctx.stroke();
      break;
    case 'E06': // 細長菱形機體、外圈斷續虛線環、雙側刃翼
      circle(ctx, 0, 0, 0.5);
      ctx.setLineDash([0.1, 0.1]);
      fs(ctx, null, c, 0.04);
      ctx.setLineDash([]);
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0.05, 0);
        ctx.lineTo(-0.2, sy * 0.4);
        ctx.lineTo(-0.05, sy * 0.1);
        ctx.closePath();
        fs(ctx, '#7c64d6', EDGE, 0.03);
      }
      ctx.beginPath();
      ctx.moveTo(0.42, 0);
      ctx.lineTo(0, -0.1);
      ctx.lineTo(-0.36, 0);
      ctx.lineTo(0, 0.1);
      ctx.closePath();
      fs(ctx, c, EDGE, 0.04);
      break;
    case 'E07': // 小型三角機身、三片旋翼標記、短尾焰
      ctx.beginPath();
      ctx.moveTo(-0.28, -0.06);
      ctx.lineTo(-0.46, 0);
      ctx.lineTo(-0.28, 0.06);
      fs(ctx, '#ff9a3c');
      poly(ctx, 3, 0.3, 0);
      fs(ctx, c, EDGE, 0.04);
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        circle(ctx, Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.11);
        fs(ctx, null, '#fffbd0', 0.03);
        ctx.beginPath();
        const r = time * 30 + i;
        ctx.moveTo(Math.cos(a) * 0.32 + Math.cos(r) * 0.1, Math.sin(a) * 0.32 + Math.sin(r) * 0.1);
        ctx.lineTo(Math.cos(a) * 0.32 - Math.cos(r) * 0.1, Math.sin(a) * 0.32 - Math.sin(r) * 0.1);
        ctx.stroke();
      }
      break;
    case 'E08': // 大型橢圓機身、四個對稱引擎、中央裝甲脊
      for (const [x, y] of [[0.2, -0.34], [-0.2, -0.34], [0.2, 0.34], [-0.2, 0.34]]) {
        circle(ctx, x, y, 0.1);
        fs(ctx, '#5b6478', EDGE, 0.03);
        circle(ctx, x, y, 0.04);
        fs(ctx, '#ffb35c');
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 0.48, 0.28, 0, 0, TAU);
      fs(ctx, c, EDGE, 0.05);
      roundRect(ctx, -0.38, -0.06, 0.76, 0.12, 0.05);
      fs(ctx, '#626d85', EDGE, 0.03);
      break;
    case 'E09': // 中央圓核、外圍三個分離護盾環節點
      circle(ctx, 0, 0, 0.2);
      fs(ctx, c, EDGE, 0.04);
      circle(ctx, 0, 0, 0.08);
      fs(ctx, '#fff');
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3 + time * 1.5;
        const on = shieldFrac > i / 3 + 1e-9;
        ctx.beginPath();
        ctx.arc(0, 0, 0.38, a - 0.55, a + 0.55);
        ctx.strokeStyle = on ? '#6fd8ff' : 'rgba(111,216,255,0.3)';
        ctx.lineWidth = 0.08;
        ctx.stroke();
        circle(ctx, Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0.09);
        fs(ctx, on ? '#e6f9ff' : null, '#6fd8ff', 0.03);
      }
      break;
    case 'E10': // 球形核心外附三片可分離三角外殼
      for (let i = 0; i < 3; i++) {
        ctx.save();
        ctx.rotate((i * TAU) / 3);
        ctx.beginPath();
        ctx.moveTo(0.26, -0.2);
        ctx.lineTo(0.48, 0);
        ctx.lineTo(0.26, 0.2);
        ctx.closePath();
        fs(ctx, '#b4587f', EDGE, 0.035);
        ctx.restore();
      }
      circle(ctx, 0, 0, 0.26);
      fs(ctx, c, EDGE, 0.05);
      circle(ctx, -0.06, -0.06, 0.08);
      fs(ctx, 'rgba(255,255,255,0.7)');
      break;
    case 'E11': // 尖銳三稜箭頭外殼、兩條平行磁軌尾痕
      for (const y of [-0.13, 0.13]) {
        ctx.beginPath();
        ctx.moveTo(-0.14, y);
        ctx.lineTo(-0.55, y);
        ctx.strokeStyle = '#7ad7ff';
        ctx.lineWidth = 0.05;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0.52, 0);
      ctx.lineTo(-0.2, -0.24);
      ctx.lineTo(-0.2, 0.24);
      ctx.closePath();
      fs(ctx, c, EDGE, 0.04);
      ctx.beginPath();
      ctx.moveTo(0.52, 0);
      ctx.lineTo(-0.2, 0);
      ctx.strokeStyle = EDGE;
      ctx.lineWidth = 0.03;
      ctx.stroke();
      break;
    case 'E12': // 寬扁六足輪廓、背部雙層方形貨艙
      for (const x of [-0.26, 0, 0.26]) {
        for (const sy of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(x, sy * 0.2);
          ctx.lineTo(x + 0.08, sy * 0.48);
          ctx.strokeStyle = c;
          ctx.lineWidth = 0.07;
          ctx.stroke();
        }
      }
      roundRect(ctx, -0.46, -0.28, 0.92, 0.56, 0.12);
      fs(ctx, '#6f6048', EDGE, 0.05);
      roundRect(ctx, -0.3, -0.2, 0.6, 0.4, 0.04);
      fs(ctx, c, EDGE, 0.04);
      roundRect(ctx, -0.18, -0.12, 0.36, 0.24, 0.03);
      fs(ctx, '#e3d3b1', EDGE, 0.03);
      break;
    case 'E13': // V 形雙翼、機首圓環、兩個側翼光點
      ctx.beginPath();
      ctx.moveTo(0.28, 0);
      ctx.lineTo(-0.36, -0.44);
      ctx.lineTo(-0.2, 0);
      ctx.lineTo(-0.36, 0.44);
      ctx.closePath();
      fs(ctx, c, EDGE, 0.04);
      circle(ctx, 0.3, 0, 0.12);
      fs(ctx, null, '#fff', 0.05);
      for (const y of [-0.3, 0.3]) {
        circle(ctx, -0.24, y, 0.06);
        fs(ctx, '#ffffff');
      }
      break;
    case 'E14': // 六角飛艇主艙、外側雙層六角盾環
      poly(ctx, 6, 0.28, 0);
      fs(ctx, c, EDGE, 0.05);
      poly(ctx, 6, 0.12, 0);
      fs(ctx, '#4e6a9b');
      // 內外兩層盾環：護盾 >50% 兩層皆亮，>0 內層亮，破盾後兩層皆為淡色細線
      for (const [r, need] of [[0.4, 0], [0.48, 0.5]]) {
        const on = shieldFrac > need + 1e-9;
        poly(ctx, 6, r, 0);
        fs(ctx, null, on ? '#6fd8ff' : 'rgba(111,216,255,0.3)', on ? 0.05 : 0.025);
      }
      break;
    case 'E15': // 雙菱形錯位機身、四角斷續投影
      for (const [x, y] of [[-0.44, -0.44], [0.44, -0.44], [0.44, 0.44], [-0.44, 0.44]]) {
        ctx.beginPath();
        ctx.moveTo(x, y * 0.5);
        ctx.lineTo(x, y);
        ctx.lineTo(x * 0.5, y);
        ctx.setLineDash([0.06, 0.06]);
        fs(ctx, null, c, 0.04);
        ctx.setLineDash([]);
      }
      for (const [ox, oy, col] of [[-0.08, -0.08, '#8c62d9'], [0.08, 0.08, c]]) {
        ctx.beginPath();
        ctx.moveTo(ox + 0.32, oy);
        ctx.lineTo(ox, oy - 0.2);
        ctx.lineTo(ox - 0.32, oy);
        ctx.lineTo(ox, oy + 0.2);
        ctx.closePath();
        fs(ctx, col, EDGE, 0.035);
      }
      break;
    case 'E16': // 八角形厚重指揮艙、中央大型垂直標記
      poly(ctx, 8, 0.48, Math.PI / 8);
      fs(ctx, '#7a3434', EDGE, 0.06);
      poly(ctx, 8, 0.36, Math.PI / 8);
      fs(ctx, c, EDGE, 0.04);
      ctx.rotate(-heading);
      roundRect(ctx, -0.07, -0.3, 0.14, 0.6, 0.03);
      fs(ctx, '#fff2f2', EDGE, 0.03);
      break;
    default:
      throw new Error(`未知敵人 ${id}`);
  }
  ctx.restore();
}
