// PWA：註冊 Service Worker、顯示離線狀態、提供「安裝為應用程式」按鈕。
export function setupPwa({ installButton, statusEl }) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then(
      (reg) => {
        const ready = () => statusEl && (statusEl.textContent = '已可離線遊玩');
        if (reg.active) ready();
        else navigator.serviceWorker.ready.then(ready);
      },
      () => statusEl && (statusEl.textContent = ''),
    );
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
