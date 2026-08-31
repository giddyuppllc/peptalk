// RECOVERED FROM PRODUCTION — not the original source.
//
// `send-welcome-email` (deployed version 3) is live on the PepTalk Supabase project and has
// NO source anywhere in this repo. Nobody could review it, diff it, or redeploy
// it; if it were deleted or needed a change it was gone.
//
// This was pulled back out of the deployed bundle on 2026-08-31 via
// `GET /v1/projects/{ref}/functions/send-welcome-email/body`, which returns an ESZIP
// archive, and extracted from it.
//
// WHAT THIS IS AND IS NOT:
//   - It is the deployed module, faithfully: comments survived, logic intact,
//     brace-balanced, ends at the serve() handler.
//   - It is TRANSPILED. TypeScript annotations were stripped by the build, so
//     this is not byte-identical to whatever was written originally, and
//     formatting has been normalised.
//
// It lives under `_recovered/` ON PURPOSE. Directories starting with `_` are not
// treated as functions, so nothing here is in the deploy path — `supabase
// functions deploy` cannot pick it up and push a reconstruction over working
// production code.
//
// To adopt it: read it, restore the types, move it to
// `supabase/functions/send-welcome-email/index.ts`, and only then deploy.

/**
 * send-welcome-email — one message, once, when an account is created.
 *
 * WHY A FUNCTION AND NOT A DATABASE TRIGGER
 * `handle_new_user()` runs inside the same transaction as the auth.users
 * insert. Anything that throws in there rolls the signup back, which is how a
 * bad trigger takes down account creation entirely. An email is not worth that
 * risk, so it happens after the fact, over HTTP, where a failure is just a
 * missing email.
 *
 * WHY IT CANNOT BE SPAMMED
 * verify_jwt is on, so the caller must already hold a session for the account
 * they are emailing — the address comes from the VERIFIED token, never from the
 * request body. A caller cannot ask this to mail someone else.
 *
 * SENT ONCE
 * Guarded on profiles.welcome_email_sent_at. Without it, every re-login or
 * client retry would send another copy, which is the fastest route to a spam
 * complaint on a freshly warmed domain.
 */ import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { reportError } from '../_shared/sentry.ts';
import { sendEmail, wrap, emailEnabled } from '../_shared/email.ts';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (b, status = 200)=>new Response(JSON.stringify(b), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) return json({
      error: 'Unauthorized'
    }, 401);
    const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user?.email) return json({
      error: 'Unauthorized'
    }, 401);
    if (!emailEnabled()) {
      // Report honestly rather than claiming a send. The caller ignores the
      // response either way, but the logs should not imply mail went out.
      return json({
        ok: true,
        sent: false,
        reason: 'email not configured'
      });
    }
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    // Claim the send BEFORE dispatching. Two rapid calls would otherwise both
    // read null and both send.
    const { data: claimed, error: claimErr } = await admin.from('profiles').update({
      welcome_email_sent_at: new Date().toISOString()
    }).eq('id', user.id).is('welcome_email_sent_at', null).select('id');
    if (claimErr) throw claimErr;
    if (!claimed || claimed.length === 0) {
      return json({
        ok: true,
        sent: false,
        reason: 'already sent'
      });
    }
    const firstName = user.user_metadata?.first_name?.trim() || '';
    const greeting = firstName ? `Welcome, ${firstName}.` : 'Welcome to PepTalk.';
    const sent = await sendEmail({
      to: user.email,
      subject: 'Welcome to PepTalk',
      text: `${greeting}\n\n` + `Your account is ready. You can track doses and protocols, log ` + `check-ins, and ask Aimee questions about what you are researching.\n\n` + `PepTalk is for educational purposes only and does not provide ` + `medical advice. Consult your healthcare provider before making ` + `health decisions.`,
      html: wrap(greeting, `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;">Your account is ready.</p>
         <p style="margin:0;font-size:15px;line-height:1.55;">You can track doses and protocols, log check-ins, and ask Aimee questions about what you are researching.</p>`)
    });
    if (!sent) {
      // Release the claim so a later attempt can retry rather than the user
      // silently never receiving a welcome.
      await admin.from('profiles').update({
        welcome_email_sent_at: null
      }).eq('id', user.id);
    }
    return json({
      ok: true,
      sent
    });
  } catch (err) {
    reportError('send-welcome-email', err);
    console.error('[send-welcome-email]', err);
    return json({
      error: 'Internal error'
    }, 500);
  }
});
