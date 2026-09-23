const CACHE = "app-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/"])));
  self.skipWaiting();
});

self.addEventListener("activate", () => self.clients.claim());

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then(res => { const clone = res.clone(); caches.open(CACHE).then(c => c.put(e.request, clone)); return res; })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener("push", (e) => {
  let data = { title: "Notification", body: "" };
  try { data = e.data?.json() ?? data; } catch { /* use defaults */ }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/favicon.svg",
      badge: "/favicon.svg",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow("/");
    })
  );
});
