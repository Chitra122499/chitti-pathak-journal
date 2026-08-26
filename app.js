// ══════════════════════════════════════════════════════════
//  CHITTI & PATHAK JOURNAL  —  app.js
// ══════════════════════════════════════════════════════════

// ── GLOBALS ──────────────────────────────────────────────
let db;
let currentUser = null;
let otherUser   = null;
let todayKey    = "";
let isLocked    = false;

let myPendingPhoto = null;

const AVATARS = { Chitti: "🌸", Pathak: "🌿" };

// ── START ─────────────────────────────────────────────────
window.addEventListener("load", function () {
  // Secret URL key guard (only applies when served via http/https, not file://)
  if (SECRET_URL_KEY && window.location.protocol !== "file:") {
    const params = new URLSearchParams(window.location.search);
    if (params.get("key") !== SECRET_URL_KEY) {
      document.body.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;height:100vh;
                    font-family:sans-serif;color:#888;text-align:center;padding:40px;">
          <div>
            <div style="font-size:64px;margin-bottom:16px;">🔒</div>
            <h2>Private Journal</h2>
            <p style="margin-top:8px;font-size:14px;">You need the correct link to access this journal.</p>
          </div>
        </div>`;
      return;
    }
  }

  // Init Firebase
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
  } catch (e) {
    alert("Firebase init failed. Check your firebase-config.js values.\n\n" + e.message);
    return;
  }

  // Build toast element
  if (!document.getElementById("toast")) {
    const toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }

  // Journal textarea char counter
  const ta = document.getElementById("my-journal-text");
  ta.addEventListener("input", function () {
    const len = Math.min(ta.value.length, 1000);
    document.getElementById("my-journal-chars").textContent = len + " / 1000";
    if (ta.value.length > 1000) ta.value = ta.value.slice(0, 1000);
  });

  // PIN input — allow Enter key
  document.getElementById("pin-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") login();
  });

  // Check if already logged in
  const saved = sessionStorage.getItem("journal_user");
  if (saved && USER_CREDENTIALS[saved] !== undefined) {
    currentUser = saved;
    enterApp();
  }
});

// ── DATE HELPERS ─────────────────────────────────────────
function getNowIST() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 5.5 * 3600 * 1000);
}

function getJournalDayKey() {
  const ist = getNowIST();
  // Between midnight and 2AM IST, we still show "yesterday"
  const base = ist.getHours() < 2
    ? new Date(ist.getTime() - 24 * 3600 * 1000)
    : ist;
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
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

  // Switch screens
  document.getElementById("login-screen").classList.remove("active");
  document.getElementById("app-screen").classList.add("active");

  // Header
  document.getElementById("header-user").textContent = AVATARS[currentUser] + " " + currentUser;
  document.getElementById("header-date").textContent  = formatDisplayDate(todayKey);

  // Column names
  document.getElementById("my-avatar").textContent          = AVATARS[currentUser];
  document.getElementById("my-name").textContent            = currentUser;
  document.getElementById("their-avatar").textContent       = AVATARS[otherUser];
  document.getElementById("their-name").textContent         = otherUser;
  document.getElementById("my-journal-avatar").textContent  = AVATARS[currentUser];
  document.getElementById("my-journal-name").textContent    = currentUser;
  document.getElementById("their-journal-avatar").textContent = AVATARS[otherUser];
  document.getElementById("their-journal-name").textContent  = otherUser;

  // Lock check
  checkLockedUI();

  // Listen for real-time data
  listenToday();
  loadFavourites();

  // Re-check lock every minute
  setInterval(checkLockedUI, 60000);
  // Auto-delete check every minute
  setInterval(runAutoDelete, 60000);
  runAutoDelete();
}

// ── LOCK ─────────────────────────────────────────────────
function checkLockedUI() {
  const h = getNowIST().getHours();
  isLocked = h >= 0 && h < 2; // midnight to 2AM IST = locked

  const banner = document.getElementById("lock-banner");
  if (isLocked) {
    banner.classList.remove("hidden");
    document.getElementById("my-photo-input").disabled = true;
    document.getElementById("my-journal-text").disabled = true;
    document.getElementById("save-journal-btn").disabled = true;
    const sp = document.getElementById("my-save-photo-btn");
    if (sp) sp.disabled = true;
  } else {
    banner.classList.add("hidden");
  }
}

// ── TABS ─────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.getElementById("tab-content-" + name).classList.add("active");
  if (name === "favourites") loadFavourites();
  if (name === "attendance") { initAttendanceTab(); listenAttendance(); }
}

// ── PHOTO UPLOAD + EXIF ───────────────────────────────────
async function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function (e) {
    const dataUrl = e.target.result;

    // Show preview
    const preview = document.getElementById("my-photo-preview");
    preview.innerHTML = `<img src="${dataUrl}" alt="Your photo" />`;
    preview.classList.add("filled");
    preview.onclick = null; // disable click-to-upload after photo chosen

    document.getElementById("my-photo-meta").classList.remove("hidden");
    document.getElementById("my-photo-actions").classList.remove("hidden");
    document.getElementById("my-photo-saved").classList.add("hidden");

    let photoTime     = "";
    let photoLocation = "Not available";

    // --- EXIF extraction ---
    try {
      if (typeof exifr !== "undefined") {
        const exifData = await exifr.parse(file, { tiff: true, gps: true });
        if (exifData) {
          if (exifData.DateTimeOriginal) {
            photoTime = formatExifDate(exifData.DateTimeOriginal);
          } else if (exifData.DateTime) {
            photoTime = formatExifDate(exifData.DateTime);
          }
          if (exifData.latitude && exifData.longitude) {
            document.getElementById("my-photo-location").textContent = "📍 Looking up...";
            photoLocation = await reverseGeocode(exifData.latitude, exifData.longitude);
          }
        }
      }
    } catch (err) {
      console.warn("EXIF parse error:", err);
    }

    // Fallback: use file last-modified date if no EXIF time
    if (!photoTime && file.lastModified) {
      photoTime = new Date(file.lastModified).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    }
    if (!photoTime) photoTime = "Not available";

    document.getElementById("my-photo-time").textContent     = photoTime;
    document.getElementById("my-photo-location").textContent = photoLocation;

    myPendingPhoto = { dataUrl, time: photoTime, location: photoLocation };
  };
  reader.readAsDataURL(file);
}

function formatExifDate(d) {
  if (d instanceof Date) {
    return d.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  }
  if (typeof d === "string") {
    // "2024:05:23 14:30:00" → ISO
    const fixed = d.replace(/^(\d{4}):(\d{2}):(\d{2})/, "$1-$2-$3");
    const dt = new Date(fixed);
    if (!isNaN(dt)) {
      return dt.toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit"
      });
    }
  }
  return String(d);
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const city    = addr.city || addr.town || addr.village || addr.county || "";
    const country = addr.country || "";
    return [city, country].filter(Boolean).join(", ") || `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
  } catch {
    return "Location unavailable";
  }
}

// ── SAVE PHOTO ────────────────────────────────────────────
async function savePhoto() {
  if (isLocked)        { showToast("🔒 Journal is locked until 2AM IST"); return; }
  if (!myPendingPhoto) { showToast("Choose a photo first"); return; }

  const btn = document.getElementById("my-save-photo-btn");
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  try {
    await db.ref(`journal/${todayKey}/${currentUser}/photo`).set({
      dataUrl:   myPendingPhoto.dataUrl,
      time:      myPendingPhoto.time,
      location:  myPendingPhoto.location,
      savedAt:   Date.now()
    });
    document.getElementById("my-photo-actions").classList.add("hidden");
    document.getElementById("my-photo-saved").classList.remove("hidden");
    showToast("📷 Photo saved!");
  } catch (err) {
    showToast("❌ Save failed. Check Firebase config.");
    console.error(err);
    btn.innerHTML = "Save Photo";
    btn.disabled  = false;
  }
}

async function deleteMyPhoto() {
  if (isLocked) { showToast("🔒 Journal is locked"); return; }
  await db.ref(`journal/${todayKey}/${currentUser}/photo`).remove();
  myPendingPhoto = null;

  const preview = document.getElementById("my-photo-preview");
  preview.innerHTML = `<div class="photo-placeholder"><span>📸</span><p>Tap to take or upload a photo</p></div>`;
  preview.classList.remove("filled");
  preview.onclick = function () { document.getElementById("my-photo-input").click(); };

  document.getElementById("my-photo-meta").classList.add("hidden");
  document.getElementById("my-photo-actions").classList.add("hidden");
  document.getElementById("my-photo-saved").classList.add("hidden");
  showToast("Photo removed");
}

// ── JOURNAL SAVE ─────────────────────────────────────────
async function saveJournal() {
  if (isLocked) { showToast("🔒 Journal is locked until 2AM IST"); return; }
  const text = document.getElementById("my-journal-text").value.trim();
  if (!text)  { showToast("Write something first!"); return; }

  const btn = document.getElementById("save-journal-btn");
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  try {
    await db.ref(`journal/${todayKey}/${currentUser}/entry`).set({
      text,
      savedAt: Date.now()
    });
    document.getElementById("my-journal-saved").classList.remove("hidden");
    showToast("✍️ Entry saved!");
  } catch (err) {
    showToast("❌ Save failed. Check Firebase config.");
    console.error(err);
  } finally {
    btn.innerHTML = "Save Entry";
    btn.disabled  = false;
  }
}

// ── REACTIONS ─────────────────────────────────────────────
async function reactToPhoto(emoji) {
  if (isLocked) { showToast("🔒 Locked"); return; }
  await db.ref(`journal/${todayKey}/${otherUser}/photo/reactions/${currentUser}`).set(emoji);
  // Mark the react button
  document.querySelectorAll(".react-btn").forEach(b => {
    if (b.textContent === emoji) b.classList.add("reacted");
  });
  showToast(emoji + " Reaction sent!");
}

async function reactToJournal(emoji) {
  if (isLocked) { showToast("🔒 Locked"); return; }
  await db.ref(`journal/${todayKey}/${otherUser}/entry/reactions/${currentUser}`).set(emoji);
  showToast(emoji + " Reaction sent!");
}

let replyBoxVisible = false;
function toggleReplyBox() {
  replyBoxVisible = !replyBoxVisible;
  document.getElementById("their-journal-reply-box").classList.toggle("hidden", !replyBoxVisible);
  if (replyBoxVisible) document.getElementById("their-journal-reply-input").focus();
}

async function replyToJournal() {
  if (isLocked) { showToast("🔒 Locked"); return; }
  const input = document.getElementById("their-journal-reply-input");
  const text  = input.value.trim();
  if (!text) return;

  await db.ref(`journal/${todayKey}/${otherUser}/entry/replies`).push({
    from: currentUser,
    text,
    at: Date.now()
  });
  input.value = "";
  replyBoxVisible = false;
  document.getElementById("their-journal-reply-box").classList.add("hidden");
  showToast("💬 Reply sent!");
}

// ── FAVOURITES (save) ─────────────────────────────────────
async function favouriteTheirPhoto() {
  const snap = await db.ref(`journal/${todayKey}/${otherUser}/photo`).once("value");
  const photo = snap.val();
  if (!photo) { showToast("No photo to save yet"); return; }

  await db.ref(`favourites/${currentUser}/photos`).push({
    from:      otherUser,
    date:      todayKey,
    dataUrl:   photo.dataUrl,
    time:      photo.time,
    location:  photo.location,
    savedAt:   Date.now()
  });
  showToast("⭐ Photo saved to Favourites!");
}

async function favouriteTheirJournal() {
  const snap = await db.ref(`journal/${todayKey}/${otherUser}/entry`).once("value");
  const entry = snap.val();
  if (!entry) { showToast("No entry to save yet"); return; }

  await db.ref(`favourites/${currentUser}/entries`).push({
    from:    otherUser,
    date:    todayKey,
    text:    entry.text,
    savedAt: Date.now()
  });
  showToast("⭐ Entry saved to Favourites!");
}

function downloadTheirPhoto() {
  const img = document.querySelector("#their-photo-preview img");
  if (!img) return;
  const a    = document.createElement("a");
  a.href     = img.src;
  a.download = otherUser + "-photo-" + todayKey + ".jpg";
  a.click();
  showToast("⬇ Downloading...");
}

// ── REAL-TIME LISTENER ────────────────────────────────────
function listenToday() {
  db.ref("journal/" + todayKey).on("value", function (snap) {
    const data = snap.val() || {};
    renderMyData(data[currentUser] || {});
    renderTheirData(data[otherUser]  || {});
  });
}

function renderMyData(data) {
  // ── My photo (only populate from DB if nothing pending locally)
  if (data.photo && !myPendingPhoto) {
    const preview = document.getElementById("my-photo-preview");
    preview.innerHTML = `<img src="${data.photo.dataUrl}" alt="Your photo" />`;
    preview.classList.add("filled");
    preview.onclick = null;
    document.getElementById("my-photo-meta").classList.remove("hidden");
    document.getElementById("my-photo-time").textContent     = data.photo.time || "—";
    document.getElementById("my-photo-location").textContent = data.photo.location || "—";
    document.getElementById("my-photo-actions").classList.add("hidden");
    document.getElementById("my-photo-saved").classList.remove("hidden");
  }

  // ── Reactions on my photo
  if (data.photo && data.photo.reactions) {
    const card = document.getElementById("my-photo-reactions-card");
    card.style.display = "block";
    document.getElementById("my-photo-reactions").innerHTML =
      Object.entries(data.photo.reactions)
        .map(([u, e]) => `<span class="reaction-chip">${e} <b>${u}</b></span>`)
        .join("");
  }

  // ── My journal entry
  if (data.entry) {
    const ta = document.getElementById("my-journal-text");
    if (!ta.value) {
      ta.value = data.entry.text || "";
      document.getElementById("my-journal-chars").textContent =
        (data.entry.text || "").length + " / 1000";
    }
    document.getElementById("my-journal-saved").classList.remove("hidden");

    // Reactions + replies on my entry
    const hasReactions = data.entry.reactions && Object.keys(data.entry.reactions).length > 0;
    const hasReplies   = data.entry.replies   && Object.keys(data.entry.replies).length   > 0;
    if (hasReactions || hasReplies) {
      document.getElementById("my-journal-reactions-card").style.display = "block";

      if (hasReactions) {
        document.getElementById("my-journal-reactions").innerHTML =
          Object.entries(data.entry.reactions)
            .map(([u, e]) => `<span class="reaction-chip">${e} <b>${u}</b></span>`)
            .join("");
      }
      if (hasReplies) {
        document.getElementById("my-journal-replies").innerHTML =
          Object.values(data.entry.replies)
            .sort((a, b) => a.at - b.at)
            .map(r => `<div class="reply-item"><div class="reply-author">${escHtml(r.from)}</div>${escHtml(r.text)}</div>`)
            .join("");
      }
    }
  }
}

function renderTheirData(data) {
  // ── Their photo
  const theirPreview = document.getElementById("their-photo-preview");
  if (data.photo && data.photo.dataUrl) {
    theirPreview.innerHTML = `<img src="${data.photo.dataUrl}" alt="${otherUser}'s photo" />`;
    theirPreview.classList.add("filled");
    document.getElementById("their-photo-meta").classList.remove("hidden");
    document.getElementById("their-photo-time").textContent     = data.photo.time || "—";
    document.getElementById("their-photo-location").textContent = data.photo.location || "—";
    document.getElementById("their-photo-react-bar").classList.remove("hidden");
  } else {
    theirPreview.innerHTML = `<div class="photo-placeholder"><span>⏳</span><p>Waiting for ${otherUser}'s photo...</p></div>`;
    theirPreview.classList.remove("filled");
    document.getElementById("their-photo-meta").classList.add("hidden");
    document.getElementById("their-photo-react-bar").classList.add("hidden");
  }

  // ── Their journal
  const theirDiv  = document.getElementById("their-journal-text");
  const reactBar  = document.getElementById("their-journal-react-bar");
  const replyBtn  = document.getElementById("toggle-reply-btn");

  if (data.entry && data.entry.text) {
    theirDiv.innerHTML = escHtml(data.entry.text).replace(/\n/g, "<br>");
    reactBar.classList.remove("hidden");
    replyBtn.style.display = "inline-block";
  } else {
    theirDiv.innerHTML = `<p class="placeholder-text">⏳ Waiting for ${otherUser}'s entry...</p>`;
    reactBar.classList.add("hidden");
    replyBtn.style.display = "none";
  }
}

// ── FAVOURITES TAB ────────────────────────────────────────
async function loadFavourites() {
  const grid = document.getElementById("favourites-grid");
  grid.innerHTML = `<div class="empty-favourites"><span>⏳</span><p>Loading...</p></div>`;

  try {
    const [pSnap, eSnap] = await Promise.all([
      db.ref(`favourites/${currentUser}/photos`).once("value"),
      db.ref(`favourites/${currentUser}/entries`).once("value")
    ]);

    const photos  = pSnap.val() || {};
    const entries = eSnap.val() || {};

    const items = [
      ...Object.entries(photos).map(([k, v])  => ({ ...v, type: "photo", key: k })),
      ...Object.entries(entries).map(([k, v]) => ({ ...v, type: "entry", key: k }))
    ].sort((a, b) => b.savedAt - a.savedAt);

    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-favourites">
          <span>⭐</span>
          <p>Nothing saved yet. Use the ⭐ button on photos or entries to keep them here.</p>
        </div>`;
      return;
    }

    grid.innerHTML = items.map(item => {
      if (item.type === "photo") {
        return `
          <div class="fav-card">
            <img src="${item.dataUrl}" alt="Photo by ${escHtml(item.from)}" loading="lazy" />
            <div class="fav-card-body">
              <div class="fav-card-author">${AVATARS[item.from] || ""} ${escHtml(item.from)}</div>
              <div class="fav-card-date">${formatDisplayDate(item.date)}</div>
              ${item.time     ? `<div class="fav-card-meta">🕐 ${escHtml(item.time)}</div>` : ""}
              ${item.location ? `<div class="fav-card-meta">📍 ${escHtml(item.location)}</div>` : ""}
              <a href="${item.dataUrl}" download="${escHtml(item.from)}-${item.date}.jpg" class="btn-text">⬇ Download</a>
            </div>
          </div>`;
      } else {
        return `
          <div class="fav-card">
            <div class="fav-card-body">
              <div class="fav-card-author">${AVATARS[item.from] || ""} ${escHtml(item.from)}</div>
              <div class="fav-card-date">${formatDisplayDate(item.date)}</div>
              <div class="fav-card-text">${escHtml(item.text).replace(/\n/g, "<br>")}</div>
            </div>
          </div>`;
      }
    }).join("");
  } catch (err) {
    grid.innerHTML = `<div class="empty-favourites"><span>❌</span><p>Error loading favourites.</p></div>`;
    console.error(err);
  }
}

// ── AUTO-DELETE at 2AM IST ────────────────────────────────
async function runAutoDelete() {
  const ist = getNowIST();
  // Only run in the window 02:00–02:04 IST
  if (ist.getHours() !== 2 || ist.getMinutes() > 4) return;

  // Build key for the day that just ended (yesterday)
  const prev = new Date(ist.getTime() - 24 * 3600 * 1000);
  const y = prev.getFullYear();
  const m = String(prev.getMonth() + 1).padStart(2, "0");
  const d = String(prev.getDate()).padStart(2, "0");
  const expiredKey = `${y}-${m}-${d}`;

  // Skip if already archived
  const archivedSnap = await db.ref(`journal/${expiredKey}/_archived`).once("value");
  if (archivedSnap.val()) return;

  const snap = await db.ref(`journal/${expiredKey}`).once("value");
  if (!snap.exists()) {
    // No data at all — mark "no data" notice
    await db.ref(`journal/${expiredKey}/_noData`).set(true);
    await db.ref(`journal/${expiredKey}/_archived`).set(true);
    return;
  }

  // Collect all photo keys saved in favourites so we don't double-delete
  const [cfSnap, pfSnap] = await Promise.all([
    db.ref("favourites/Chitti/photos").once("value"),
    db.ref("favourites/Pathak/photos").once("value")
  ]);
  const savedDates = new Set();
  [cfSnap, pfSnap].forEach(s => {
    const v = s.val() || {};
    Object.values(v).forEach(p => { if (p.date) savedDates.add(p.date); });
  });

  // Remove raw dataUrl for photos that weren't favourited (keeps metadata)
  if (!savedDates.has(expiredKey)) {
    for (const user of ["Chitti", "Pathak"]) {
      await db.ref(`journal/${expiredKey}/${user}/photo/dataUrl`).remove();
    }
  }

  await db.ref(`journal/${expiredKey}/_archived`).set(true);
}

// ── UTILITIES ─────────────────────────────────────────────
function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ══════════════════════════════════════════════════════════
//  ATTENDANCE
// ══════════════════════════════════════════════════════════

let pendingAttendance = { checkin: null };

// Called when attendance tab is shown — set labels
function initAttendanceTab() {
  document.getElementById("attendance-date-label").textContent = formatDisplayDate(todayKey);
  document.getElementById("my-att-avatar").textContent    = AVATARS[currentUser];
  document.getElementById("my-att-name").textContent      = currentUser;
  document.getElementById("their-att-avatar").textContent  = AVATARS[otherUser];
  document.getElementById("their-att-name").textContent    = otherUser;
  document.getElementById("their-checkin-wait-text").textContent  = otherUser + " hasn't checked in yet";
  document.getElementById("their-checkout-wait-text").textContent = otherUser + " hasn't checked out yet";
}

// Handle photo capture for checkin or checkout
async function handleAttendancePhoto(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const dataUrl = e.target.result;

    // Show preview
    const preview = document.getElementById("my-" + type + "-preview");
    preview.innerHTML = `<img src="${dataUrl}" alt="${type} photo" />`;
    preview.classList.add("filled");
    preview.onclick = null;

    // Capture current time (device time — more reliable for attendance than EXIF)
    const now = new Date();
    const timeStr = now.toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    });

    document.getElementById("my-" + type + "-meta").classList.remove("hidden");
    document.getElementById("my-" + type + "-time").textContent = timeStr;
    document.getElementById("my-" + type + "-actions").classList.remove("hidden");
    document.getElementById("my-" + type + "-saved").classList.add("hidden");

    pendingAttendance[type] = { dataUrl, time: timeStr, timestamp: now.getTime() };
  };
  reader.readAsDataURL(file);
}

// Save check-in (photo-based)
async function saveAttendance(type) {
  if (!pendingAttendance[type]) { showToast("Capture a photo first"); return; }

  const btn = document.querySelector(`#my-${type}-actions .att-save-btn`);
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  try {
    await db.ref(`attendance/${todayKey}/${currentUser}/${type}`).set({
      dataUrl:   pendingAttendance[type].dataUrl,
      time:      pendingAttendance[type].time,
      timestamp: pendingAttendance[type].timestamp,
      savedAt:   Date.now()
    });

    document.getElementById("my-" + type + "-actions").classList.add("hidden");
    const savedEl = document.getElementById("my-" + type + "-saved");
    savedEl.classList.remove("hidden");
    document.getElementById("my-" + type + "-saved-time").textContent = pendingAttendance[type].time;

    showToast(type === "checkin" ? "🟢 Checked in!" : "🔴 Checked out!");
    pendingAttendance[type] = null;
  } catch (err) {
    showToast("❌ Save failed.");
    console.error(err);
    btn.innerHTML = type === "checkin" ? "✅ Mark Check In" : "✅ Mark Check Out";
    btn.disabled  = false;
  }
}

// Check Out — button only, no photo
async function saveCheckout() {
  const btn = document.getElementById("my-checkout-btn");
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  const now = new Date();
  const timeStr = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });

  try {
    await db.ref(`attendance/${todayKey}/${currentUser}/checkout`).set({
      time:      timeStr,
      timestamp: now.getTime(),
      savedAt:   Date.now()
    });
    btn.classList.add("hidden");
    const savedEl = document.getElementById("my-checkout-saved");
    savedEl.classList.remove("hidden");
    document.getElementById("my-checkout-saved-time").textContent = timeStr;
    showToast("🔴 Checked out!");
  } catch (err) {
    showToast("❌ Save failed.");
    btn.innerHTML = "🔴 Mark Check Out";
    btn.disabled  = false;
  }
}

// Reached Home — button only, instant notification
async function saveReachedHome() {
  const btn = document.getElementById("my-home-btn");
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  const now = new Date();
  const timeStr = now.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });

  try {
    await db.ref(`attendance/${todayKey}/${currentUser}/home`).set({
      time:      timeStr,
      timestamp: now.getTime(),
      savedAt:   Date.now()
    });
    btn.classList.add("hidden");
    const savedEl = document.getElementById("my-home-saved");
    savedEl.classList.remove("hidden");
    document.getElementById("my-home-saved-time").textContent = timeStr;
    showToast("🏠 Reached home marked!");
  } catch (err) {
    showToast("❌ Save failed.");
    btn.innerHTML = "🏠 I'm Home!";
    btn.disabled  = false;
  }
}

// Listen for attendance changes in real time
function listenAttendance() {
  db.ref("attendance/" + todayKey).on("value", function (snap) {
    const data = snap.val() || {};
    renderMyAttendance(data[currentUser] || {});
    renderTheirAttendance(data[otherUser]  || {});
  });
}

function renderMyAttendance(data) {
  // Check In (photo)
  if (data.checkin && !pendingAttendance.checkin) {
    const preview = document.getElementById("my-checkin-preview");
    preview.innerHTML = `<img src="${data.checkin.dataUrl}" alt="checkin" />`;
    preview.classList.add("filled");
    preview.onclick = null;
    document.getElementById("my-checkin-meta").classList.remove("hidden");
    document.getElementById("my-checkin-time").textContent = data.checkin.time;
    document.getElementById("my-checkin-actions").classList.add("hidden");
    const savedEl = document.getElementById("my-checkin-saved");
    savedEl.classList.remove("hidden");
    document.getElementById("my-checkin-saved-time").textContent = data.checkin.time;
  }

  // Check Out (button only)
  if (data.checkout) {
    document.getElementById("my-checkout-btn").classList.add("hidden");
    const savedEl = document.getElementById("my-checkout-saved");
    savedEl.classList.remove("hidden");
    document.getElementById("my-checkout-saved-time").textContent = data.checkout.time;
  }

  // Reached Home
  if (data.home) {
    document.getElementById("my-home-btn").classList.add("hidden");
    const savedEl = document.getElementById("my-home-saved");
    savedEl.classList.remove("hidden");
    document.getElementById("my-home-saved-time").textContent = data.home.time;
  }

  updateMyDuration(data);
}

function renderTheirAttendance(data) {
  // Their Check In (photo)
  const preview  = document.getElementById("their-checkin-preview");
  const metaEl   = document.getElementById("their-checkin-meta");
  const subtitle = document.getElementById("their-checkin-subtitle");

  if (data.checkin && data.checkin.dataUrl) {
    preview.innerHTML = `<img src="${data.checkin.dataUrl}" alt="checkin" />`;
    preview.classList.add("filled");
    metaEl.classList.remove("hidden");
    document.getElementById("their-checkin-time").textContent = data.checkin.time;
    if (subtitle) subtitle.textContent = "Arrived at office";
  } else {
    preview.innerHTML = `<div class="photo-placeholder"><span>⏳</span><p>${otherUser} hasn't checked in yet</p></div>`;
    preview.classList.remove("filled");
    metaEl.classList.add("hidden");
    if (subtitle) subtitle.textContent = "Waiting...";
  }

  // Their Check Out (button-only — just show time)
  const coStatus  = document.getElementById("their-checkout-status");
  const coWaiting = document.getElementById("their-checkout-waiting");
  if (data.checkout) {
    coStatus.classList.remove("hidden");
    coWaiting.classList.add("hidden");
    document.getElementById("their-checkout-time").textContent = data.checkout.time;
    document.getElementById("their-checkout-subtitle").textContent = "Left office";
  } else {
    coStatus.classList.add("hidden");
    coWaiting.classList.remove("hidden");
    document.getElementById("their-checkout-subtitle").textContent = "Waiting...";
  }

  // Their Reached Home
  const homeStatus  = document.getElementById("their-home-status");
  const homeWaiting = document.getElementById("their-home-waiting");
  if (data.home) {
    homeStatus.classList.remove("hidden");
    homeWaiting.classList.add("hidden");
    document.getElementById("their-home-time").textContent = data.home.time;
    document.getElementById("their-home-subtitle").textContent = "Safe at home 🏠";
  } else {
    homeStatus.classList.add("hidden");
    homeWaiting.classList.remove("hidden");
    document.getElementById("their-home-subtitle").textContent = "Waiting...";
  }

  updateTheirDuration(data);
}

function updateMyDuration(data) {
  const card = document.getElementById("my-duration-card");
  if (data.checkin && data.checkout) {
    const diff = data.checkout.timestamp - data.checkin.timestamp;
    document.getElementById("my-duration-value").textContent = formatDuration(diff);
    card.style.display = "block";
  } else {
    card.style.display = "none";
  }
}

function updateTheirDuration(data) {
  const card = document.getElementById("their-duration-card");
  if (data.checkin && data.checkout) {
    const diff = data.checkout.timestamp - data.checkin.timestamp;
    document.getElementById("their-duration-value").textContent = formatDuration(diff);
    card.style.display = "block";
  } else {
    card.style.display = "none";
  }
}

function formatDuration(ms) {
  if (ms <= 0) return "—";
  const totalMins = Math.floor(ms / 60000);
  const hrs  = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}
