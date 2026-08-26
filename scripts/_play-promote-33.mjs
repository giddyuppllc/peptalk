// Promotes version code 33 to the production track.
//
// Production has been on vc24 while vc33 sat as an undistributed draft in
// internal. Carries the draft's own release name verbatim — no new copy.
// Validates the edit before committing, and re-reads the track afterwards
// from a fresh edit, because a commit that returns 200 is not proof the
// track actually changed.
//
// Run with --commit to actually ship. Without it, validate only.
import crypto from "node:crypto";
import fs from "node:fs";

const PKG = "com.peptalkapp.peptalk";
const VC = "33";
const DO_COMMIT = process.argv.includes("--commit");
const SA = JSON.parse(fs.readFileSync("./keys/google-play-service-account.json", "utf8"));

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const now = Math.floor(Date.now() / 1000);
const hd = b64({ alg: "RS256", typ: "JWT" });
const cl = b64({ iss: SA.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
  aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
const sg = crypto.createSign("RSA-SHA256"); sg.update(`${hd}.${cl}`);
const jwt = `${hd}.${cl}.${sg.sign(SA.private_key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
const tr = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
});
const TOKEN = (await tr.json()).access_token;
if (!TOKEN) { console.log("auth failed"); process.exit(1); }

const api = async (p, init = {}) => {
  const r = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${p}`, {
    ...init, headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await r.text();
  return r.ok ? (t ? JSON.parse(t) : {}) : { __error: `${r.status} ${t.slice(0, 400)}` };
};
const p = console.log;
const die = (m) => { p("\nSTOPPED: " + m); process.exit(1); };

const edit = await api("/edits", { method: "POST" });
if (edit.__error) die("open edit: " + edit.__error);
p(`edit ${edit.id}`);

// the draft we are promoting — reuse its name, do not invent one
const internal = await api(`/edits/${edit.id}/tracks/internal`);
const draft = (internal.releases ?? []).find(r => (r.versionCodes ?? []).includes(VC));
if (!draft) die(`vc${VC} is not on the internal track`);
p(`source draft: name="${draft.name}" status=${draft.status} notes=${draft.releaseNotes ? "yes" : "none"}`);

const before = await api(`/edits/${edit.id}/tracks/production`);
p(`production before: ${JSON.stringify((before.releases ?? []).map(r => ({ vc: r.versionCodes, status: r.status })))}`);

const release = { name: draft.name, versionCodes: [VC], status: "completed" };
if (draft.releaseNotes) release.releaseNotes = draft.releaseNotes; // his words, carried verbatim

const put = await api(`/edits/${edit.id}/tracks/production`, {
  method: "PUT", body: JSON.stringify({ track: "production", releases: [release] }),
});
if (put.__error) die("set production track: " + put.__error);
p(`staged production -> vc${VC} (${put.releases?.[0]?.status})`);

const valid = await api(`/edits/${edit.id}:validate`, { method: "POST" });
if (valid.__error) die("validate failed: " + valid.__error);
p("edit validates OK");

if (!DO_COMMIT) {
  await api(`/edits/${edit.id}`, { method: "DELETE" });
  p("\nDry run — edit discarded, production still on vc24. Re-run with --commit to ship.");
  process.exit(0);
}

const commit = await api(`/edits/${edit.id}:commit`, { method: "POST" });
if (commit.__error) die("commit failed: " + commit.__error);
p(`committed edit ${commit.id}`);

// verify from a FRESH edit — a 200 on commit is not proof
const v = await api("/edits", { method: "POST" });
const after = await api(`/edits/${v.id}/tracks/production`);
p(`\nproduction after: ${JSON.stringify((after.releases ?? []).map(r => ({ vc: r.versionCodes, status: r.status, name: r.name })))}`);
await api(`/edits/${v.id}`, { method: "DELETE" });
const live = (after.releases ?? []).some(r => (r.versionCodes ?? []).includes(VC) && r.status === "completed");
p(live ? `\nCONFIRMED: production is now vc${VC}, full rollout.` : `\nWARNING: vc${VC} is not showing as the live production release.`);
