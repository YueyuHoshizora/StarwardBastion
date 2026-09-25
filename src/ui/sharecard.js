// 戰果分享卡（R12、UI10）：1200×675 PNG，只依凍結快照繪製，同一局重複下載內容一致。
import { drawMapStatic } from '../render/scene.js';
import { GRID_W, GRID_H } from '../core/mapgeom.js';
import { t } from '../i18n/index.js';

export const CARD_W = 1200;
export const CARD_H = 675;
const FONT = "system-ui, -apple-system, 'PingFang TC', 'Microsoft JhengHei', 'Noto Sans TC', sans-serif";

export function cardFilename(s) {
  return `Starward-Bastion_${s.mapId}_${s.result}_wave-${String(s.wave).padStart(2, '0')}.png`;
}

export const STAT_ROWS = (s) => [
  [t('card.stat.map'), `${s.mapId} ${t(`map.${s.mapId}.name`)}`],
  [t('card.stat.difficulty'), t('card.difficulty', { star: s.star })],
  [t('card.stat.result'), s.result === 'WIN' ? t('card.victory') : t('card.defeat')],
  [t('card.stat.wave'), `${s.wave} / 20`],
  [t('card.stat.kills'), `${s.kills}`],
  [t('card.stat.leaks'), `${s.leaks}`],
  [t('card.stat.baseHp'), `${s.baseHp} / 20`],
  [t('card.stat.towersBuilt'), `${s.towersBuilt}`],
  [t('card.stat.towerTypes'), `${s.towerTypes} / 12`],
];

function star(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#ffd76b';
    ctx.fill();
  } else {
    ctx.strokeStyle = '#8a7a45';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/** 於 1200×675 畫布繪製分享卡；game 用於地圖縮圖（只讀取靜態地圖資料）。 */
export function drawCard(canvas, s, game) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const win = s.result === 'WIN';
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  g.addColorStop(0, win ? '#0d2a3f' : '#2a0f1a');
  g.addColorStop(1, '#070b16');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = win ? '#5fd4ff' : '#ff6b6b';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, CARD_W - 24, CARD_H - 24);

  // 標題
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#e6ecff';
  ctx.font = `800 54px ${FONT}`;
  ctx.fillText(t('card.title'), 56, 96, 510);

  // 結果徽章：勝利＝勾、失敗＝叉（不只靠顏色）
  const bx = 56;
  const by = 166;
  ctx.fillStyle = win ? '#154d6e' : '#5c1a26';
  ctx.beginPath();
  ctx.roundRect(bx, by, 330, 84, 14);
  ctx.fill();
  ctx.strokeStyle = win ? '#8fe8ff' : '#ff9a9a';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (win) {
    ctx.moveTo(bx + 26, by + 44);
    ctx.lineTo(bx + 44, by + 62);
    ctx.lineTo(bx + 74, by + 24);
  } else {
    ctx.moveTo(bx + 28, by + 22);
    ctx.lineTo(bx + 70, by + 62);
    ctx.moveTo(bx + 70, by + 22);
    ctx.lineTo(bx + 28, by + 62);
  }
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(win ? t('card.victory') : t('card.defeat'), bx + 100, by + 56, 230);
  ctx.fillStyle = '#e6ecff';
  ctx.font = `700 32px ${FONT}`;
  ctx.fillText(`${s.mapId} ${t(`map.${s.mapId}.name`)}`, 56, 300, 520);
  for (let i = 0; i < 5; i++) star(ctx, 72 + i * 36, 330, 14, i < s.star);
  ctx.fillStyle = '#93a1c4';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText(t('card.difficulty', { star: s.star }), 72 + 5 * 36, 338, 310);

  // 統計（R12 全部欄位）
  const rows = STAT_ROWS(s).slice(3);
  const colX = [56, 330];
  rows.forEach(([k, v], i) => {
    const x = colX[i % 2];
    const y = 392 + Math.floor(i / 2) * 78;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.roundRect(x, y, 258, 66, 10);
    ctx.fill();
    ctx.fillStyle = '#93a1c4';
    ctx.font = `500 19px ${FONT}`;
    ctx.fillText(k, x + 16, y + 26, 226);
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 26px ${FONT}`;
    ctx.fillText(v, x + 16, y + 56, 226);
  });

  // 地圖縮圖
  const mx = 620;
  const my = 56;
  const mw = 524;
  const mh = (mw * GRID_H) / GRID_W;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 10);
  ctx.clip();
  ctx.translate(mx, my);
  ctx.scale(mw / GRID_W, mh / GRID_H);
  drawMapStatic(ctx, game, { mini: true });
  ctx.restore();
  ctx.strokeStyle = '#2a3a5e';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 10);
  ctx.stroke();

  ctx.fillStyle = '#93a1c4';
  ctx.font = `500 20px ${FONT}`;
  const theme = t(`map.${s.mapId}.theme`);
  wrap(ctx, theme, mx, my + mh + 40, mw, 28, 5);

  ctx.fillStyle = '#5f6d90';
  ctx.font = `500 18px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('starward-bastion.yustellar.dev', CARD_W - 56, CARD_H - 40);
  ctx.textAlign = 'left';
}

function wrap(ctx, text, x, y, maxW, lh, maxLines) {
  const words = text.includes(' ') ? text.split(/\s+/u) : [...text];
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line}${text.includes(' ') ? ' ' : ''}${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const fitted = lines.slice(0, maxLines);
    let last = fitted[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
    fitted[maxLines - 1] = `${last}…`;
    lines.length = 0;
    lines.push(...fitted);
  }
  lines.forEach((value, i) => ctx.fillText(value, x, y + i * lh, maxW));
}

/** 以瀏覽器下載 API 在本機生成 PNG；失敗時丟出錯誤由呼叫端顯示，不清除戰果。 */
export async function downloadCard(s, game) {
  const canvas = document.createElement('canvas');
  drawCard(canvas, s, game);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(Object.assign(new Error(t('card.error.png')), { code: 'PNG_ENCODING' }))), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cardFilename(s);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return a.download;
}
