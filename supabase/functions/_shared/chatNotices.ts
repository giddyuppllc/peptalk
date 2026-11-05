/**
 * Paywall and limit notices the app shows as chat bubbles. They are not
 * Aimee's words, and sending them back as assistant turns taught the model to
 * repeat them: production has model-written replies (with real token spend)
 * that read "AI chat requires PepTalk+ or Pro subscription." to a user the
 * server had just let through (chat_messages, 2026-11-02).
 */
export function isSystemNoticeText(text: string): boolean {
  const t = text.trim();
  return (
    /^AI chat requires PepTalk\+ or Pro/i.test(t) ||
    /^You've used your \d+ free Aimee messages/i.test(t) ||
    /^Monthly message limit reached/i.test(t) ||
    /^Please upgrade to use Aimee/i.test(t) ||
    /^Aimee requires an upgrade/i.test(t) ||
    /^I had trouble responding\. Please try again\.?$/i.test(t)
  );
}
