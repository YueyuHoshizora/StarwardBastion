// 語系只影響呈現；網址與瀏覽器偏好不進入決定性模擬。
import { UI_MESSAGES } from './ui.js';
import { CANVAS_MESSAGES } from './canvas.js';
import { DATA_MESSAGES } from './data.js';

export const LOCALES = {
  zh: { html: 'zh-Hant', og: 'zh_TW' },
  en: { html: 'en', og: 'en_US' },
  ja: { html: 'ja', og: 'ja_JP' },
  ko: { html: 'ko', og: 'ko_KR' },
};
const SITE = 'https://starward-bastion.yustellar.dev/';
const META = {
  zh: {
    name: '星域防線 Starward Bastion',
    title: '星域防線 Starward Bastion — 未來科技塔防',
    description: '守衛星際殖民地的能源核心！未來科技俯視塔防：20 張地圖、12 種防禦塔、16 種敵人、20 首原創 8-bit 音樂，桌面瀏覽器免安裝即玩。',
    image: '星域防線：俯視戰場上的道路、空中航道、防禦塔與能源核心',
  },
  en: {
    name: 'Starward Bastion',
    title: 'Starward Bastion — Sci-Fi Tower Defense',
    description: 'Defend your space colony’s energy core! Top-down sci-fi tower defense with 20 maps, 12 towers, 16 enemies and 20 original 8-bit tracks. Play in your desktop browser, no installation needed.',
    image: 'Starward Bastion: a top-down battlefield with roads, flight paths, defense towers and an energy core',
  },
  ja: {
    name: '星域防線 Starward Bastion',
    title: '星域防線 Starward Bastion — SFタワーディフェンス',
    description: '宇宙コロニーのエネルギーコアを守れ！20のマップ、12種のタワー、16種の敵、20曲のオリジナル8-bit音楽を備えた見下ろし型SFタワーディフェンス。PCブラウザーでインストール不要。',
    image: '星域防線：道路、飛行ルート、防衛タワー、エネルギーコアを見下ろす戦場',
  },
  ko: {
    name: '성역 방어선 Starward Bastion',
    title: '성역 방어선 Starward Bastion — SF 타워 디펜스',
    description: '우주 식민지의 에너지 코어를 지키세요! 맵 20개, 타워 12종, 적 16종, 오리지널 8비트 음악 20곡을 갖춘 탑다운 SF 타워 디펜스. 설치 없이 데스크톱 브라우저에서 플레이하세요.',
    image: '성역 방어선: 도로, 비행 경로, 방어 타워와 에너지 코어가 있는 탑다운 전장',
  },
};
export const MESSAGES = Object.fromEntries(Object.keys(LOCALES).map((lang) => [
  lang, { ...UI_MESSAGES[lang], ...CANVAS_MESSAGES[lang], ...DATA_MESSAGES[lang] },
]));
let language = 'en';
let initialized = false;
const listeners = new Set();
const supported = (lang) => Object.hasOwn(LOCALES, lang);

/** 明確的網址語系優先；沒有有效參數時預設英文。 */
export function resolveLang(url) {
  const explicit = new URL(url).searchParams.get('lang');
  return supported(explicit) ? explicit : 'en';
}

export function getLang() { return language; }

export function t(key, params = {}) {
  const text = MESSAGES[language][key];
  if (typeof text !== 'string') throw new Error(`缺少翻譯：${language}/${key}`);
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    if (!Object.hasOwn(params, name)) throw new Error(`缺少翻譯參數：${key}/${name}`);
    return String(params[name]);
  });
}

export function onLangChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function renderDocument() {
  document.documentElement.lang = LOCALES[language].html;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const attr of ['title', 'aria-label']) {
    for (const el of document.querySelectorAll(`[data-i18n-${attr}]`)) {
      el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`)));
    }
  }
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.setAttribute('aria-pressed', String(button.dataset.lang === language));
  }
  const meta = META[language];
  const canonical = `${SITE}?lang=${language}`;
  document.title = meta.title;
  document.querySelector('link[rel="canonical"]').href = canonical;
  const values = {
    'name:description': meta.description,
    'property:og:site_name': meta.name,
    'property:og:locale': LOCALES[language].og,
    'property:og:url': canonical,
    'property:og:title': meta.title,
    'property:og:description': meta.description,
    'property:og:image:alt': meta.image,
    'name:twitter:title': meta.title,
    'name:twitter:description': meta.description,
    'name:twitter:image:alt': meta.image,
    'name:apple-mobile-web-app-title': meta.name,
  };
  for (const [selector, value] of Object.entries(values)) {
    const colon = selector.indexOf(':');
    const attr = selector.slice(0, colon);
    const key = selector.slice(colon + 1);
    document.querySelector(`meta[${attr}="${key}"]`).content = value;
  }
}

function applyLanguage(next) {
  if (next === language) return;
  language = next;
  renderDocument();
  for (const listener of listeners) listener(language);
}

export function setLang(next) {
  if (!supported(next)) throw new RangeError(`不支援的語系：${next}`);
  const url = new URL(window.location.href);
  url.searchParams.set('lang', next);
  // 保留其他參數、錨點與呼叫端的 history.state；同一個網址不重複堆入歷史。
  if (url.href !== window.location.href) window.history.pushState(window.history.state, '', url);
  applyLanguage(next);
}

export function initI18n() {
  if (initialized) return;
  initialized = true;
  language = resolveLang(window.location.href);
  renderDocument();
  for (const button of document.querySelectorAll('[data-lang]')) {
    button.addEventListener('click', () => setLang(button.dataset.lang));
  }
  window.addEventListener('popstate', () => applyLanguage(resolveLang(window.location.href)));
}
