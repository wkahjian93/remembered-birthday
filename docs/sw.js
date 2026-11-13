// Shows the 定联 reminder pop-ups sent by the team server (Firebase Cloud Messaging), even when the app is closed.
// No caching here: the team server already tells phones to fetch the newest app every time.
const IOS = /iphone|ipad|ipod|macintosh/i.test(self.navigator.userAgent) && /safari/i.test(self.navigator.userAgent) && !/chrome|crios|android/i.test(self.navigator.userAgent);
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// App open on screen -> the app shows its own banner (no double pop-up). Closed, in the background or locked ->
// a normal phone notification. iPhone always gets the phone notification (Apple requires every push to show one).
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { data: { body: e.data ? e.data.text() : '' } }; }
  const n = p.notification || {}, d = p.data || {};
  const msg = { title: n.title || d.title || '定联 time', body: n.body || d.body || '', url: d.url || '#routine', tag: d.tag || 'dinglian' };
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const visible = list.filter(c => c.visibilityState === 'visible');
    visible.forEach(c => c.postMessage({ rePush: msg }));
    if (visible.length && !IOS) return;
    return self.registration.showNotification(msg.title, { body: msg.body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: msg.tag, renotify: true, data: { url: msg.url }, vibrate: [120, 60, 120] });
  }));
});

// Tapping the pop-up opens the app on the 定联 tab.
self.addEventListener('notificationclick', e => {
  const url = new URL('./' + ((e.notification.data || {}).url || '#routine'), self.registration.scope).href;
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
