/*
 * DISCIPLINE TRACKER – SERVICE WORKER
 * ─────────────────────────────────────────────────────────────
 * HOW TO UPDATE THE VERSION:
 *   1. Change APP_VERSION below (e.g. "v4.2")
 *   2. Change CACHE_NAME to match (e.g. "discipline-tracker-v4-2")
 *   3. Save — the browser installs the new SW automatically
 *   4. The version text on the home screen updates automatically
 *      (index.html listens for the SW_VERSION message)
 * ─────────────────────────────────────────────────────────────
 */

const APP_VERSION = "v4.4";                     // ← ONLY change this when you update
const CACHE_NAME  = "discipline-tracker-v4-0";  // ← keep in sync with APP_VERSION

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./admin.html",
  "./history.html",
  "./stats.html",
  "./notifications.html",
  "./event-stats.html",
  "./debug.html"
];

/* ============================================================
   INSTALL – pre-cache the app shell
   ============================================================ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.warn("Cache failed (some assets missing):", err))
  );
  self.skipWaiting();
});

/* ============================================================
   ACTIVATE – delete old caches, broadcast version to all tabs
   ============================================================ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() =>
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
          .then(list => list.forEach(c =>
            c.postMessage({ type: "SW_VERSION", version: APP_VERSION })
          ))
      )
  );
  self.clients.claim();
});

/* ============================================================
   FETCH – cache-first for app shell
   ============================================================ */
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Network-first for CDN assets (Chart.js etc.)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for own files
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res && res.status === 200) {
          caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
        }
        return res;
      });
    })
  );
});

/* ============================================================
   PUSH – show notification (for future push server use)
   ============================================================ */
self.addEventListener("push", event => {
  let data = { title: "⏰ Discipline Tracker", body: "Time to act!", tag: "dt-push" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:               data.body,
      icon:               "assets/icon-192.png",
      badge:              "assets/icon-192.png",
      tag:                data.tag,
      renotify:           true,
      requireInteraction: true,
      silent:             false,
      vibrate:            [800, 200, 800, 200, 800, 200, 1200],
      data:               { url: "./" }
    })
  );
});

/* ============================================================
   NOTIFICATION CLICK
   ============================================================ */
self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ("focus" in client) {
          client.postMessage({ type: "PLAY_ALERT_SOUND", tag: event.notification.tag });
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow("./");
    })
  );
});

/* ============================================================
   MESSAGES FROM THE APP
   ============================================================ */
self.addEventListener("message", event => {
  if (!event.data) return;

  switch (event.data.type) {

    case "GET_VERSION":
      // App asking for current version → reply immediately
      if (event.source) {
        event.source.postMessage({ type: "SW_VERSION", version: APP_VERSION });
      }
      break;

    case "SCHEDULE_NOTIFICATIONS":
      // App sends timetable + waterInterval so SW can fire notifications
      // even when the app tab is closed/backgrounded.
      // Stored in SW memory for this session (cleared on SW restart).
      if (event.data.timetable) {
        scheduledTimetable  = event.data.timetable;
        scheduledWaterInterval = event.data.waterInterval || 60;
        scheduledDayStart   = event.data.dayStart || null;
        scheduledDayEnd     = event.data.dayEnd   || null;
        // Start the background checker if not already running
        startBackgroundChecker();
      }
      break;

    case "SCHEDULE_CHECK":
      // Notification fired in one tab → tell other tabs to play sound
      self.clients.matchAll({ type: "window" }).then(list => {
        list.forEach(c => {
          if (c !== event.source) {
            c.postMessage({ type: "PLAY_ALERT_SOUND", tag: event.data.tag });
          }
        });
      });
      break;

    case "NOTIFIED_KEY":
      // App tells SW which keys have already been notified (to avoid duplicates)
      if (event.data.key) notifiedKeys.add(event.data.key);
      break;
  }
});

/* ============================================================
   BACKGROUND NOTIFICATION SCHEDULER
   Fires water + event-start notifications when app is closed.
   Uses setInterval inside the SW (kept alive by periodic tasks).
   ============================================================ */

let scheduledTimetable     = [];
let scheduledWaterInterval = 60;
let scheduledDayStart      = null;
let scheduledDayEnd        = null;
let notifiedKeys           = new Set();
let bgCheckerInterval      = null;

function startBackgroundChecker() {
  if (bgCheckerInterval) return; // already running
  bgCheckerInterval = setInterval(runBackgroundCheck, 60 * 1000); // every 60s
  runBackgroundCheck(); // run immediately
}

async function runBackgroundCheck() {
  // If an app tab is visible/active, let it handle its own notifications
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const hasVisibleTab = tabs.some(t => t.visibilityState === "visible");
  if (hasVisibleTab) return;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayKey = now.toISOString().split("T")[0];

  /* ---- Event-start notifications ---- */
  for (const event of scheduledTimetable) {
    const startMin = toMin(event.start);
    const endMin   = toMin(event.end);

    // Fire when current minute matches event start minute (±1 min window)
    if (Math.abs(nowMin - startMin) <= 1) {
      const key = `${todayKey}_event_start_${event.name}`;
      if (!notifiedKeys.has(key)) {
        notifiedKeys.add(key);
        await self.registration.showNotification(`⏰ ${event.name}`, {
          body:               `Your scheduled event has started.`,
          icon:               "assets/icon-192.png",
          badge:              "assets/icon-192.png",
          tag:                key,
          renotify:           true,
          requireInteraction: true,
          silent:             false,
          vibrate:            [800, 200, 800, 200, 800, 200, 1200],
          data:               { url: "./" }
        });
        // Tell open (but bg) tabs to play sound when they become visible
        tabs.forEach(t => t.postMessage({ type: "PLAY_ALERT_SOUND", tag: key }));
      }
    }
  }

  /* ---- Water reminder notifications ---- */
  if (scheduledDayStart !== null && scheduledDayEnd !== null) {
    if (nowMin >= scheduledDayStart && nowMin < scheduledDayEnd) {
      const elapsed  = nowMin - scheduledDayStart;
      const slot     = Math.floor(elapsed / scheduledWaterInterval);
      const slotStart = scheduledDayStart + slot * scheduledWaterInterval;

      // Fire at the exact minute the slot starts (±1 min window)
      if (Math.abs(nowMin - slotStart) <= 1) {
        const key = `${todayKey}_water_${slot}`;
        if (!notifiedKeys.has(key)) {
          notifiedKeys.add(key);
          await self.registration.showNotification("💧 Drink Water", {
            body:               `Hydration reminder #${slot + 1}. Stay consistent!`,
            icon:               "assets/icon-192.png",
            badge:              "assets/icon-192.png",
            tag:                key,
            renotify:           true,
            requireInteraction: true,
            silent:             false,
            vibrate:            [800, 200, 800, 200, 800, 200, 1200],
            data:               { url: "./" }
          });
          tabs.forEach(t => t.postMessage({ type: "PLAY_ALERT_SOUND", tag: key }));
        }
      }
    }
  }
}

function toMin(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/* ============================================================
   PERIODIC BACKGROUND SYNC (Chrome Android)
   Wakes the SW to send a water reminder even when app is closed
   ============================================================ */
self.addEventListener("periodicsync", event => {
  if (event.tag === "water-check") {
    event.waitUntil(backgroundWaterCheck());
  }
});

async function backgroundWaterCheck() {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  if (list.length > 0) {
    list.forEach(c => c.postMessage({ type: "CHECK_WATER" }));
  } else {
    // No tab open – fire notification directly
    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const todayK = now.toISOString().split("T")[0];
    const slot   = scheduledDayStart !== null
      ? Math.floor((nowMin - scheduledDayStart) / scheduledWaterInterval)
      : 0;
    const key = `${todayK}_water_${slot}`;

    if (!notifiedKeys.has(key)) {
      notifiedKeys.add(key);
      await self.registration.showNotification("💧 Drink Water", {
        body:               "Your scheduled hydration reminder.",
        icon:               "assets/icon-192.png",
        badge:              "assets/icon-192.png",
        tag:                "water-bg",
        renotify:           true,
        requireInteraction: true,
        silent:             false,
        vibrate:            [800, 200, 800, 200, 800, 200, 1200]
      });
    }
  }
}
