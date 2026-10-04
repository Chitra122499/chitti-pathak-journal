// ══════════════════════════════════════════════════════════
//  FIREBASE CONFIGURATION
//  Replace the values below with your own Firebase project.
//
//  HOW TO GET THESE VALUES:
//  1. Go to https://console.firebase.google.com
//  2. Create a project (any name)
//  3. Go to Project Settings (gear icon) → "Your apps" → click </>
//  4. Register a web app → copy the config object here
//  5. Also enable "Realtime Database" from the left sidebar
//     → Create Database → Test mode → Enable
// ══════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyAPeFd3G45RoAlQREK4hVe2eSBGPZ7jSY8",
  authDomain:        "websitevpc-828f3.firebaseapp.com",
  databaseURL:       "https://websitevpc-828f3-default-rtdb.firebaseio.com",
  projectId:         "websitevpc-828f3",
  storageBucket:     "websitevpc-828f3.firebasestorage.app",
  messagingSenderId: "394262635634",
  appId:             "1:394262635634:web:b5702feaa3a69bd5824eeb"
};

// ══════════════════════════════════════════════════════════
//  USER CREDENTIALS
//  Change these PINs to whatever you want.
//  Share the site URL only with Chitti and Pathak.
// ══════════════════════════════════════════════════════════

const USER_CREDENTIALS = {
  Chitti: "1234",   // ← change this PIN
  Pathak: "5678"    // ← change this PIN
};

// ══════════════════════════════════════════════════════════
//  SECRET URL KEY  (optional extra security)
//  If set, the URL must contain ?key=VALUE to open the site.
//  Example: https://yoursite.com/index.html?key=sunflower
//  Set to "" to disable this check.
// ══════════════════════════════════════════════════════════

const SECRET_URL_KEY = "";  // Disabled — PIN login is the security layer
