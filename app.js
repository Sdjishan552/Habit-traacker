/*************************************************
 * DISCIPLINE TRACKER – STABLE & MANUAL START
 *************************************************/

/* ========= NOTIFICATIONS ========= */
function requestNotificationPermission() {
  if ("Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission().then(permission => {
        if (permission === "granted") {
          console.log("Notification permission granted.");
        } else {
          console.log("Notification permission denied.");
        }
      });
    } else if (Notification.permission === "granted") {
      console.log("Notification permission already granted.");
    } else {
      console.log("Notification permission denied.");
    }
  } else {
    console.log("Notifications not supported in this browser.");
  }
}

function notify(title, body, tagKey = "default-tag") {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const options = {
    body: body,
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    vibrate: [600, 300, 600, 300, 600], // 3 strong vibration pulses
    requireInteraction: true,          // stays until dismissed
    tag: tagKey,
    renotify: true
  };

  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, options);
    });
  } else {
    new Notification(title, options);
  }
}



/* ========= SOUND ALERT ========= */
/* ========= SOUND ALERT ========= */

let soundPlayedForSlot = null;

// Create reusable base sound
const baseBeep = new Audio("data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==");
baseBeep.preload = "auto";

function playAlertSound(slotKey) {
  if (soundPlayedForSlot === slotKey) return;

  let count = 0;

  function playBeep() {
    const beep = baseBeep.cloneNode(); // clone for reliable replay
    beep.play().catch(() => {});
    count++;

    if (count < 3) {
      setTimeout(playBeep, 1500); // slightly longer gap
    } else {
      soundPlayedForSlot = slotKey;
    }
  }

  playBeep();
}

function playAlertSound(slotKey) {
  if (soundPlayedForSlot === slotKey) return;

  // ✅ OFFLINE SOUND - No internet required!
  const audio = new Audio("data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==");

  let count = 0;
  const playThreeTimes = () => {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    console.log("Playing alert sound for slot: " + slotKey);  // ← debug log

    count++;
    if (count < 3) {
      setTimeout(playThreeTimes, 1200); // ~1.2 seconds between beeps
    } else {
      soundPlayedForSlot = slotKey;
    }
  };

  playThreeTimes();
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 || 12;
  return `${hour12.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")} ${ampm}`;
}
/* ========= HELPERS ========= */
function toMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function formatNow() {
  return new Date().toLocaleString();
}

function todayKey() {
  return new Date().toISOString().split("T")[0];
}

/* ========= STORAGE ========= */
function getLog() {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch (err) {
    console.error("Log corrupted. Resetting.", err);
    localStorage.removeItem(todayKey());
    return [];
  }
}


function saveLog(log) {
  localStorage.setItem(todayKey(), JSON.stringify(log));
}

/* ========= TIMETABLE ========= */
function getTimetable() {
  try {
    const raw = localStorage.getItem("timetable");
    if (!raw) return [];

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) return [];

    return data.filter(e => {
      if (!e || typeof e.start !== "string" || typeof e.end !== "string" || !e.name) return false;

      // Only allow correct time format like 08:00 or 14:30
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(e.start) || !timeRegex.test(e.end)) return false;

      const startMin = toMinutes(e.start);
      const endMin = toMinutes(e.end);
      return !isNaN(startMin) && !isNaN(endMin) && startMin < endMin;
    });

  } catch (err) {
    console.error("Timetable corrupted. Resetting.", err);
    localStorage.removeItem("timetable");
    return [];
  }
}


/* ========= CURRENT EVENT ========= */
function getCurrentMainEvent() {
  const now = nowMinutes();
  const timetable = getTimetable();   // ✅ Use validated timetable

  return timetable.filter(e => {
    const start = toMinutes(e.start);
    const end = toMinutes(e.end);
    return now >= start && now < end;
  });
}



/* ========= HYDRATION (ONLY AFTER START) ========= */


// Helper function – put this OUTSIDE of render(), for example right after render() ends
function handleStartClick() {
  console.log("▶️ [APK DEBUG] Start button CLICKED!");
  const name     = this.dataset.name;
  const start    = this.dataset.start;
  const phase    = Number(this.dataset.phase) || 0;
  const severity = Number(this.dataset.severity) || 1;
  console.log("▶️ [APK DEBUG] Event:", name, "| Phase:", phase);
  
  startMainEvent(name, start, phase, severity);
}

function handleWaterClick() {
  console.log("💧 [APK DEBUG] Water button CLICKED!");
  const slot = Number(this.dataset.slot);
  const startMinute = Number(this.dataset.start);
  console.log("💧 [APK DEBUG] Slot:", slot, "| Start:", startMinute);
  markWater(slot, startMinute);
}

// ──────────────────────────────────────────────
// ✅ FIXED RENDER FUNCTION - BOTH WATER & EVENT CARDS WORK TOGETHER
// ──────────────────────────────────────────────
function render() {
  try {
    syncLogsWithTimetable();

    const container = document.getElementById("mainContainer");
    const phaseInfo = document.getElementById("phaseInfo");

    if (!container) {
        console.error("mainContainer not found in HTML");
        return;
    }

    container.innerHTML = ""; // clear old content
    
    const activeEvents = getCurrentMainEvent();
    const log = getLog();
    const waterInfo = shouldShowWaterReminder();

    // ✅ FIX 1: Always update phase header, even if no events
    if (phaseInfo) {
      if (activeEvents.length === 0) {
        phaseInfo.innerText = "No Active Phase";
      } else {
        const phases = [...new Set(
          activeEvents.map(e => e.phase || "Unknown").filter(p => p !== "Unknown")
        )];
        phaseInfo.innerText = phases.length > 0 
          ? `Phase ${phases.join(", ")}` 
          : "Active Event";
      }
    }

    // ✅ FIX 2: Water card - ALWAYS shows every 60 minutes
    if (waterInfo) {
        const waterCard = document.createElement("div");
        waterCard.className = "card water-card";
        waterCard.innerHTML = `
            <h2>💧 Drink Water (Hour ${waterInfo.slot + 1})</h2>
            <p>${formatNow()}</p>
            <button class="water-btn"
                    data-slot="${waterInfo.slot}"
                    data-start="${waterInfo.startMinute}">
                ✔ Done
            </button>
        `;
        container.appendChild(waterCard);

        // Add notification and sound (only once per slot)
        const slotKey = `${todayKey()}_water_${waterInfo.slot}`;
        if (!localStorage.getItem("notified_" + slotKey)) {
            notify(
  "💧 Drink Water",
  "Time for your hourly hydration!",
  slotKey
);

            localStorage.setItem("notified_" + slotKey, "yes");
            playAlertSound(slotKey);

        }
    }

    // ✅ FIX 3: Event cards - render ALL active events
    activeEvents.forEach(event => {
      const entry = log.find(e => e.name === event.name);
      const entryStatus = entry 
        ? (entry.score === null 
            ? "🟢 Started | Score: Pending" 
            : `✅ Completed | Score: ${entry.score}`)
        : '';

      const eventCard = document.createElement("div");
      eventCard.className = "card event-card";

      eventCard.innerHTML = `
        <h2>${event.name || "Unnamed Event"}</h2>
        <p>${formatNow()}</p>
        <p>${minutesToTime(toMinutes(event.start))} – ${minutesToTime(toMinutes(event.end))}</p>
        <p>Severity: ${event.severity || 3}</p>
        ${entryStatus ? `<p>${entryStatus}</p>` : ''}
        ${!entry ? `
          <button class="start-btn" 
                  data-name="${event.name}" 
                  data-start="${event.start}" 
                  data-phase="${event.phase || 1}" 
                  data-severity="${event.severity || 3}">
            ▶ Start Event
          </button>
        ` : entry.score === null ? `
          <p class="status">In Progress – Finish before ${minutesToTime(toMinutes(event.end))}</p>
        ` : ''}
      `;

      container.appendChild(eventCard);

      
    });

    // ✅ CRITICAL FIX: Attach ALL event listeners AFTER all cards are created
    // This ensures buttons work even after water card is clicked
    attachAllEventListeners();

    // Debug log
    console.log("Rendered - Water:", waterInfo ? "YES" : "NO", "| Events:", activeEvents.length);

  } catch (err) {
    console.error("Error in render():", err);
  }
}

// ✅ NEW FUNCTION: Attach event listeners to ALL buttons
function attachAllEventListeners() {
  // Attach water button listeners
  const waterBtns = document.querySelectorAll('.water-btn');
  console.log("🔧 [APK DEBUG] Attaching water buttons:", waterBtns.length);
  waterBtns.forEach((btn, index) => {
    btn.addEventListener('click', handleWaterClick);
    console.log(`   → Water button ${index} attached`);
  });

  // Attach event start button listeners
  const startBtns = document.querySelectorAll('.start-btn');
  console.log("🔧 [APK DEBUG] Attaching start buttons:", startBtns.length);
  startBtns.forEach((btn, index) => {
    btn.addEventListener('click', handleStartClick);
    console.log(`   → Start button ${index} attached`);
  });
  
  console.log("✅ [APK DEBUG] All event listeners attached successfully");
}

/* ========= START MAIN EVENT ========= */
function startMainEvent(name, start, phase, severity) {
  const delay = Math.max(0, nowMinutes() - toMinutes(start));
  const log = getLog();

  if (log.some(e => e.name === name)) {
    console.log("Event already started:", name);
    render();
    return;
  }

  const slotKey = `${todayKey()}_${name}`;
  if (!localStorage.getItem("notified_" + slotKey)) {
    notify("Event Started", name);
    localStorage.setItem("notified_" + slotKey, "yes");
  }
  playAlertSound(slotKey);

  log.push({


    name,
    phase,
    severity,
    delay,
    score: null,
    started: formatNow()
  });

  saveLog(log);
  render();
}

/* ========= FINALIZE MAIN EVENT ========= */
function finalizeMainEvent(entry) {
  const severityMultiplier = entry.severity || 1;
  const rawScore = Math.max(0, 10 - entry.delay);
  entry.score = Math.round(rawScore * severityMultiplier);

  if (entry.delay > 0) {
    notify(
      "Event Auto-Finished",
      `${entry.name} – Score: ${entry.score}`
    );
  }

  saveLog(getLog());
}

function autoMiss() {
  const now = nowMinutes();
  const timetable = getTimetable();
  const log = getLog();

  timetable.forEach(event => {
    const startMin = toMinutes(event.start);
    const endMin = toMinutes(event.end);
    const entry = log.find(e => e.name === event.name);

    const slotKey = `${todayKey()}_${event.name}_start`;

    // ✅ NEW: Auto notify when event start time arrives
    if (now >= startMin && now < endMin && !entry) {
      if (!localStorage.getItem("notified_" + slotKey)) {

        notify(
          "⏰ Event Started",
          `${event.name} has started`,
          slotKey
        );

        playAlertSound(slotKey);

        localStorage.setItem("notified_" + slotKey, "yes");
      }
    }

    // Existing Auto Miss Logic
    if (now >= endMin && !entry) {
      log.push({
        name: event.name,
        phase: event.phase,
        severity: event.severity,
        delay: 999,
        score: 0,
        autoMissed: true
      });
    }

    if (entry && entry.started && entry.score === null && now >= endMin) {
      finalizeMainEvent(entry);
    }
  });

  saveLog(log);
}

  
  // Penalize ignored hydration slots at end of day
  const dayStart = getDayStartMinute();
  const dayEnd = getDayEndMinute();
  if (dayStart !== null && dayEnd !== null && now >= dayEnd) {
    const totalSlots = Math.floor((dayEnd - dayStart) / 60);
    let updated = false;
    for (let s = 0; s <= totalSlots; s++) {
      const alreadyLogged = log.some(e => e.name === "Drink Water" && e.slot === s);
      if (!alreadyLogged) {
        log.push({
          name: "Drink Water",
          parent: "Daily Hydration",
          slot: s,
          phase: "hydration",
          severity: 1,
          delay: 999,
          score: 0
        });
        updated = true;
      }
    }
    if (updated) saveLog(log);
  }
}

document.addEventListener("DOMContentLoaded", () => {

  // NAV BUTTONS
  const historyBtn = document.getElementById("historyBtn");
  const statsBtn = document.getElementById("statsBtn");

  if (historyBtn) {
    historyBtn.onclick = () => {
      window.location.href = "history.html";
    };
  }

  if (statsBtn) {
    statsBtn.onclick = () => {
      window.location.href = "stats.html";
    };
  }

  // INIT
  requestNotificationPermission();
  updateLiveUI();
  loadCountdownDate();
  updateExamCountdown();
  setInterval(updateExamCountdown, 1000);

  setInterval(updateLiveUI, 15 * 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      updateLiveUI();
    }
  });

  // ✅ FIXED: Changed from location.reload() to updateLiveUI()
  // This prevents infinite reload loop in APK version
  window.addEventListener("focus", () => {
    updateLiveUI();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "timetable" || e.key === "timetableUpdated") {
      updateLiveUI();
    }
  });

});

/* ========= INIT ========= */



function updateLiveClock() {
  const clock = document.getElementById("liveClock");
  if (!clock) return;

  const now = new Date();
  clock.innerHTML = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

// start live clock
updateLiveClock();
setInterval(updateLiveClock, 1000);

function syncLogsWithTimetable() {
  const timetable = getTimetable();
  const validNames = timetable.map(e => e.name);

  const log = getLog();
  const cleaned = log.filter(e =>
  e.phase === "micro" ||
  e.phase === "hydration" ||
  validNames.includes(e.name)
);


  if (cleaned.length !== log.length) {
    saveLog(cleaned);
  }
}

// ================= TIMETABLE-BASED HYDRATION & DAY BOUNDARY =================

function getDayStartMinute() {
  const tt = getTimetable();
  if (tt.length === 0) return null;

  const starts = tt.map(e => toMinutes(e.start)).filter(n => !isNaN(n));
  if (starts.length === 0) return null;

  return Math.min(...starts);
}

function getDayEndMinute() {
  const tt = getTimetable();
  if (tt.length === 0) return null;

  const ends = tt.map(e => toMinutes(e.end)).filter(n => !isNaN(n));
  if (ends.length === 0) return null;

  return Math.max(...ends);
}

function getCurrentWaterSlot() {
  const dayStart = getDayStartMinute();
  if (dayStart === null) return null;

  const now = nowMinutes();
  if (now < dayStart) return null;

  const elapsed = now - dayStart;
  return Math.floor(elapsed / 60);
}

function shouldShowWaterReminder() {
  const dayStart = getDayStartMinute();
  if (dayStart === null) return null;

  const now = nowMinutes();
  if (now < dayStart) return null;

  const dayEnd = getDayEndMinute();
  if (dayEnd !== null && now >= dayEnd) return null;

  const elapsed = now - dayStart;

  // Slot 0 = first event start time
  const slot = Math.floor(elapsed / 60);

  const log = getLog();

  // Penalize ALL previous missed slots
  for (let s = 0; s < slot; s++) {
    const alreadyLogged = log.some(
      e => e.name === "Drink Water" && e.slot === s
    );
    if (!alreadyLogged) {
      log.push({
        name: "Drink Water",
        parent: "Daily Hydration",
        slot: s,
        phase: "hydration",
        severity: 1,
        delay: 999,
        score: 0
      });
    }
  }
  if (slot > 0) saveLog(log);

  // Show reminder only if current slot not logged
  const currentLogged = log.some(
    e => e.name === "Drink Water" && e.slot === slot
  );

  if (currentLogged) return null;

  const startMin = dayStart + slot * 60;

  return { slot, startMinute: startMin };
}



function markWaterDone(slot) {
  render();
}

function markWater(slot, startMinute) {
  const log = getLog();
  console.log("Marking water as done for slot: " + slot);

  // Prevent duplicate logging for same slot
  const alreadyLogged = log.some(
    e => e.name === "Drink Water" && e.slot === slot
  );

  if (alreadyLogged) {
    render();
    return;
  }

  const delay = Math.max(0, nowMinutes() - startMinute);
  const score = delay <= 15 ? 10 - delay : 0;

  log.push({
    name: "Drink Water",
    parent: "Daily Hydration",
    slot,
    phase: "hydration",
    severity: 1,
    delay,
    score
  });

  saveLog(log);
  render();
}


// ──────────────────────────────────────────────
// LIVE UPDATES – clock + events + hydration + auto-miss
// ──────────────────────────────────────────────

function updateLiveUI() {
    updateLiveClock();     // refresh clock
    autoMiss();            // check for missed/ended events
    render();
    updateHomeStreak();   // ← ADD THIS LINE
// update screen
}


// Helper to calculate total unique scheduled minutes from timetable (merges overlaps)
function getTotalUniqueScheduledMinutes(tt) {
  if (tt.length === 0) return 0;

  // Sort events by start time
  const events = tt.slice().sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  let total = 0;
  let currentStart = toMinutes(events[0].start);
  let currentEnd = toMinutes(events[0].end);

  for (let i = 1; i < events.length; i++) {
    const start = toMinutes(events[i].start);
    const end = toMinutes(events[i].end);

    if (start >= currentEnd) {
      // No overlap, add previous duration
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else {
      // Overlap, extend end if needed
      currentEnd = Math.max(currentEnd, end);
    }
  }

  // Add the last interval
  total += currentEnd - currentStart;

  return total;
}
/* ========= DYNAMIC COUNTDOWN ========= */

let countdownTarget = null;


function loadCountdownDate() {
  const saved = localStorage.getItem("countdownTarget");
  if (saved) {
    countdownTarget = new Date(saved);
  }
}

function updateExamCountdown() {
  const countdownElement = document.getElementById("examCountdown");
  if (!countdownElement) return;

  if (!countdownTarget) {
    countdownElement.innerHTML = "⏳ No countdown set";
    return;
  }

  const now = new Date();
  const diff = countdownTarget - now;

  if (diff <= 0) {
    countdownElement.innerHTML = "🎉 Countdown Completed!";
    return;
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  countdownElement.innerHTML =
    `🎯 ${days}d ${hours}h ${minutes}m ${seconds}s`;
}



/* ================= HOME DISCIPLINE STREAK ================= */

function calculateDisciplinePercent(log) {
  let max = 0, got = 0;

  log.forEach(e => {
    if (e.phase === "micro" || e.phase === "hydration") return;
    const score = e.score !== null ? e.score : (e.started ? e.severity * 10 : 0);
    max += e.severity * 10;
    got += score;
  });

  return max ? Math.round((got / max) * 100) : 0;
}

function updateHomeStreak() {
  const streakElement = document.getElementById("streakDisplay");
  if (!streakElement) return;

  let streak = 0;
  const today = new Date();

  for (let i = 0; ; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const key = d.toISOString().split("T")[0];

    const log = JSON.parse(localStorage.getItem(key));
    if (!log) break;

    // ✅ NEW: If checking today, ensure day is finished
    if (i === 0) {
      const dayEnd = getDayEndMinute();
      const now = nowMinutes();

      if (dayEnd !== null && now < dayEnd) {
        // Day not finished yet → stop streak calculation here
        break;
      }
    }

    const percent = calculateDisciplinePercent(log);

    if (percent >= 60) {
      streak++;
    } else {
      break;
    }
  }

  streakElement.innerHTML = `🔥 ${streak} Day Streak`;
}










