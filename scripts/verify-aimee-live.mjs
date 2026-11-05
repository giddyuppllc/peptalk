#!/usr/bin/env node
/**
 * Live end-to-end check that Aimee answers with a real model reply.
 *
 * Signs in as a real PepTalk account (use a Plus/Pro or beta-tester account —
 * free accounts get 3 answer-only messages a month), streams one question
 * through the DEPLOYED aimee-chat-stream, and fails unless model text comes
 * back. Text from this endpoint can only come from Grok — the on-device
 * fallback bot never runs here — so "text_delta" events are the proof.
 *
 * The default question needs a tool (it reads the account's own data), which
 * also exercises the "I'll pull your trends now… and nothing" fix: the run
 * passes only if real text follows the tool calls.
 *
 *   PEPTALK_EMAIL=… PEPTALK_PASSWORD=… node scripts/verify-aimee-live.mjs ["question"]
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY from the
 * environment or .env. Sends ONE chat message on that account (it counts
 * against its monthly allowance and is saved to its chat history).
 */
import { readFileSync, existsSync } from 'node:fs';

function envFromFile() {
  if (!existsSync('.env')) return {};
  return Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  );
}
const fileEnv = envFromFile();
const env = (k) => process.env[k] ?? fileEnv[k];

const URL_ = env('EXPO_PUBLIC_SUPABASE_URL');
const ANON = env('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const EMAIL = env('PEPTALK_EMAIL');
const PASSWORD = env('PEPTALK_PASSWORD');
const QUESTION = process.argv[2] ?? 'How have my check-ins trended over the last 14 days?';

if (!URL_ || !ANON || !EMAIL || !PASSWORD) {
  console.error('Need EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, PEPTALK_EMAIL, PEPTALK_PASSWORD');
  process.exit(2);
}

const auth = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!auth.ok) {
  console.error(`sign-in failed: HTTP ${auth.status} ${await auth.text()}`);
  process.exit(1);
}
const { access_token } = await auth.json();

const started = Date.now();
const res = await fetch(`${URL_}/functions/v1/aimee-chat-stream`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${access_token}`,
    apikey: ANON,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  },
  body: JSON.stringify({
    messages: [{ role: 'user', content: QUESTION }],
    context: { localDate: new Date().toISOString().slice(0, 10) },
    conversationId: null,
  }),
});
if (!res.ok) {
  console.error(`aimee-chat-stream: HTTP ${res.status} ${await res.text()}`);
  process.exit(1);
}

const counts = {};
let text = '';
let firstEventMs = null;
let error = null;
const decoder = new TextDecoder();
let buf = '';
for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  let i;
  while ((i = buf.indexOf('\n\n')) >= 0) {
    const frame = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const line = frame.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line.slice(6)); } catch { continue; }
    firstEventMs ??= Date.now() - started;
    counts[ev.type] = (counts[ev.type] ?? 0) + 1;
    if (ev.type === 'text_delta') text += ev.text ?? '';
    if (ev.type === 'tool_use') console.log(`  tool: ${ev.name}`);
    if (ev.type === 'error') error = ev.message;
  }
}

const total = ((Date.now() - started) / 1000).toFixed(1);
console.log(`events: ${JSON.stringify(counts)}`);
console.log(`first event ${firstEventMs ?? '—'}ms · total ${total}s`);
console.log(`\n--- Aimee ---\n${text.trim() || '(no text)'}\n`);
if (error) {
  console.error(`FAIL: stream error: ${error}`);
  process.exit(1);
}
if (!text.trim()) {
  console.error('FAIL: no model text came back.');
  process.exit(1);
}
if ((counts.tool_use ?? 0) > 0 && text.trim().split(/\s+/).length < 15) {
  console.error('FAIL: tools ran but the answer is only a preamble.');
  process.exit(1);
}
console.log('PASS: a real model reply came back.');
