// Runs at Netlify build time — generates supabase-config.js from env vars
const fs = require("fs");

const url     = process.env.SUPABASE_URL      || "";
const anon    = process.env.SUPABASE_ANON     || "";
const chitti  = process.env.PIN_CHITTI        || "1234";
const pathak  = process.env.PIN_PATHAK        || "5678";
const osAppId = process.env.ONESIGNAL_APP_ID  || "";
const osKey   = process.env.ONESIGNAL_API_KEY || "";

if (!url || !anon) {
  console.error("ERROR: SUPABASE_URL and SUPABASE_ANON env vars are required");
  process.exit(1);
}

const content = `const SUPABASE_URL  = "${url}";
const SUPABASE_ANON = "${anon}";
const USER_CREDENTIALS = { Chitti: "${chitti}", Pathak: "${pathak}" };
const ONESIGNAL_APP_ID  = "${osAppId}";
const ONESIGNAL_API_KEY = "${osKey}";
`;

fs.writeFileSync("supabase-config.js", content);
console.log("✅ supabase-config.js generated successfully");
console.log("   SUPABASE_URL:", url);
console.log("   ONESIGNAL_APP_ID:", osAppId);
