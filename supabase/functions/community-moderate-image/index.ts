/**
 * community-moderate-image — async vision-based image moderation.
 *
 * Triggered by the AFTER INSERT trigger on community_posts /
 * community_comments via pg_net.http_post when image_urls is non-empty.
 *
 * Flow:
 *   1. Receive { targetType, targetId, imageUrls[] }.
 *   2. For each URL, fetch the image bytes and run them through Grok
 *      Vision with a strict moderation prompt.
 *   3. If ANY image flags → soft-delete the parent row + write a row
 *      to community_moderation_log with categories + reason.
 *   4. If all pass → update moderation_status='approved'.
 *
 * Categories the model checks for:
 *   - sexual_explicit       (genitalia, sex acts)
 *   - sexual_suggestive     (revealing without nudity)
 *   - violence_gore         (graphic injury, blood)
 *   - hate_symbols          (swastika, etc.)
 *   - csam                  (any minor in inappropriate context — IMMEDIATE flag)
 *   - drug_paraphernalia    (illegal drugs, NOT peptide vials/syringes)
 *   - weapons               (firearms, blades in threatening context)
 *   - spam_offtopic         (memes, ads, unrelated to peptide/health)
 *
 * NOT flagged:
 *   - Peptide vials, syringes, BAC water (this is a peptide app)
 *   - Workout / progress photos in normal athletic attire
 *   - Bloodwork / lab reports
 *   - Food photos
 *
 * Fail-safe: if vision call errors, we log and AUTO-APPROVE (mark as
 * approved). Better to publish than to silently lose user content.
 * Reports + manual moderation cover false negatives.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const OPENAI_BASE_URL = Deno.env.get('OPENAI_BASE_URL') ?? 'https://api.x.ai/v1';
const VISION_MODEL = 'grok-4-1-fast-reasoning';

const MODERATION_PROMPT = `You are an image moderation classifier for a peptide / health-tracking app called PepTalk. Users post photos in a community forum about peptide protocols, fitness, nutrition, and bloodwork.

Return ONLY a JSON object in this exact shape:
{
  "flagged": true | false,
  "categories": ["sexual_explicit", "violence_gore", ...],
  "confidence": 0.0 - 1.0,
  "reason": "short human-readable sentence explaining the flag, or empty string if not flagged"
}

FLAG categories (any of these → flagged: true):
- sexual_explicit       genitalia, sex acts, full nudity
- sexual_suggestive     revealing-but-not-nude content posted in a sexual framing
- violence_gore         graphic injury, blood, serious wounds
- hate_symbols          swastika, KKK, neo-nazi imagery, racial slur graphics
- csam                  ANY minor in inappropriate context — flag immediately, highest confidence
- drug_paraphernalia    illegal recreational drugs (cocaine, meth, heroin, etc.) — peptide vials, syringes, and BAC water are NOT flagged
- weapons               firearms or blades posed threateningly
- spam_offtopic         meme images, advertisements, scams unrelated to peptide/fitness/nutrition

DO NOT flag:
- Peptide vials, syringes, reconstitution supplies, BAC water bottles
- Workout, gym, or progress photos in normal athletic attire (sports bras, gym shorts, swimwear in fitness context)
- Bloodwork or lab report photographs
- Food, recipe, or pantry photos
- Body composition photos that are clearly progress-tracking, not sexualized

If unsure, default to flagged: false (better to publish than lose content). Reports + manual moderation handle borderline cases. Output JSON only — no prose, no markdown fences.`;

interface ModerationResult {
  flagged: boolean;
  categories: string[];
  confidence: number;
  reason: string;
}

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function moderateOne(url: string): Promise<{ result: ModerationResult; raw: any } | null> {
  // Fetch the image and convert to base64 — Grok Vision accepts both
  // URL and base64; URL is faster but the public CDN URL might 404 if
  // R2 dev URL is rate-limited. Base64 is safest.
  let dataUrl: string;
  try {
    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      console.warn('[moderate] could not fetch image:', url, imgRes.status);
      return null;
    }
    const buf = new Uint8Array(await imgRes.arrayBuffer());
    // Cap at 4MB to keep prompts cheap.
    if (buf.byteLength > 4 * 1024 * 1024) {
      // Bail and just pass the URL — Grok will fetch it itself.
      dataUrl = url;
    } else {
      const b64 = btoa(String.fromCharCode(...buf));
      const ct = imgRes.headers.get('Content-Type') ?? 'image/jpeg';
      dataUrl = `data:${ct};base64,${b64}`;
    }
  } catch (err) {
    console.warn('[moderate] image fetch threw:', err);
    return null;
  }

  const aiRes = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: MODERATION_PROMPT },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 256,
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!aiRes.ok) {
    const text = await aiRes.text().catch(() => '');
    console.warn('[moderate] vision API error:', aiRes.status, text);
    return null;
  }

  const completion = await aiRes.json();
  const rawContent: string = completion.choices?.[0]?.message?.content ?? '';

  let parsed: ModerationResult | null = null;
  try {
    const cleaned = rawContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned) as ModerationResult;
  } catch {
    console.warn('[moderate] failed to parse vision response:', rawContent);
    return null;
  }

  return { result: parsed, raw: completion };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResp({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const targetType: 'post' | 'comment' = body?.targetType;
    const targetId: string = String(body?.targetId ?? '');
    const imageUrls: string[] = Array.isArray(body?.imageUrls) ? body.imageUrls : [];

    if (!targetType || !targetId || imageUrls.length === 0) {
      return jsonResp({ error: 'targetType, targetId, imageUrls required' }, 400);
    }
    if (!OPENAI_API_KEY) {
      // No AI configured — auto-approve so the post still renders.
      return jsonResp({ ok: true, reason: 'no_ai_key_auto_approved' }, 200);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const table = targetType === 'post' ? 'community_posts' : 'community_comments';
    const idCol = targetType === 'post' ? 'post_id' : 'comment_id';

    let flagged = false;
    let allCategories: string[] = [];
    let flagReason = '';
    let flagUrl = '';

    for (const url of imageUrls) {
      const outcome = await moderateOne(url);
      if (!outcome) {
        // Fetch / API error — log and treat this image as approved
        // (don't punish the user for our own pipeline errors).
        await admin.from('community_moderation_log').insert({
          [idCol]: targetId,
          image_url: url,
          outcome: 'error',
          reason: 'vision API or image fetch failed',
        });
        continue;
      }

      const { result, raw } = outcome;
      await admin.from('community_moderation_log').insert({
        [idCol]: targetId,
        image_url: url,
        outcome: result.flagged ? 'flagged' : 'approved',
        categories: result.categories ?? [],
        reason: result.reason ?? '',
        raw_response: raw,
      });

      if (result.flagged) {
        flagged = true;
        allCategories = Array.from(new Set([...allCategories, ...(result.categories ?? [])]));
        if (!flagReason) flagReason = result.reason ?? '';
        if (!flagUrl) flagUrl = url;
        // Don't break — log every image for transparency.
      }
    }

    if (flagged) {
      // Soft-delete + mark flagged so it disappears from the feed.
      await admin
        .from(table)
        .update({
          is_deleted: true,
          moderation_status: 'flagged',
        })
        .eq('id', targetId);
      return jsonResp({
        ok: true,
        flagged: true,
        categories: allCategories,
        reason: flagReason,
      });
    }

    // All clean — promote to approved.
    await admin
      .from(table)
      .update({ moderation_status: 'approved' })
      .eq('id', targetId);
    return jsonResp({ ok: true, flagged: false });
  } catch (err) {
    console.error('[community-moderate-image]', err);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});
