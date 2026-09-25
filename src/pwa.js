// PWA：離線快取由 boot.js 註冊並更新；此處顯示狀態與「安裝為應用程式」按鈕。
import { t, onLangChange } from './i18n/index.js';

export function setupPwa({ installButton, statusEl }) {
  let offlineReady = false;
  const renderStatus = () => {
    if (statusEl && offlineReady) statusEl.textContent = t('ui.offlineReady');
  };
  onLangChange(renderStatus);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.ready.then(() => {
      offlineReady = true;
      renderStatus();
    });
  }
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    installButton.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installButton.hidden = true;
  });
}
