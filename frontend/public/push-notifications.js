self.addEventListener('push', (event) => {
  const payload = event.data
    ? event.data.json()
    : { title: 'Relay', body: 'Your workout video is ready.', url: '/' };
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: payload.tag || undefined,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find(
        (windowClient) => new URL(windowClient.url).origin === location.origin,
      );
      if (!existing) return clients.openWindow(event.notification.data.url);
      return existing
        .focus()
        .then((windowClient) => windowClient.navigate(event.notification.data.url));
    }),
  );
});
