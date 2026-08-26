// Stages App Store version 1.9.9: creates it, copies 1.9.8's metadata
// VERBATIM (Edward writes the copy — this only moves his existing words),
// copies the review demo account, and attaches build #69.
//
// It does NOT submit. Submission is a separate step so items can be
// verified as 3 (version + both subscriptions) before anything ships.
//
// Safe to re-run: every step checks for the existing object first.
import crypto from "node:crypto";
import fs from "node:fs";

const KEY_ID = "9GTUH8JTAM";
const ISSUER = "be5215e8-dc3d-4200-a841-b0d2d4a7e0e2";
const APP_ID = "6760955746";
const SRC_VERSION_ID = "cd4cb3ef-e044-4ede-b089-3f410f18d838"; // 1.9.8
const TARGET = "1.9.9";
const WANT_BUILD = "69";

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const hh = b64({ alg: "ES256", kid: KEY_ID, typ: "JWT" });
const pp = b64({ iss: ISSUER, iat: now, exp: now + 1200, aud: "appstoreconnect-v1" });
const sg = crypto.createSign("SHA256"); sg.update(`${hh}.${pp}`);
const JWT = `${hh}.${pp}.${sg.sign({ key: fs.readFileSync("./keys/AppStoreConnect_9GTUH8JTAM.p8", "utf8"), dsaEncoding: "ieee-p1363" }).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;

async function api(path, method = "GET", body) {
  const res = await fetch("https://api.appstoreconnect.apple.com" + path, {
    method,
    headers: { Authorization: "Bearer " + JWT, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  if (!res.ok) return { __error: `${res.status} ${t.slice(0, 500)}` };
  return t ? JSON.parse(t) : {};
}
const p = console.log;
const die = (m) => { p("\nSTOPPED: " + m); process.exit(1); };

// ── 0. source metadata (his words) ───────────────────────────────────
const srcLoc = await api(`/v1/appStoreVersions/${SRC_VERSION_ID}/appStoreVersionLocalizations`);
if (srcLoc.__error) die("could not read 1.9.8 localizations: " + srcLoc.__error);
const src = srcLoc.data[0].attributes;
const srcReview = await api(`/v1/appStoreVersions/${SRC_VERSION_ID}/appStoreReviewDetail`);
const rd = srcReview.data?.attributes;
p(`source: 1.9.8 en-US, description ${src.description.length} chars, demo account ${rd?.demoAccountName ?? "(none)"}`);

// ── 1. does 1.9.9 already exist? ─────────────────────────────────────
const all = await api(`/v1/apps/${APP_ID}/appStoreVersions?limit=20`);
let version = (all.data ?? []).find(v => v.attributes.versionString === TARGET);
if (version) {
  p(`\n1.9.9 already exists (${version.id}) state=${version.attributes.appStoreState} — reusing`);
} else {
  // Apple allows exactly ONE editable version. 1.9.8 is REJECTED, which is
  // still editable, so creating a second version is refused with
  // "You cannot create a new version of the App in the current state."
  // The build we want (#69) carries bundle version string 1.9.9, and Apple
  // requires the App Store version string to match the build's — so rename
  // the editable version rather than create a new one.
  const EDITABLE = new Set([
    "PREPARE_FOR_SUBMISSION", "REJECTED", "DEVELOPER_REJECTED",
    "METADATA_REJECTED", "INVALID_BINARY", "DEVELOPER_REMOVED_FROM_SALE",
  ]);
  const open = (all.data ?? []).find(v => EDITABLE.has(v.attributes.appStoreState));
  if (!open) die("no editable version to rename, and a new one cannot be created");
  p(`\nno ${TARGET} version exists; ${open.attributes.versionString} is ${open.attributes.appStoreState} (editable)`);

  const renamed = await api(`/v1/appStoreVersions/${open.id}`, "PATCH", {
    data: { type: "appStoreVersions", id: open.id, attributes: { versionString: TARGET } },
  });
  if (renamed.__error) die(`rename ${open.attributes.versionString} -> ${TARGET} failed: ` + renamed.__error);
  version = renamed.data;
  p(`renamed version string ${open.attributes.versionString} -> ${TARGET} (same record ${open.id})`);
}
const VID = version.id;

// ── 2. localization: copy his text across verbatim ───────────────────
const loc = await api(`/v1/appStoreVersions/${VID}/appStoreVersionLocalizations`);
let enUS = (loc.data ?? []).find(l => l.attributes.locale === "en-US");
const wanted = {
  description: src.description,
  keywords: src.keywords,
  promotionalText: src.promotionalText,
  supportUrl: src.supportUrl,
  marketingUrl: src.marketingUrl,
};
if (!enUS) {
  const mk = await api("/v1/appStoreVersionLocalizations", "POST", {
    data: {
      type: "appStoreVersionLocalizations",
      attributes: { locale: "en-US", ...wanted },
      relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: VID } } },
    },
  });
  if (mk.__error) die("create localization failed: " + mk.__error);
  enUS = mk.data;
  p("created en-US localization with 1.9.8's exact text");
} else {
  const cur = enUS.attributes;
  const drift = Object.entries(wanted).filter(([k, v]) => (cur[k] ?? null) !== (v ?? null)).map(([k]) => k);
  if (drift.length) {
    const patch = await api(`/v1/appStoreVersionLocalizations/${enUS.id}`, "PATCH", {
      data: { type: "appStoreVersionLocalizations", id: enUS.id, attributes: wanted },
    });
    if (patch.__error) die("patch localization failed: " + patch.__error);
    p(`localization existed; copied across: ${drift.join(", ")}`);
  } else {
    p("localization already matches 1.9.8 exactly");
  }
}
// Verify byte-identical
const check = await api(`/v1/appStoreVersionLocalizations/${enUS.id}`);
const same = check.data.attributes.description === src.description
  && check.data.attributes.keywords === src.keywords
  && check.data.attributes.promotionalText === src.promotionalText;
p(`  metadata byte-identical to 1.9.8: ${same ? "YES" : "NO — CHECK THIS"}`);
if (!same) die("metadata did not copy cleanly");

// ── 3. review detail (demo account the reviewer needs) ───────────────
const curRd = await api(`/v1/appStoreVersions/${VID}/appStoreReviewDetail`);
if (curRd.data && curRd.data.id) {
  const a = curRd.data.attributes;
  if (a.demoAccountName !== rd.demoAccountName || a.demoAccountPassword !== rd.demoAccountPassword || !a.demoAccountRequired) {
    const up = await api(`/v1/appStoreReviewDetails/${curRd.data.id}`, "PATCH", {
      data: { type: "appStoreReviewDetails", id: curRd.data.id, attributes: {
        contactFirstName: rd.contactFirstName, contactLastName: rd.contactLastName,
        contactPhone: rd.contactPhone, contactEmail: rd.contactEmail,
        demoAccountName: rd.demoAccountName, demoAccountPassword: rd.demoAccountPassword,
        demoAccountRequired: true, notes: rd.notes,
      } },
    });
    if (up.__error) die("patch review detail failed: " + up.__error);
    p("review detail: copied demo account + notes from 1.9.8");
  } else p("review detail already carries the demo account");
} else {
  const mk = await api("/v1/appStoreReviewDetails", "POST", {
    data: { type: "appStoreReviewDetails", attributes: {
      contactFirstName: rd.contactFirstName, contactLastName: rd.contactLastName,
      contactPhone: rd.contactPhone, contactEmail: rd.contactEmail,
      demoAccountName: rd.demoAccountName, demoAccountPassword: rd.demoAccountPassword,
      demoAccountRequired: true, notes: rd.notes,
    }, relationships: { appStoreVersion: { data: { type: "appStoreVersions", id: VID } } } },
  });
  if (mk.__error) die("create review detail failed: " + mk.__error);
  p("review detail created with 1.9.8's demo account + notes");
}

// ── 4. attach build #69 ──────────────────────────────────────────────
const builds = await api(`/v1/builds?filter[app]=${APP_ID}&filter[version]=${WANT_BUILD}&limit=5`);
const build = builds.data?.[0];
if (!build) die(`build #${WANT_BUILD} not found`);
p(`\nbuild #${WANT_BUILD} -> ${build.id} (${build.attributes.processingState}, expired=${build.attributes.expired})`);
if (build.attributes.expired) die("build is expired — pick another");

const rel = await api(`/v1/appStoreVersions/${VID}/relationships/build`, "PATCH", {
  data: { type: "builds", id: build.id },
});
if (rel.__error) die("attach build failed: " + rel.__error);

const confirm = await api(`/v1/appStoreVersions/${VID}?include=build`);
const attached = confirm.included?.find(i => i.type === "builds");
p(`attached build: ${attached ? "#" + attached.attributes.version : "NONE — attach silently failed"}`);
if (!attached || attached.attributes.version !== WANT_BUILD) die("build did not attach");

p(`\nSTAGED. version ${TARGET} (${VID}) state=${confirm.data.attributes.appStoreState}, build #${WANT_BUILD} attached.`);
p("Not submitted. Next step adds the two subscriptions and submits.");
fs.writeFileSync("/tmp/ios199.json", JSON.stringify({ versionId: VID, buildId: build.id }, null, 1));
