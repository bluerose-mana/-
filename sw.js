self.addEventListener('install', (e) => {
  console.log('[Service Worker] インストール完了');
});

self.addEventListener('fetch', (e) => {
  // 今回は常にネットワークから最新データを取得するシンプルな設定
});