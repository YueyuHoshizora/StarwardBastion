// PWA：離線快取由 boot.js 註冊並更新；此處顯示狀態與「安裝為應用程式」按鈕。
export function setupPwa({ installButton, statusEl }) {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.ready.then(() => {
      if (statusEl) statusEl.textContent = '已可離線遊玩';
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
