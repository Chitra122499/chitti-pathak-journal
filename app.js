// ══════════════════════════════════════════════════════════
//  CHITTI & PATHAK JOURNAL
// ══════════════════════════════════════════════════════════

let db;
let currentUser = null;
let otherUser   = null;
let todayKey    = "";
let isLocked    = false;

// Pending captures before save
let pending = { checkin: null, checkout: null };

const AVATARS = { Chitti: "🌸", Pathak: "🌿" };

// ── BOOT ─────────────────────────────────────────────────
window.addEventListener("load", function () {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
  } catch (e) {
    alert("Firebase init failed. Check firebase-config.js.\n\n" + e.message);
    return;
  }

  // Toast element
  if (!document.getElementById("toast")) {
    const t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }

  // Journal char counter
  document.getElementById("my-journal-text").addEventListener("input", function () {
    const l = Math.min(this.value.length, 1000);
    document.getElementById("my-journal-chars").textContent = l + " / 1000";
    if (this.value.length > 1000) this.value = this.value.slice(0, 1000);
  });

  // Enter on PIN
  document.getElementById("pin-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") login();
  });

  // Resume session
  const saved = sessionStorage.getItem("journal_user");
  if (saved && USER_CREDENTIALS[saved] !== undefined) {
    currentUser = saved;
    enterApp();
  }
});

// ── DATE HELPERS ─────────────────────────────────────────
function getNowIST() {
  const now = new Date();
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
}

function getJournalDayKey() {
  const ist = getNowIST();
  const base = ist.getHours() < 2
    ? new Date(ist.getTime() - 86400000)
    : ist;
  return base.toISOString().slice(0, 10);
}

function formatDisplayDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function nowTimeStr() {
  return new Date().toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

// ── AUTH ─────────────────────────────────────────────────
let selectedUser = null;

function selectUser(name) {
  selectedUser = name;
  document.querySelectorAll(".user-btn").forEach(b => b.classList.remove("selected"));
  document.querySelector(`[data-user="${name}"]`).classList.add("selected");
  document.getElementById("pin-input").focus();
}

function login() {
  const pin = document.getElementById("pin-input").value.trim();
  const err = document.getElementById("login-error");
  err.textContent = "";
  if (!selectedUser) { err.textContent = "Please select who you are."; return; }
  if (!pin)          { err.textContent = "Please enter your PIN."; return; }
  if (USER_CREDENTIALS[selectedUser] !== pin) {
    err.textContent = "Wrong PIN. Try again.";
    document.getElementById("pin-input").value = "";
    return;
  }
  currentUser = selectedUser;
  sessionStorage.setItem("journal_user", currentUser);
  enterApp();
}

function logout() {
  sessionStorage.removeItem("journal_user");
  location.reload();
}

// ── ENTER APP ────────────────────────────────────────────
function enterApp() {
  otherUser = currentUser === "Chitti" ? "Pathak" : "Chitti";
  todayKey  = getJournalDayKey();

  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");

  document.getElementById("header-user").textContent = AVATARS[currentUser] + " " + currentUser;
  document.getElementById("header-date").textContent  = formatDisplayDate(todayKey);

  // Journal avatars
  document.getElementById("my-journal-avatar").textContent   = AVATARS[currentUser];
  document.getElementById("my-journal-name").textContent     = currentUser;
  document.getElementById("their-journal-avatar").textContent = AVATARS[otherUser];
  document.getElementById("their-journal-name").textContent   = otherUser;

  // Attendance col headers
  document.getElementById("my-att-header").innerHTML =
    `<span style="font-size:26px">${AVATARS[currentUser]}</span>
     <span class="att-col-name">${currentUser}</span>
     <span class="att-col-you">You</span>`;
  document.getElementById("their-att-header").innerHTML =
    `<span style="font-size:26px">${AVATARS[otherUser]}</span>
     <span class="att-col-name">${otherUser}</span>`;

  document.getElementById("att-date-strip").textContent = "📅 " + formatDisplayDate(todayKey);

  checkLockedUI();
  setInterval(checkLockedUI, 60000);
  setInterval(runAutoDelete, 60000);
  runAutoDelete();

  // Start listening
  listenAttendance();
  listenJournal();
  loadFavourites();

  // Listen for notifications (their attendance updates)
  listenNotifications();
}

// ── LOCK ─────────────────────────────────────────────────
function checkLockedUI() {
  const h = getNowIST().getHours();
  isLocked = h >= 0 && h < 2;
}

// ── TABS ─────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.getElementById("tab-content-" + name).classList.add("active");
  if (name === "favourites") loadFavourites();
}

// ══════════════════════════════════════════════════════════
//  ATTENDANCE — CAPTURE
// ══════════════════════════════════════════════════════════

function startCapture(type) {
  document.getElementById("my-" + type + "-input").click();
}

function handleAttCapture(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  const timeStr = nowTimeStr();
  const reader  = new FileReader();

  reader.onload = function (e) {
    const dataUrl = e.target.result;
    pending[type] = { dataUrl, time: timeStr, timestamp: Date.now() };

    // Show preview
    document.getElementById("my-" + type + "-idle").classList.add("hidden");
    document.getElementById("my-" + type + "-done").classList.add("hidden");

    const wrap = document.getElementById("my-" + type + "-preview-wrap");
    wrap.classList.remove("hidden");
    document.getElementById("my-" + type + "-img").src = dataUrl;
    document.getElementById("my-" + type + "-preview-time").textContent = timeStr;
  };
  reader.readAsDataURL(file);
}

async function confirmAttendance(type) {
  if (!pending[type]) return;

  const btn = document.querySelector(`#my-${type}-preview-wrap .btn-primary`);
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  try {
    await db.ref(`attendance/${todayKey}/${currentUser}/${type}`).set({
      dataUrl:   pending[type].dataUrl,
      time:      pending[type].time,
      timestamp: pending[type].timestamp,
      savedAt:   Date.now()
    });

    // Notify the other person
    await sendNotification(
      type === "checkin"
        ? `${AVATARS[currentUser]} ${currentUser} has checked in at ${pending[type].time}`
        : `${AVATARS[currentUser]} ${currentUser} has checked out at ${pending[type].time}`
    );

    showMyAttDone(type, pending[type].dataUrl, pending[type].time);
    pending[type] = null;
    showToast(type === "checkin" ? "🟢 Checked in!" : "🔴 Checked out!");
  } catch (err) {
    showToast("❌ Save failed. Check connection.");
    console.error(err);
    btn.innerHTML = type === "checkin" ? "✅ Confirm Check In" : "✅ Confirm Check Out";
    btn.disabled  = false;
  }
}

function showMyAttDone(type, dataUrl, time) {
  document.getElementById("my-" + type + "-idle").classList.add("hidden");
  document.getElementById("my-" + type + "-preview-wrap").classList.add("hidden");

  const done = document.getElementById("my-" + type + "-done");
  done.classList.remove("hidden");
  document.getElementById("my-" + type + "-done-img").src = dataUrl;
  document.getElementById("my-" + type + "-done-time").textContent = time;
}

// ── REACHED HOME ─────────────────────────────────────────
async function markReachedHome() {
  const btn = document.querySelector("#my-home-idle .att-action-btn");
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled  = true;

  const timeStr = nowTimeStr();
  try {
    await db.ref(`attendance/${todayKey}/${currentUser}/home`).set({
      time:      timeStr,
      timestamp: Date.now(),
      savedAt:   Date.now()
    });

    await sendNotification(
      `${AVATARS[currentUser]} ${currentUser} has reached home safely at ${timeStr} 🏠`
    );

    document.getElementById("my-home-idle").classList.add("hidden");
    const done = document.getElementById("my-home-done");
    done.classList.remove("hidden");
    document.getElementById("my-home-done-time").textContent = timeStr;
    showToast("🏠 Reached home marked!");
  } catch (err) {
    showToast("❌ Save failed.");
    btn.innerHTML = "🏠 I'm Home!";
    btn.disabled  = false;
  }
}

// ── NOTIFICATIONS ─────────────────────────────────────────
async function sendNotification(message) {
  await db.ref(`notifications/${todayKey}/${otherUser}`).push({
    message,
    from:   currentUser,
    at:     Date.now(),
    read:   false
  });
}

function listenNotifications() {
  db.ref(`notifications/${todayKey}/${currentUser}`).on("child_added", function (snap) {
    const data = snap.val();
    if (!data || data.read) return;

    // Mark as read
    snap.ref.update({ read: true });

    // Show banner
    showNotifBanner(data.message);
  });
}

function showNotifBanner(msg) {
  const banner = document.getElementById("notif-banner");
  banner.textContent = "🔔 " + msg;
  banner.classList.remove("hidden");
  clearTimeout(window._notifTimer);
  window._notifTimer = setTimeout(() => banner.classList.add("hidden"), 6000);
}

// ── REAL-TIME ATTENDANCE ──────────────────────────────────
function listenAttendance() {
  db.ref("attendance/" + todayKey).on("value", function (snap) {
    const data = snap.val() || {};
    renderMyAtt(data[currentUser]  || {});
    renderTheirAtt(data[otherUser] || {});
  });
}

function renderMyAtt(data) {
  for (const type of ["checkin", "checkout"]) {
    if (data[type] && !pending[type]) {
      showMyAttDone(type, data[type].dataUrl, data[type].time);
    }
  }
  if (data.home) {
    document.getElementById("my-home-idle").classList.add("hidden");
    document.getElementById("my-home-done").classList.remove("hidden");
    document.getElementById("my-home-done-time").textContent = data.home.time;
  }
  calcDuration("my", data);
}

function renderTheirAtt(data) {
  // Check In
  if (data.checkin && data.checkin.dataUrl) {
    document.getElementById("their-checkin-empty").classList.add("hidden");
    const done = document.getElementById("their-checkin-done");
    done.classList.remove("hidden");
    document.getElementById("their-checkin-done-img").src = data.checkin.dataUrl;
    document.getElementById("their-checkin-done-time").textContent = data.checkin.time;
    document.getElementById("their-checkin-hint").textContent = "Arrived at office";
  } else {
    document.getElementById("their-checkin-empty").classList.remove("hidden");
    document.getElementById("their-checkin-done").classList.add("hidden");
    document.getElementById("their-checkin-hint").textContent = "Waiting...";
    document.getElementById("their-checkin-empty-text").textContent = otherUser + " hasn't checked in yet";
  }

  // Check Out
  if (data.checkout && data.checkout.dataUrl) {
    document.getElementById("their-checkout-empty").classList.add("hidden");
    const done = document.getElementById("their-checkout-done");
    done.classList.remove("hidden");
    document.getElementById("their-checkout-done-img").src = data.checkout.dataUrl;
    document.getElementById("their-checkout-done-time").textContent = data.checkout.time;
    document.getElementById("their-checkout-hint").textContent = "Left office";
  } else {
    document.getElementById("their-checkout-empty").classList.remove("hidden");
    document.getElementById("their-checkout-done").classList.add("hidden");
    document.getElementById("their-checkout-hint").textContent = "Waiting...";
  }

  // Reached Home
  if (data.home) {
    document.getElementById("their-home-empty").classList.add("hidden");
    const done = document.getElementById("their-home-done");
    done.classList.remove("hidden");
    document.getElementById("their-home-done-time").textContent = data.home.time;
    document.getElementById("their-home-hint").textContent = "Safe at home 🏠";
  } else {
    document.getElementById("their-home-empty").classList.remove("hidden");
    document.getElementById("their-home-done").classList.add("hidden");
    document.getElementById("their-home-hint").textContent = "Waiting...";
  }

  calcDuration("their", data);
}

function calcDuration(side, data) {
  const card = document.getElementById(side + "-duration-card");
  if (data.checkin && data.checkout && data.checkin.timestamp && data.checkout.timestamp) {
    const diff = data.checkout.timestamp - data.checkin.timestamp;
    if (diff > 0) {
      document.getElementById(side + "-duration-value").textContent = formatDuration(diff);
      card.classList.remove("hidden");
      return;
    }
  }
  card.classList.add("hidden");
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── FAVOURITE ATTENDANCE PHOTOS ───────────────────────────
async function favAttendancePhoto(type, side) {
  const userId   = side === "my" ? currentUser : otherUser;
  const snap     = await db.ref(`attendance/${todayKey}/${userId}/${type}`).once("value");
  const data     = snap.val();
  if (!data) { showToast("No photo to save"); return; }

  await db.ref(`favourites/${currentUser}/att_photos`).push({
    from:    userId,
    type,
    date:    todayKey,
    dataUrl: data.dataUrl,
    time:    data.time,
    savedAt: Date.now()
  });

  // Mark as favourited so auto-delete skips it
  await db.ref(`attendance/${todayKey}/${userId}/${type}/favourited`).set(true);

  const btn = document.getElementById((side === "my" ? "my" : "their") + "-" + type + "-fav-btn");
  if (btn) btn.classList.add("starred");

  showToast("⭐ Saved to Favourites!");
}

// ══════════════════════════════════════════════════════════
//  JOURNAL
// ══════════════════════════════════════════════════════════
function listenJournal() {
  db.ref("journal/" + todayKey).on("value", function (snap) {
    const data = snap.val() || {};
    renderMyJournal(data[currentUser]  || {});
    renderTheirJournal(data[otherUser] || {});
  });
}

function renderMyJournal(data) {
  if (data.entry) {
    const ta = document.getElementById("my-journal-text");
    if (!ta.value) {
      ta.value = data.entry.text || "";
      document.getElementById("my-journal-chars").textContent =
        (data.entry.text || "").length + " / 1000";
    }
    document.getElementById("my-journal-saved").classList.remove("hidden");

    const hasR = data.entry.reactions && Object.keys(data.entry.reactions).length;
    const hasRp = data.entry.replies   && Object.keys(data.entry.replies).length;
    if (hasR || hasRp) {
      document.getElementById("my-journal-reactions-card").style.display = "block";
      if (hasR) {
        document.getElementById("my-journal-reactions").innerHTML =
          Object.entries(data.entry.reactions)
            .map(([u, e]) => `<span class="reaction-chip">${e} <b>${u}</b></span>`).join("");
      }
      if (hasRp) {
        document.getElementById("my-journal-replies").innerHTML =
          Object.values(data.entry.replies).sort((a,b) => a.at - b.at)
            .map(r => `<div class="reply-item"><div class="reply-author">${escHtml(r.from)}</div>${escHtml(r.text)}</div>`).join("");
      }
    }
  }
}

function renderTheirJournal(data) {
  const div      = document.getElementById("their-journal-text");
  const reactBar = document.getElementById("their-journal-react-bar");
  const replyBtn = document.getElementById("toggle-reply-btn");

  if (data.entry && data.entry.text) {
    div.innerHTML = escHtml(data.entry.text).replace(/\n/g, "<br>");
    reactBar.classList.remove("hidden");
    replyBtn.style.display = "inline-block";
  } else {
    div.innerHTML = `<p class="placeholder-text">⏳ Waiting for ${otherUser}'s entry...</p>`;
    reactBar.classList.add("hidden");
    replyBtn.style.display = "none";
  }
}

async function saveJournal() {
  if (isLocked) { showToast("🔒 Locked until 2AM IST"); return; }
  const text = document.getElementById("my-journal-text").value.trim();
  if (!text) { showToast("Write something first!"); return; }

  const btn = document.getElementById("save-journal-btn");
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  try {
    await db.ref(`journal/${todayKey}/${currentUser}/entry`).set({ text, savedAt: Date.now() });
    document.getElementById("my-journal-saved").classList.remove("hidden");
    showToast("✍️ Entry saved!");
  } catch (e) {
    showToast("❌ Save failed.");
    console.error(e);
  } finally {
    btn.innerHTML = "Save Entry";
    btn.disabled  = false;
  }
}

async function reactToJournal(emoji) {
  await db.ref(`journal/${todayKey}/${otherUser}/entry/reactions/${currentUser}`).set(emoji);
  showToast(emoji + " Reaction sent!");
}

let replyOpen = false;
function toggleReplyBox() {
  replyOpen = !replyOpen;
  document.getElementById("their-journal-reply-box").classList.toggle("hidden", !replyOpen);
  if (replyOpen) document.getElementById("their-journal-reply-input").focus();
}

async function replyToJournal() {
  const input = document.getElementById("their-journal-reply-input");
  const text  = input.value.trim();
  if (!text) return;
  await db.ref(`journal/${todayKey}/${otherUser}/entry/replies`).push({
    from: currentUser, text, at: Date.now()
  });
  input.value = "";
  replyOpen = false;
  document.getElementById("their-journal-reply-box").classList.add("hidden");
  showToast("💬 Reply sent!");
}

async function favouriteTheirJournal() {
  const snap  = await db.ref(`journal/${todayKey}/${otherUser}/entry`).once("value");
  const entry = snap.val();
  if (!entry) { showToast("No entry to save yet"); return; }
  await db.ref(`favourites/${currentUser}/entries`).push({
    from: otherUser, date: todayKey, text: entry.text, savedAt: Date.now()
  });
  showToast("⭐ Entry saved to Favourites!");
}

// ══════════════════════════════════════════════════════════
//  FAVOURITES TAB
// ══════════════════════════════════════════════════════════
async function loadFavourites() {
  const grid = document.getElementById("favourites-grid");
  grid.innerHTML = `<div class="empty-favourites"><span>⏳</span><p>Loading...</p></div>`;

  try {
    const [apSnap, eSnap] = await Promise.all([
      db.ref(`favourites/${currentUser}/att_photos`).once("value"),
      db.ref(`favourites/${currentUser}/entries`).once("value")
    ]);

    const attPhotos = apSnap.val() || {};
    const entries   = eSnap.val()  || {};

    const items = [
      ...Object.entries(attPhotos).map(([k,v]) => ({ ...v, kind: "att_photo", key: k })),
      ...Object.entries(entries).map(([k,v])   => ({ ...v, kind: "entry",    key: k }))
    ].sort((a, b) => b.savedAt - a.savedAt);

    if (!items.length) {
      grid.innerHTML = `<div class="empty-favourites"><span>⭐</span><p>Nothing saved yet. Use the ⭐ button on photos or entries.</p></div>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      if (item.kind === "att_photo") {
        const typeLabel = item.type === "checkin" ? "🟢 Check In" : "🔴 Check Out";
        return `<div class="fav-card">
          <img src="${item.dataUrl}" loading="lazy" />
          <div class="fav-card-body">
            <div class="fav-card-author">${AVATARS[item.from]||""} ${escHtml(item.from)} · ${typeLabel}</div>
            <div class="fav-card-date">${formatDisplayDate(item.date)}</div>
            ${item.time ? `<div class="fav-card-meta">🕐 ${escHtml(item.time)}</div>` : ""}
            <a href="${item.dataUrl}" download="${escHtml(item.from)}-${item.type}-${item.date}.jpg" class="btn-text">⬇ Download</a>
          </div></div>`;
      } else {
        return `<div class="fav-card">
          <div class="fav-card-body">
            <div class="fav-card-author">${AVATARS[item.from]||""} ${escHtml(item.from)}</div>
            <div class="fav-card-date">${formatDisplayDate(item.date)}</div>
            <div class="fav-card-text">${escHtml(item.text).replace(/\n/g,"<br>")}</div>
          </div></div>`;
      }
    }).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-favourites"><span>❌</span><p>Error loading.</p></div>`;
    console.error(err);
  }
}

// ══════════════════════════════════════════════════════════
//  AUTO-DELETE at 2AM IST
//  — Skips anything marked as favourited
// ══════════════════════════════════════════════════════════
async function runAutoDelete() {
  const ist = getNowIST();
  if (ist.getHours() !== 2 || ist.getMinutes() > 4) return;

  const prev = new Date(ist.getTime() - 86400000);
  const expiredKey = prev.toISOString().slice(0, 10);

  const archivedSnap = await db.ref(`attendance/${expiredKey}/_archived`).once("value");
  if (archivedSnap.val()) return;

  const snap = await db.ref(`attendance/${expiredKey}`).once("value");
  if (!snap.exists()) {
    await db.ref(`attendance/${expiredKey}/_archived`).set(true);
    return;
  }

  const data = snap.val();
  for (const user of ["Chitti", "Pathak"]) {
    for (const type of ["checkin", "checkout"]) {
      const entry = (data[user] || {})[type];
      if (entry && entry.dataUrl && !entry.favourited) {
        // Remove only the heavy dataUrl, keep metadata
        await db.ref(`attendance/${expiredKey}/${user}/${type}/dataUrl`).remove();
      }
    }
  }

  await db.ref(`attendance/${expiredKey}/_archived`).set(true);
}

// ── UTILITIES ─────────────────────────────────────────────
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove("show"), 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
