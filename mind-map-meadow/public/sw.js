// Service worker: makes the app installable and will carry the optional daily reminder.
// It deliberately caches nothing, so a deploy is never hidden behind a stale copy.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
