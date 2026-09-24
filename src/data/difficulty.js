// 難度星級設定（規格第四節）。倍率以百分之一整數儲存，避免浮點誤差影響四捨五入。
export const DIFFICULTY = {
  1: { star: 1, hpPct: 100, speedPct: 100, buildPct: 55, maxTypes: 2 },
  2: { star: 2, hpPct: 115, speedPct: 105, buildPct: 50, maxTypes: 3 },
  3: { star: 3, hpPct: 130, speedPct: 110, buildPct: 45, maxTypes: 4 },
  4: { star: 4, hpPct: 150, speedPct: 115, buildPct: 40, maxTypes: 5 },
  5: { star: 5, hpPct: 175, speedPct: 120, buildPct: 35, maxTypes: 6 },
};

export const WAVES_PER_MAP = 20;
export const BASE_HP = 20;
export const START_CR = 550; // Gate B 平衡調整：初稿 240
export const WAVE_STIPEND_CR = 180; // Gate B 平衡調整：初稿 60

/** 每波主體敵人數 N(n)=6+⌊n/2⌋ */
export const waveSize = (n) => 6 + Math.floor(n / 2);

/** 波次倍率 W(n)=1+0.05×(n−1)，以百分之一整數回傳 */
export const waveMultPct = (n) => 100 + 5 * (n - 1);

/** round_half_up(base × 星級倍率 × W(n))，全程整數運算 */
export function scaledHp(base, star, n) {
  if (base === 0) return 0;
  const num = base * DIFFICULTY[star].hpPct * waveMultPct(n);
  return Math.floor((num + 5000) / 10000);
}

/** round_half_up(基礎移速 × 星級速度倍率, 2)；基礎移速以百分之一格／秒整數傳入 */
export function scaledSpeed(baseSpeedCenti, star) {
  const num = baseSpeedCenti * DIFFICULTY[star].speedPct;
  return Math.floor((num + 50) / 100) / 100;
}

/** 建塔可用格數＝round_half_up(比例 × 非道路非基地格數) */
export function buildableCount(star, denominator) {
  return Math.floor((DIFFICULTY[star].buildPct * denominator + 50) / 100);
}
