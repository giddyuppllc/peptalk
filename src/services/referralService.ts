/**
 * Referral code redemption client.
 *
 * Two surfaces wire to this:
 *   1. Onboarding signup screen — optional "Have a referral code?" field
 *   2. Settings → "Add a referral code" (post-signup, in case they
 *      forgot to enter it during onboarding)
 *
 * Returns a structured result so the UI can show:
 *   - confirmation toast with discount %
 *   - apple_offer_code captured in the subscription store, used at the
 *     next IAP purchase (StoreKit accepts a `paymentDiscount` parameter
 *     that points at the offer code Apple defined in App Store Connect)
 */

const FN_NAME = 'redeem-referral-code';

export interface ReferralRedeemSuccess {
  ok: true;
  discount_percent: number;
  apple_offer_code: string | null;
}
export interface ReferralRedeemError {
  ok: false;
  error: string;
}
export type ReferralRedeemResult = ReferralRedeemSuccess | ReferralRedeemError;

export async function redeemReferralCode(rawCode: string): Promise<ReferralRedeemResult> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    return { ok: false, error: 'Codes are 4-12 letters/numbers.' };
  }

  try {
    const { supabase } = await import('./supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { ok: false, error: 'You need to be signed in to redeem a code.' };
    }
    const { data, error } = await supabase.functions.invoke(FN_NAME, {
      body: { code },
    });
    if (error) {
      // Try to read the structured error the function returned.
      const ctx = (error as any)?.context;
      try {
        const text = ctx?.body ? await ctx.body : null;
        const parsed = text ? JSON.parse(text) : null;
        if (parsed?.error) return { ok: false, error: parsed.error };
      } catch { /* ignore */ }
      return { ok: false, error: error.message ?? 'Could not redeem code.' };
    }
    if ((data as any)?.error) {
      return { ok: false, error: (data as any).error };
    }
    return data as ReferralRedeemSuccess;
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Could not redeem code.' };
  }
}
