// 進入點：重新整理頁面一律回到首頁，不保存或讀取任何對局進度（R13）。
import { App } from './ui/app.js';
import { setupPwa } from './pwa.js';
import { initI18n } from './i18n/index.js';

initI18n();
window.app = new App();
setupPwa({ installButton: document.querySelector('#btn-install'), statusEl: document.querySelector('#offline-state') });
