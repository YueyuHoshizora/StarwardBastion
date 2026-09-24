// 先完成 Service Worker 更新，再載入遊戲，避免舊工作者忽略 ?hash 而回傳舊模組。
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  try {
    const reg = await navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { updateViaCache: 'none' });
    const worker = reg.installing || reg.waiting || reg.active;
    if (worker && worker.state !== 'activated') {
      await new Promise((resolve, reject) => {
        const changed = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            worker.removeEventListener('statechange', changed);
            if (worker.state === 'activated') resolve();
            else reject(new Error('離線資源更新未完成'));
          }
        };
        worker.addEventListener('statechange', changed);
        changed();
      });
    }
  } catch (error) {
    // 不支援離線快取或網路暫時不可用時，仍嘗試載入遊戲。
    console.warn('離線快取未就緒：', error);
  }
}
// CSS 同樣等舊快取退出後才載入，避免第一次升級仍套用舊樣式。
const style = document.querySelector('link[rel="stylesheet"][data-href]');
await new Promise((resolve) => {
  style.onload = style.onerror = resolve;
  style.href = style.dataset.href;
});
await import('./main.js');
