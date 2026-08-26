// Read-only. Asks Google Play what is actually live on each track.
// Opens an edit (required by the API to read tracks) and DELETES it again —
// an edit that is never committed changes nothing.
//
// Run: node scripts/_store-state-play.mjs
import crypto from "node:crypto";
import fs from "node:fs";

const PKG = "com.peptalkapp.peptalk";
const SA = JSON.parse(fs.readFileSync("./keys/google-play-service-account.json", "utf8"));

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o))
  .toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "RS256", typ: "JWT" });
  const claim = b64({
    iss: SA.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(SA.private_key).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token failed: " + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}

const p = console.log;
const TOKEN = await accessToken();
const api = async (path, init = {}) => {
  const res = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}${path}`, {
    ...init, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const t = await res.text();
  if (!res.ok) return { __error: `${res.status} ${t.slice(0, 300)}` };
  return t ? JSON.parse(t) : {};
};

p(`service account: ${SA.client_email}`);

const edit = await api("/edits", { method: "POST" });
if (edit.__error) { p("EDIT FAILED: " + edit.__error); process.exit(1); }
p(`opened throwaway edit ${edit.id}\n`);

try {
  const tracks = await api(`/edits/${edit.id}/tracks`);
  if (tracks.__error) p("tracks error: " + tracks.__error);
  for (const t of tracks.tracks ?? []) {
    p(`TRACK ${t.track}`);
    if (!t.releases?.length) { p("   (no releases)"); continue; }
    for (const r of t.releases) {
      p(`   status=${String(r.status).padEnd(12)} name="${r.name ?? "-"}"  versionCodes=${(r.versionCodes ?? []).join(",") || "none"}`);
      if (r.userFraction) p(`      staged rollout: ${(r.userFraction * 100).toFixed(0)}%`);
    }
  }

  const bundles = await api(`/edits/${edit.id}/bundles`);
  if (!bundles.__error) {
    const list = (bundles.bundles ?? []).map(b => b.versionCode).sort((a, b) => b - a);
    p(`\nAAB version codes uploaded (${list.length}): ${list.slice(0, 12).join(", ")}${list.length > 12 ? " …" : ""}`);
    p(`  highest uploaded: ${list[0] ?? "none"}`);
  }
} finally {
  const del = await api(`/edits/${edit.id}`, { method: "DELETE" });
  p(`\nthrowaway edit deleted${del.__error ? " (" + del.__error + ")" : " — nothing was changed"}`);
}
