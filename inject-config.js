// Runs at Netlify build time — generates supabase-config.js from env vars
const fs = require("fs");

const content = `
const SUPABASE_URL  = "${process.env.SUPABASE_URL}";
const SUPABASE_ANON = "${process.env.SUPABASE_ANON}";
const USER_CREDENTIALS = { Chitti: "${process.env.PIN_CHITTI || '1234'}", Pathak: "${process.env.PIN_PATHAK || '5678'}" };
const ONESIGNAL_APP_ID  = "${process.env.ONESIGNAL_APP_ID}";
const ONESIGNAL_API_KEY = "${process.env.ONESIGNAL_API_KEY}";
`;

fs.writeFileSync("supabase-config.js", content.trim());
console.log("supabase-config.js generated successfully.");
