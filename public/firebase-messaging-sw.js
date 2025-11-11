/* eslint-disable no-undef */
self.addEventListener('push', (event) => {
  console.log('[SW] push event:', event);  // ← 이 로그가 찍히는지 확인
  if (!event.data) return;
  const data = event.data.json();
  const title = data.notification?.title || '알림';
  const options = {
    body: data.notification?.body,
    icon: data.notification?.icon || '/icons/icon-192x192.png',
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.clickUrl || "/";
  event.waitUntil(clients.openWindow(url));
});
