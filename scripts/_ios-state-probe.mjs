// READ-ONLY probe of everything that decides whether 1.9.9 can be submitted
// with its subscriptions. Changes nothing.
//
// Written because the recorded belief -- "subscriptions cannot be attached via
// the API" -- has never been re-tested against a live submission, and it is the
// single thing that has blocked the iOS release for six weeks.
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = "9GTUH8JTAM";
const ISSUER = "be5215e8-dc3d-4200-a841-b0d2d4a7e0e2";
const APP_ID = "6760955746";

const b64 = (o) =>
  Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
    .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const hh = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
const pp = b64({ iss: ISSUER, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
const sg = crypto.createSign("SHA256");
sg.update(`${hh}.${pp}`);
const JWT = `${hh}.${pp}.${sg
  .sign({ key: fs.readFileSync("./keys/AppStoreConnect_9GTUH8JTAM.p8", "utf8"), dsaEncoding: "ieee-p1363" })
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

async function api(path) {
  const res = await fetch("https://api.appstoreconnect.apple.com" + path, {
    headers: { Authorization: "Bearer " + JWT, "Content-Type": "application/json" },
  });
  const txt = await res.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { /* non-json */ }
  return { status: res.status, json, txt };
}

console.log("=== APP STORE VERSIONS ===");
const vers = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=5`);
const versions = vers.json?.data ?? [];
for (const v of versions) {
  console.log(`  ${v.attributes.versionString.padEnd(8)} ${v.attributes.appStoreState.padEnd(26)} id=${v.id}`);
}
const target = versions.find((v) => v.attributes.versionString === "1.9.9") ?? versions[0];
if (!target) { console.log("  no versions found"); process.exit(0); }

console.log(`\n=== BUILD ATTACHED TO ${target.attributes.versionString} ===`);
const b = await api(`/v1/appStoreVersions/${target.id}/build`);
console.log("  " + (b.json?.data ? `#${b.json.data.attributes?.version} id=${b.json.data.id}` : "NONE ATTACHED"));

console.log("\n=== SUBSCRIPTIONS ===");
const groups = await api(`/v1/apps/${APP_ID}/subscriptionGroups?limit=10`);
const subs = [];
for (const g of groups.json?.data ?? []) {
  const s = await api(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=20`);
  for (const x of s.json?.data ?? []) {
    subs.push(x);
    console.log(`  ${x.attributes.productId.padEnd(24)} ${String(x.attributes.state).padEnd(24)} id=${x.id}`);
  }
}

console.log("\n=== REVIEW SUBMISSIONS ===");
const rs = await api(`/v1/reviewSubmissions?filter[app]=${APP_ID}&limit=20`);
for (const r of rs.json?.data ?? []) {
  const items = await api(`/v1/reviewSubmissions/${r.id}/items`);
  const n = items.json?.data?.length ?? 0;
  console.log(`  ${String(r.attributes.state).padEnd(22)} submitted=${r.attributes.submittedDate ?? "-"} items=${n} id=${r.id}`);
  // An OPEN submission is the one a new item would have to join.
  if (r.attributes.state === "READY_FOR_REVIEW" || r.attributes.state === "COMPLETING") {
    console.log(`     ^ OPEN — canRemoveItems=${r.attributes.canRemoveItems} canSubmit=${r.attributes.canSubmit}`);
  }
}

// THE question: does the API model a subscription as a submittable item at all?
console.log("\n=== CAN A SUBSCRIPTION BE A REVIEW ITEM? ===");
const probe = await fetch("https://api.appstoreconnect.apple.com/v1/reviewSubmissionItems", {
  method: "POST",
  headers: { Authorization: "Bearer " + JWT, "Content-Type": "application/json" },
  // Deliberately malformed: omits reviewSubmission, so Apple must reject it.
  // What matters is WHICH error comes back. "unknown relationship subscription"
  // means the API has no such concept; a complaint about the MISSING
  // reviewSubmission means it does, and the path is viable.
  body: JSON.stringify({
    data: {
      type: "reviewSubmissionItems",
      relationships: { subscription: { data: { type: "subscriptions", id: subs[0]?.id ?? "0" } } },
    },
  }),
});
const ptxt = await probe.text();
console.log(`  probe status ${probe.status}`);
try {
  for (const e of JSON.parse(ptxt).errors ?? []) {
    console.log(`   - ${e.code}: ${e.detail ?? e.title}`);
  }
} catch { console.log("   " + ptxt.slice(0, 300)); }
console.log("\n(no changes were made)");
