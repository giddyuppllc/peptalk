// Read-only. Asks App Store Connect what it actually holds for PepTalk:
// every version and its state, which build is attached, the subscriptions
// and their states, and the review submissions. Nothing is written.
//
// Run: node scripts/_store-state-ios.mjs
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = "9GTUH8JTAM";
const ISSUER = "be5215e8-dc3d-4200-a841-b0d2d4a7e0e2";
const APP_ID = "6760955746";
const KEY_PATH = "./keys/AppStoreConnect_9GTUH8JTAM.p8";

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
  const payload = b64({ iss: ISSUER, iat: now, exp: now + 600, aud: "appstoreconnect-v1" });
  const signer = crypto.createSign("SHA256");
  signer.update(`${header}.${payload}`);
  const der = signer.sign({ key: fs.readFileSync(KEY_PATH, "utf8"), dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${der.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

const JWT = token();
async function api(path) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${JWT}` },
  });
  const text = await res.text();
  if (!res.ok) return { __error: `${res.status} ${text.slice(0, 300)}` };
  return JSON.parse(text);
}

const p = console.log;

// ── the app itself ────────────────────────────────────────────────────
const app = await api(`/v1/apps/${APP_ID}`);
if (app.__error) { p("APP LOOKUP FAILED: " + app.__error); process.exit(1); }
p(`App: ${app.data.attributes.name}  (${app.data.attributes.bundleId})`);
p(`  SKU ${app.data.attributes.sku}   primaryLocale ${app.data.attributes.primaryLocale}`);

// ── versions ──────────────────────────────────────────────────────────
const vers = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=20&include=build`);
p(`\nVERSIONS (${vers.data?.length ?? 0}):`);
const builds = new Map((vers.included ?? []).filter(i => i.type === "builds").map(b => [b.id, b.attributes]));
for (const v of vers.data ?? []) {
  const a = v.attributes;
  const bId = v.relationships?.build?.data?.id;
  const b = bId ? builds.get(bId) : null;
  p(`  ${String(a.versionString).padEnd(8)} ${String(a.appStoreState).padEnd(26)} platform=${a.platform}`);
  p(`     created ${a.createdDate?.slice(0,10) ?? "?"}   releaseType=${a.releaseType ?? "?"}`);
  p(`     build attached: ${b ? `#${b.version} (uploaded ${b.uploadedDate?.slice(0,10)}, expired=${b.expired})` : "NONE — this is why review never starts"}`);
}

// ── builds actually uploaded ──────────────────────────────────────────
const bl = await api(`/v1/builds?filter[app]=${APP_ID}&limit=15&sort=-uploadedDate`);
p(`\nBUILDS UPLOADED (${bl.data?.length ?? 0} most recent):`);
for (const b of bl.data ?? []) {
  const a = b.attributes;
  p(`  #${String(a.version).padEnd(5)} ${String(a.processingState).padEnd(12)} uploaded ${a.uploadedDate?.slice(0,10)}  expired=${a.expired}  usesNonExemptEncryption=${a.usesNonExemptEncryption}`);
}

// ── subscriptions ─────────────────────────────────────────────────────
const groups = await api(`/v1/apps/${APP_ID}/subscriptionGroups?limit=10&include=subscriptions`);
p(`\nSUBSCRIPTION GROUPS (${groups.data?.length ?? 0}):`);
for (const g of groups.data ?? []) {
  p(`  group "${g.attributes.referenceName}"`);
}
for (const s of (groups.included ?? []).filter(i => i.type === "subscriptions")) {
  const a = s.attributes;
  p(`    ${String(a.productId).padEnd(38)} ${String(a.state).padEnd(24)} ${a.subscriptionPeriod ?? ""}  "${a.name}"`);
}

// ── review submissions ────────────────────────────────────────────────
const subs = await api(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=10&include=items`);
p(`\nREVIEW SUBMISSIONS (${subs.data?.length ?? 0}):`);
for (const s of subs.data ?? []) {
  const a = s.attributes;
  const n = s.relationships?.items?.data?.length ?? 0;
  p(`  ${String(a.state).padEnd(22)} submitted=${a.submittedDate?.slice(0,10) ?? "-"}  items=${n}`);
}
if (subs.__error) p("  (" + subs.__error + ")");
