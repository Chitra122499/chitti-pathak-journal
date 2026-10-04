// ══════════════════════════════════════════════════════════
//  CHITTI & PATHAK JOURNAL  —  Supabase edition
// ══════════════════════════════════════════════════════════

let sb;           // Supabase client
let currentUser = null;
let otherUser   = null;
let todayKey    = "";
let isLocked    = false;

let pending = { checkin: null, checkout: null };

const AVATARS = { Chitti: "🌸", Pathak: "🌿" };

// ── BOOT ─────────────────────────────────────────────────
window.addEventListener("load", function () {
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // Toast
  if (!document.getElementById("toast")) {
    const t = document.createElement("div");
    t.id = "toast"; document.body.appendChild(t);
  }

  // Journal char counter
  document.getElementById("my-journal-text").addEventListener("input", function () {
    const l = Math.min(this.value.length, 1000);
    document.getElementById("my-journal-chars").textContent = l + " / 1000";
    if (this.value.length > 1000) this.value = this.value.slice(0, 1000);
  });

  document.getElementById("pin-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") login();
  });

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
  const ist  = getNowIST();
  const base = ist.getHours() < 2 ? new Date(ist.getTime() - 86400000) : ist;
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
  document.getElementById("header-date").textContent = formatDisplayDate(todayKey);

  document.getElementById("my-journal-avatar").textContent    = AVATARS[currentUser];
  document.getElementById("my-journal-name").textContent      = currentUser;
  document.getElementById("their-journal-avatar").textContent = AVATARS[otherUser];
  document.getElementById("their-journal-name").textContent   = otherUser;

  document.getElementById("my-att-header").innerHTML =
    `<span style="font-size:26px">${AVATARS[currentUser]}</span>
     <span class="att-col-name">${currentUser}</span>
     <span class="att-col-you">You</span>`;
  document.getElementById("their-att-header").innerHTML =
    `<span style="font-size:26px">${AVATARS[otherUser]}</span>
     <span class="att-col-name">${otherUser}</span>`;

  document.getElementById("att-date-strip").textContent = "📅 " + formatDisplayDate(todayKey);

  // Set book page dates
  const bookDate = formatDisplayDate(todayKey);
  const bdL = document.getElementById("book-date-left");
  const bdR = document.getElementById("book-date-right");
  if (bdL) bdL.textContent = bookDate;
  if (bdR) bdR.textContent = bookDate;

  checkLockedUI();
  setInterval(checkLockedUI, 60000);
  setInterval(runAutoDelete, 60000);
  runAutoDelete();

  loadAttendance();
  subscribeAttendance();
  loadJournal();
  subscribeJournal();
  subscribeNotifications();
  loadFavourites();

  // Init OneSignal push notifications
  initPushNotifications();
}

function checkLockedUI() {
  const h = getNowIST().getHours();
  isLocked = h >= 0 && h < 2;
}

// ══════════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS (OneSignal)
// ══════════════════════════════════════════════════════════

async function initPushNotifications() {
  // Wait for OneSignal SDK to be ready
  await waitForOneSignal();
  if (!window.OneSignal) { console.warn("OneSignal not loaded"); return; }

  try {
    await OneSignal.init({
      appId:                        ONESIGNAL_APP_ID,
      notifyButton:                 { enable: false },
      allowLocalhostAsSecureOrigin: true,
      serviceWorkerPath:            "/OneSignalSDKWorker.js"
    });

    // Tag this device with the current user name for targeting
    await OneSignal.User.addTag("user", currentUser);
    console.log("OneSignal ready for:", currentUser);

    // Check current permission state
    const state = await OneSignal.Notifications.permissionNative;

    if (state === "granted") {
      showToast("🔔 Notifications active");
    } else if (state !== "denied") {
      // Show our own prompt button instead of auto-asking
      showNotifPrompt();
    }
  } catch (err) {
    console.warn("OneSignal init error:", err);
  }
}

function waitForOneSignal() {
  return new Promise(function (resolve) {
    if (window.OneSignal) { resolve(); return; }
    let tries = 0;
    const interval = setInterval(function () {
      tries++;
      if (window.OneSignal) { clearInterval(interval); resolve(); }
      if (tries > 30)       { clearInterval(interval); resolve(); } // give up after 3s
    }, 100);
  });
}

function showNotifPrompt() {
  // Show a gentle banner asking user to enable notifications
  const banner = document.getElementById("notif-banner");
  banner.innerHTML = `🔔 Enable notifications to get alerts when the other person reaches home &nbsp;
    <button onclick="requestNotifPermission()" style="
      background:#fff; color:#1a6fc4; border:none; border-radius:12px;
      padding:5px 14px; font-weight:700; font-size:13px; cursor:pointer; margin-left:8px;">
      Enable
    </button>
    <button onclick="document.getElementById('notif-banner').classList.add('hidden')" style="
      background:transparent; color:rgba(255,255,255,.7); border:none;
      font-size:16px; cursor:pointer; margin-left:6px; padding:0 4px;">
      ✕
    </button>`;
  banner.classList.remove("hidden");
}

async function requestNotifPermission() {
  document.getElementById("notif-banner").classList.add("hidden");
  if (!window.OneSignal) return;
  try {
    const result = await OneSignal.Notifications.requestPermission();
    if (result) {
      await OneSignal.User.addTag("user", currentUser);
      showToast("🔔 Notifications enabled!");
    } else {
      showToast("Notifications blocked — check browser settings");
    }
  } catch (err) {
    console.warn("Permission request error:", err);
  }
}

// Send a push notification to the other person via OneSignal REST API
// We use a Supabase Edge Function as a proxy to hide the API key from the browser
async function sendPushToOther(title, message) {
  try {
    await fetch("https://onesignal.com/api/v1/notifications", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Basic " + ONESIGNAL_API_KEY
      },
      body: JSON.stringify({
        app_id:             ONESIGNAL_APP_ID,
        filters:            [{ field: "tag", key: "user", relation: "=", value: otherUser }],
        headings:           { en: title },
        contents:           { en: message },
        ios_sound:          "default",
        android_sound:      "default",
        android_channel_id: "",
        url:                "https://infinitdragoste.netlify.app/"
      })
    });
  } catch (err) {
    console.warn("Push send failed:", err);
    // Silent fail — in-app banner still works as fallback
  }
}

// ── TABS ─────────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById("tab-" + name).classList.add("active");
  document.getElementById("tab-content-" + name).classList.add("active");
  if (name === "favourites") loadFavourites();
}

// ── IMAGE COMPRESSION ─────────────────────────────────────
function compressImage(dataUrl, maxWidth, quality) {
  return new Promise(function (resolve) {
    maxWidth = maxWidth || 900;
    quality  = quality  || 0.75;
    const img = new Image();
    img.onload = function () {
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl) {
  const parts  = dataUrl.split(",");
  const mime   = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const arr    = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ══════════════════════════════════════════════════════════
//  ATTENDANCE
// ══════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════
//  CAMERA
// ══════════════════════════════════════════════════════════

let cameraStream   = null;
let cameraFacing   = "user";   // "user" = front, "environment" = back
let activeCapType  = null;     // which type is being captured: "checkin" | "checkout"

function startCapture(type) {
  activeCapType = type;
  const titles  = { checkin: "📸 Check In Photo", checkout: "📸 Check Out Photo" };
  document.getElementById("camera-modal-title").textContent = titles[type] || "Take Photo";
  document.getElementById("camera-modal").classList.remove("hidden");
  startCameraStream();
}

async function startCameraStream() {
  // Stop any existing stream
  stopCameraStream();

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacing, width: { ideal: 1280 }, height: { ideal: 960 } },
      audio: false
    });
    const video = document.getElementById("camera-video");
    video.srcObject = cameraStream;
  } catch (err) {
    // Camera not available or denied — fall back to file picker
    console.warn("Camera not available:", err);
    closeCamera();
    triggerFileUpload();
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
}

function flipCamera() {
  cameraFacing = cameraFacing === "user" ? "environment" : "user";
  startCameraStream();
}

function closeCamera() {
  stopCameraStream();
  document.getElementById("camera-modal").classList.add("hidden");
}

function capturePhoto() {
  const video  = document.getElementById("camera-video");
  const canvas = document.getElementById("camera-canvas");
  canvas.width  = video.videoWidth  || 1280;
  canvas.height = video.videoHeight || 960;
  const ctx = canvas.getContext("2d");

  // Mirror front camera capture so it looks natural
  if (cameraFacing === "user") {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  const timeStr = nowTimeStr();

  closeCamera();
  processCapturedPhoto(dataUrl, timeStr, activeCapType);
}

function triggerFileUpload() {
  // fallback: file input
  if (activeCapType) document.getElementById("my-" + activeCapType + "-input").click();
}

async function handleAttCapture(event, type) {
  // This handles the file-input fallback
  const file = event.target.files[0];
  if (!file) return;
  const timeStr = nowTimeStr();
  const reader  = new FileReader();
  reader.onload = async function (e) {
    const compressed = await compressImage(e.target.result);
    processCapturedPhoto(compressed, timeStr, type);
  };
  reader.readAsDataURL(file);
}

async function processCapturedPhoto(dataUrl, timeStr, type) {
  const compressed = await compressImage(dataUrl);
  pending[type] = { dataUrl: compressed, time: timeStr, timestamp: Date.now() };

  document.getElementById("my-" + type + "-idle").classList.add("hidden");
  document.getElementById("my-" + type + "-done").classList.add("hidden");
  const wrap = document.getElementById("my-" + type + "-preview-wrap");
  wrap.classList.remove("hidden");
  document.getElementById("my-" + type + "-img").src = compressed;
  document.getElementById("my-" + type + "-preview-time").textContent = timeStr;
}

async function confirmAttendance(type) {
  if (!pending[type]) return;
  const btn = document.querySelector(`#my-${type}-preview-wrap .btn-primary`);
  btn.innerHTML = '<span class="spinner"></span> Uploading...';
  btn.disabled  = true;

  try {
    // 1. Upload photo to Supabase Storage
    const blob     = dataUrlToBlob(pending[type].dataUrl);
    const fileName = `${todayKey}/${currentUser}/${type}-${Date.now()}.jpg`;
    const { data: uploadData, error: uploadError } =
      await sb.storage.from("attendance-photos").upload(fileName, blob, {
        contentType:  "image/jpeg",
        upsert:       true
      });
    if (uploadError) throw uploadError;

    // 2. Get public URL
    const { data: urlData } = sb.storage.from("attendance-photos").getPublicUrl(fileName);
    const photoUrl = urlData.publicUrl;

    // 3. Upsert row in attendance table
    const { error: dbError } = await sb.from("attendance").upsert({
      day_key:   todayKey,
      user_name: currentUser,
      type,
      photo_url: photoUrl,
      time_str:  pending[type].time,
      ts:        pending[type].timestamp
    }, { onConflict: "day_key,user_name,type" });
    if (dbError) throw dbError;

    // 4. Notify other person
    await sendNotification(
      type === "checkin"
        ? `${AVATARS[currentUser]} ${currentUser} checked in at ${pending[type].time}`
        : `${AVATARS[currentUser]} ${currentUser} checked out at ${pending[type].time}`
    );

    // Push notification to other person's phone
    await sendPushToOther(
      type === "checkin"
        ? `${AVATARS[currentUser]} ${currentUser} has arrived at office`
        : `${AVATARS[currentUser]} ${currentUser} has left office`,
      type === "checkin"
        ? `Checked in at ${pending[type].time} 🟢`
        : `Checked out at ${pending[type].time} 🔴`
    );

    showMyAttDone(type, pending[type].dataUrl, pending[type].time);
    pending[type] = null;
    showToast(type === "checkin" ? "🟢 Checked in!" : "🔴 Checked out!");
  } catch (err) {
    showToast("❌ Upload failed. Check connection.");
    console.error(err);
    btn.innerHTML = type === "checkin" ? "✅ Confirm Check In" : "✅ Confirm Check Out";
    btn.disabled  = false;
  }
}

function showMyAttDone(type, imgSrc, time) {
  document.getElementById("my-" + type + "-idle").classList.add("hidden");
  document.getElementById("my-" + type + "-preview-wrap").classList.add("hidden");
  const done = document.getElementById("my-" + type + "-done");
  done.classList.remove("hidden");
  document.getElementById("my-" + type + "-done-img").src = imgSrc;
  document.getElementById("my-" + type + "-done-time").textContent = time;
}

function retakePhoto(type) {
  // Hide done state, show idle, open camera
  document.getElementById("my-" + type + "-done").classList.add("hidden");
  document.getElementById("my-" + type + "-idle").classList.remove("hidden");
  startCapture(type);
}

async function markReachedHome() {
  const btn = document.querySelector("#my-home-idle .att-action-btn");
  btn.innerHTML = '<span class="spinner"></span>';
  btn.disabled  = true;
  const timeStr = nowTimeStr();
  try {
    const { error } = await sb.from("attendance").upsert({
      day_key:   todayKey,
      user_name: currentUser,
      type:      "home",
      time_str:  timeStr,
      ts:        Date.now()
    }, { onConflict: "day_key,user_name,type" });
    if (error) throw error;

    await sendNotification(
      `${AVATARS[currentUser]} ${currentUser} reached home safely at ${timeStr} 🏠`
    );

    // Push notification to other person's phone
    await sendPushToOther(
      `${currentUser} reached home safely 🏠`,
      `Arrived home at ${timeStr}`
    );

    document.getElementById("my-home-idle").classList.add("hidden");
    document.getElementById("my-home-done").classList.remove("hidden");
    document.getElementById("my-home-done-time").textContent = timeStr;
    showToast("🏠 Reached home marked!");
  } catch (err) {
    showToast("❌ Save failed.");
    btn.innerHTML = "🏠 I'm Home!";
    btn.disabled  = false;
  }
}

// ── LOAD + SUBSCRIBE ATTENDANCE ───────────────────────────
async function loadAttendance() {
  const { data } = await sb.from("attendance")
    .select("*")
    .eq("day_key", todayKey);
  if (!data) return;
  applyAttendanceRows(data);
}

function subscribeAttendance() {
  sb.channel("attendance-" + todayKey)
    .on("postgres_changes", {
      event:  "*",
      schema: "public",
      table:  "attendance",
      filter: `day_key=eq.${todayKey}`
    }, function (payload) {
      if (payload.new) applyAttendanceRows([payload.new]);
    })
    .subscribe();
}

function applyAttendanceRows(rows) {
  rows.forEach(function (row) {
    if (row.user_name === currentUser) renderMyAttRow(row);
    else                               renderTheirAttRow(row);
  });
  // Recalculate duration after applying rows
  recalcDurations();
}

// Store latest rows for duration calc
const attState = { my: {}, their: {} };

function renderMyAttRow(row) {
  attState.my[row.type] = row;
  if (row.type === "checkin" || row.type === "checkout") {
    if (!pending[row.type]) {
      showMyAttDone(row.type, row.photo_url, row.time_str);
    }
  }
  if (row.type === "home") {
    document.getElementById("my-home-idle").classList.add("hidden");
    document.getElementById("my-home-done").classList.remove("hidden");
    document.getElementById("my-home-done-time").textContent = row.time_str;
  }
}

function renderTheirAttRow(row) {
  attState.their[row.type] = row;

  if (row.type === "checkin") {
    document.getElementById("their-checkin-empty").classList.add("hidden");
    document.getElementById("their-checkin-done").classList.remove("hidden");
    document.getElementById("their-checkin-done-img").src = row.photo_url;
    document.getElementById("their-checkin-done-time").textContent = row.time_str;
    document.getElementById("their-checkin-hint").textContent = "Arrived at office";
  }
  if (row.type === "checkout") {
    document.getElementById("their-checkout-empty").classList.add("hidden");
    document.getElementById("their-checkout-done").classList.remove("hidden");
    document.getElementById("their-checkout-done-img").src = row.photo_url;
    document.getElementById("their-checkout-done-time").textContent = row.time_str;
    document.getElementById("their-checkout-hint").textContent = "Left office";
  }
  if (row.type === "home") {
    document.getElementById("their-home-empty").classList.add("hidden");
    document.getElementById("their-home-done").classList.remove("hidden");
    document.getElementById("their-home-done-time").textContent = row.time_str;
    document.getElementById("their-home-hint").textContent = "Safe at home 🏠";
  }
}

function recalcDurations() {
  calcDuration("my",    attState.my);
  calcDuration("their", attState.their);
}

function calcDuration(side, data) {
  const card = document.getElementById(side + "-duration-card");
  const ci   = data.checkin, co = data.checkout;
  if (ci && co && ci.ts && co.ts && co.ts > ci.ts) {
    document.getElementById(side + "-duration-value").textContent = formatDuration(co.ts - ci.ts);
    card.classList.remove("hidden");
  } else {
    card.classList.add("hidden");
  }
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── FAVOURITE ATTENDANCE PHOTO ────────────────────────────
async function favAttendancePhoto(type, side) {
  const userId = side === "my" ? currentUser : otherUser;
  const { data } = await sb.from("attendance")
    .select("*")
    .eq("day_key", todayKey)
    .eq("user_name", userId)
    .eq("type", type)
    .single();
  if (!data || !data.photo_url) { showToast("No photo to save"); return; }

  const { error } = await sb.from("favourites").insert({
    owner_user: currentUser,
    kind:       "att_photo",
    from_user:  userId,
    day_key:    todayKey,
    photo_url:  data.photo_url,
    att_type:   type,
    time_str:   data.time_str
  });
  if (error) { showToast("❌ Could not save"); console.error(error); return; }

  // Mark as favourited so auto-delete skips it
  await sb.from("attendance")
    .update({ favourited: true })
    .eq("day_key", todayKey)
    .eq("user_name", userId)
    .eq("type", type);

  const btnId = (side === "my" ? "my" : "their") + "-" + type + "-fav-btn";
  const btn   = document.getElementById(btnId);
  if (btn) btn.classList.add("starred");
  showToast("⭐ Saved to Favourites!");
}

// ══════════════════════════════════════════════════════════
//  NOTIFICATIONS
// ══════════════════════════════════════════════════════════
async function sendNotification(message) {
  await sb.from("notifications").insert({
    day_key:   todayKey,
    to_user:   otherUser,
    from_user: currentUser,
    message
  });
}

function subscribeNotifications() {
  sb.channel("notifs-" + currentUser)
    .on("postgres_changes", {
      event:  "INSERT",
      schema: "public",
      table:  "notifications",
      filter: `to_user=eq.${currentUser}`
    }, function (payload) {
      if (payload.new && !payload.new.is_read) {
        showNotifBanner(payload.new.message);
        sb.from("notifications").update({ is_read: true }).eq("id", payload.new.id);
      }
    })
    .subscribe();
}

function showNotifBanner(msg) {
  const banner = document.getElementById("notif-banner");
  banner.textContent = "🔔 " + msg;
  banner.classList.remove("hidden");
  clearTimeout(window._notifTimer);
  window._notifTimer = setTimeout(() => banner.classList.add("hidden"), 7000);
}

// ══════════════════════════════════════════════════════════
//  JOURNAL
// ══════════════════════════════════════════════════════════
async function loadJournal() {
  const { data } = await sb.from("journal")
    .select("*")
    .eq("day_key", todayKey);
  if (!data) return;
  data.forEach(function (row) {
    if (row.user_name === currentUser) renderMyJournalRow(row);
    else                               renderTheirJournalRow(row);
  });

  // Load reactions + replies
  loadReactions();
  loadReplies();
}

function subscribeJournal() {
  sb.channel("journal-" + todayKey)
    .on("postgres_changes", {
      event:  "*",
      schema: "public",
      table:  "journal",
      filter: `day_key=eq.${todayKey}`
    }, function (payload) {
      if (!payload.new) return;
      if (payload.new.user_name === currentUser) renderMyJournalRow(payload.new);
      else                                        renderTheirJournalRow(payload.new);
    })
    .on("postgres_changes", {
      event:  "*",
      schema: "public",
      table:  "reactions",
      filter: `day_key=eq.${todayKey}`
    }, () => loadReactions())
    .on("postgres_changes", {
      event:  "INSERT",
      schema: "public",
      table:  "replies",
      filter: `day_key=eq.${todayKey}`
    }, () => loadReplies())
    .subscribe();
}

function renderMyJournalRow(row) {
  const ta = document.getElementById("my-journal-text");
  if (!ta.value) {
    ta.value = row.entry_text || "";
    document.getElementById("my-journal-chars").textContent =
      (row.entry_text || "").length + " / 1000";
  }
  document.getElementById("my-journal-saved").classList.remove("hidden");
}

function renderTheirJournalRow(row) {
  const div    = document.getElementById("their-journal-text");
  const footer = document.getElementById("their-journal-footer");
  if (row.entry_text) {
    div.innerHTML = escHtml(row.entry_text).replace(/\n/g, "<br>");
    if (footer) footer.style.display = "flex";
  }
}

async function loadReactions() {
  const { data } = await sb.from("reactions")
    .select("*")
    .eq("day_key", todayKey)
    .eq("target_user", currentUser);
  if (!data || !data.length) return;

  document.getElementById("my-journal-reactions-card").classList.remove("hidden");
  document.getElementById("my-journal-reactions").innerHTML = data
    .map(r => `<span class="reaction-chip">${r.emoji} <b>${r.from_user}</b></span>`)
    .join("");
}

async function loadReplies() {
  const { data } = await sb.from("replies")
    .select("*")
    .eq("day_key", todayKey)
    .eq("target_user", currentUser)
    .order("created_at", { ascending: true });
  if (!data || !data.length) return;

  document.getElementById("my-journal-reactions-card").classList.remove("hidden");
  document.getElementById("my-journal-replies").innerHTML = data
    .map(r => `<div class="reply-item"><div class="reply-author">${escHtml(r.from_user)}</div>${escHtml(r.reply_text)}</div>`)
    .join("");
}

async function saveJournal() {
  if (isLocked) { showToast("🔒 Locked until 2AM IST"); return; }
  const text = document.getElementById("my-journal-text").value.trim();
  if (!text) { showToast("Write something first!"); return; }

  const btn = document.getElementById("save-journal-btn");
  btn.innerHTML = '<span class="spinner"></span> Saving...';
  btn.disabled  = true;

  const { error } = await sb.from("journal").upsert({
    day_key:    todayKey,
    user_name:  currentUser,
    entry_text: text,
    updated_at: new Date().toISOString()
  }, { onConflict: "day_key,user_name" });

  btn.innerHTML = "Save Entry";
  btn.disabled  = false;

  if (error) { showToast("❌ Save failed."); console.error(error); return; }
  document.getElementById("my-journal-saved").classList.remove("hidden");
  showToast("✍️ Entry saved!");
}

async function reactToJournal(emoji) {
  const { error } = await sb.from("reactions").upsert({
    day_key:     todayKey,
    target_user: otherUser,
    from_user:   currentUser,
    emoji
  }, { onConflict: "day_key,target_user,from_user" });
  if (!error) showToast(emoji + " Reaction sent!");
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
  const { error } = await sb.from("replies").insert({
    day_key:     todayKey,
    target_user: otherUser,
    from_user:   currentUser,
    reply_text:  text
  });
  if (!error) {
    input.value = "";
    replyOpen = false;
    document.getElementById("their-journal-reply-box").classList.add("hidden");
    showToast("💬 Reply sent!");
  }
}

async function favouriteTheirJournal() {
  const { data } = await sb.from("journal")
    .select("entry_text")
    .eq("day_key", todayKey)
    .eq("user_name", otherUser)
    .single();
  if (!data) { showToast("No entry to save yet"); return; }

  await sb.from("favourites").insert({
    owner_user: currentUser,
    kind:       "entry",
    from_user:  otherUser,
    day_key:    todayKey,
    entry_text: data.entry_text
  });
  showToast("⭐ Entry saved to Favourites!");
}

// ══════════════════════════════════════════════════════════
//  FAVOURITES TAB
// ══════════════════════════════════════════════════════════
async function loadFavourites() {
  const grid = document.getElementById("favourites-grid");
  grid.innerHTML = `<div class="empty-favourites"><span>⏳</span><p>Loading...</p></div>`;

  const { data, error } = await sb.from("favourites")
    .select("*")
    .eq("owner_user", currentUser)
    .order("created_at", { ascending: false });

  if (error || !data || !data.length) {
    grid.innerHTML = `<div class="empty-favourites"><span>⭐</span><p>Nothing saved yet. Use the ⭐ button on photos or entries.</p></div>`;
    return;
  }

  grid.innerHTML = data.map(function (item) {
    if (item.kind === "att_photo") {
      const label = item.att_type === "checkin" ? "🟢 Check In" : "🔴 Check Out";
      return `<div class="fav-card">
        <img src="${item.photo_url}" loading="lazy" />
        <div class="fav-card-body">
          <div class="fav-card-author">${AVATARS[item.from_user]||""} ${escHtml(item.from_user)} · ${label}</div>
          <div class="fav-card-date">${formatDisplayDate(item.day_key)}</div>
          ${item.time_str ? `<div class="fav-card-meta">🕐 ${escHtml(item.time_str)}</div>` : ""}
          <a href="${item.photo_url}" download="${escHtml(item.from_user)}-${item.att_type}-${item.day_key}.jpg" class="btn-text" target="_blank">⬇ Download</a>
        </div></div>`;
    } else {
      return `<div class="fav-card">
        <div class="fav-card-body">
          <div class="fav-card-author">${AVATARS[item.from_user]||""} ${escHtml(item.from_user)}</div>
          <div class="fav-card-date">${formatDisplayDate(item.day_key)}</div>
          <div class="fav-card-text">${escHtml(item.entry_text||"").replace(/\n/g,"<br>")}</div>
        </div></div>`;
    }
  }).join("");
}

// ══════════════════════════════════════════════════════════
//  AUTO-DELETE at 2AM IST
// ══════════════════════════════════════════════════════════
async function runAutoDelete() {
  const ist = getNowIST();
  if (ist.getHours() !== 2 || ist.getMinutes() > 4) return;

  const prev       = new Date(ist.getTime() - 86400000);
  const expiredKey = prev.toISOString().slice(0, 10);

  // Delete attendance photos that were NOT favourited
  const { data: rows } = await sb.from("attendance")
    .select("id, user_name, type, photo_url, favourited")
    .eq("day_key", expiredKey);

  if (!rows) return;

  for (const row of rows) {
    if (row.type !== "home" && !row.favourited && row.photo_url) {
      // Delete from Storage
      const path = row.photo_url.split("/attendance-photos/")[1];
      if (path) await sb.storage.from("attendance-photos").remove([path]);
      // Null out the URL in DB
      await sb.from("attendance").update({ photo_url: null }).eq("id", row.id);
    }
  }

  // Delete old journal entries not saved to favourites
  // (keep the text rows lightweight — they're tiny)
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
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
