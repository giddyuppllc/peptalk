// Submits 1.9.9 for review WITH both subscriptions in the SAME submission.
//
// Five previous submissions each carried items=1 (the app version alone).
// A first subscription must be reviewed alongside a version, otherwise the
// reviewer's sandbox has no approved products, the purchase fails, and the
// app is rejected for broken IAP. That is the loop this breaks.
//
// Hard guard: it refuses to submit unless the submission holds exactly the
// 3 expected items.
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = "9GTUH8JTAM";
const ISSUER = "be5215e8-dc3d-4200-a841-b0d2d4a7e0e2";
const APP_ID = "6760955746";
const { versionId: VID } = JSON.parse(fs.readFileSync("/tmp/ios199.json", "utf8"));
const WANT_SUBS = ["peptalk_plus_monthly", "peptalk_pro_monthly"];
const DO_SUBMIT = process.argv.includes("--submit");

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const hh = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
const pp = b64({ iss: ISSUER, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
const sg = crypto.createSign("SHA256"); sg.update(`${hh}.${pp}`);
const JWT = `${hh}.${pp}.${sg.sign({ key: fs.readFileSync("./keys/AppStoreConnect_9GTUH8JTAM.p8", "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

async function api(path, method = "GET", body) {
  const res = await fetch("https://api.appstoreconnect.apple.com" + path, {
    method, headers: { Authorization: "Bearer " + JWT, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  if (!res.ok) return { __error: `${res.status} ${t.slice(0, 600)}` };
  return t ? JSON.parse(t) : {};
}
const p = console.log;
const die = (m) => { p("\nSTOPPED: " + m); process.exit(1); };

// ── subscriptions ────────────────────────────────────────────────────
const groups = await api(`/v1/apps/${APP_ID}/subscriptionGroups?limit=10&include=subscriptions`);
const subs = (groups.included ?? []).filter(i => i.type === "subscriptions");
const targets = WANT_SUBS.map(pid => {
  const s = subs.find(x => x.attributes.productId === pid);
  if (!s) die(`subscription ${pid} not found`);
  p(`  ${pid}  state=${s.attributes.state}  id=${s.id}`);
  return s;
});

// ── existing open submission? ────────────────────────────────────────
const existing = await api(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=20`);
const OPEN = new Set(["READY_FOR_REVIEW", "WAITING_FOR_REVIEW", "IN_REVIEW", "UNRESOLVED_ISSUES"]);
let sub = (existing.data ?? []).find(s => OPEN.has(s.attributes.state) && !s.attributes.submittedDate);
const stuck = (existing.data ?? []).filter(s => s.attributes.state === "UNRESOLVED_ISSUES" && s.attributes.submittedDate);
if (stuck.length) {
  p(`\nnote: ${stuck.length} submitted submission(s) sit in UNRESOLVED_ISSUES (the rejection).`);
}

if (!sub) {
  const mk = await api("/v1/reviewSubmissions", "POST", {
    data: { type: "reviewSubmissions", attributes: { platform: "IOS" },
      relationships: { app: { data: { type: "apps", id: APP_ID } } } },
  });
  if (mk.__error) die("create review submission failed: " + mk.__error);
  sub = mk.data;
  p(`\ncreated review submission ${sub.id}`);
} else {
  p(`\nreusing open review submission ${sub.id} (state=${sub.attributes.state})`);
}
const SID = sub.id;

// ── add the 3 items, skipping any already present ────────────────────
const addItem = async (rel, label) => {
  const r = await api("/v1/reviewSubmissionItems", "POST", {
    data: { type: "reviewSubmissionItems", relationships: {
      reviewSubmission: { data: { type: "reviewSubmissions", id: SID } }, ...rel } },
  });
  if (r.__error) {
    if (/already/i.test(r.__error)) { p(`  ${label}: already in submission`); return; }
    die(`adding ${label} failed: ` + r.__error);
  }
  p(`  added ${label}`);
};

const before = await api(`/v1/reviewSubmissions/${SID}/items`);
const have = new Set();
for (const it of before.data ?? []) {
  for (const k of ["appStoreVersion", "appCustomProductPageVersion", "subscription"]) {
    const id = it.relationships?.[k]?.data?.id;
    if (id) have.add(id);
  }
}
p(`\nitems already on submission: ${before.data?.length ?? 0}`);

if (!have.has(VID)) await addItem({ appStoreVersion: { data: { type: "appStoreVersions", id: VID } } }, "app version 1.9.9");
else p("  app version 1.9.9: already in submission");

for (const s of targets) {
  if (!have.has(s.id)) await addItem({ subscription: { data: { type: "subscriptions", id: s.id } } }, `subscription ${s.attributes.productId}`);
  else p(`  ${s.attributes.productId}: already in submission`);
}

// ── verify before submitting ─────────────────────────────────────────
const after = await api(`/v1/reviewSubmissions/${SID}/items?include=appStoreVersion,subscription`);
const items = after.data ?? [];
p(`\nSUBMISSION NOW HOLDS ${items.length} ITEM(S):`);
for (const it of items) {
  const kinds = Object.entries(it.relationships ?? {})
    .filter(([, v]) => v?.data?.id).map(([k, v]) => `${k}=${v.data.id.slice(0, 8)}`);
  p(`   ${it.attributes?.state ?? "?"}  ${kinds.join(" ")}`);
}
if (items.length !== 3) die(`expected 3 items (version + 2 subs), got ${items.length} — NOT submitting`);
p("\n3 items confirmed: the version and both subscriptions travel together.");

if (!DO_SUBMIT) { p("\nDry run. Re-run with --submit to send it to Apple."); process.exit(0); }

const done = await api(`/v1/reviewSubmissions/${SID}`, "PATCH", {
  data: { type: "reviewSubmissions", id: SID, attributes: { submitted: true } },
});
if (done.__error) die("submit failed: " + done.__error);
p(`\nSUBMITTED. state=${done.data.attributes.state}  submittedDate=${done.data.attributes.submittedDate ?? "(pending)"}`);
