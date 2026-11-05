import { Platform } from 'react-native';

/**
 * Where a subscriber manages billing depends on where they bought.
 *
 * Web subscriptions are Square, cancelled in-app (Profile → Manage
 * Subscription, square-cancel). The paywall told web buyers to "cancel in
 * your Apple ID Subscriptions" — wrong for every web customer, and most paying
 * customers are on web. iOS strings are unchanged byte for byte (App Review
 * reads them); Android points at Google Play.
 */
type Store = 'ios' | 'android' | 'web';

const store = (): Store => (Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web');

const COPY: Record<Store, { perk: string; renew: string; footer: string }> = {
  ios: {
    perk: 'manage your subscription from your Apple ID at any time',
    renew: 'Cancel anytime in your Apple ID Subscriptions.',
    footer:
      'Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date. Payment is charged to your Apple ID account at confirmation. Manage or cancel in your Apple ID Subscriptions.',
  },
  android: {
    perk: 'manage your subscription from Google Play at any time',
    renew: 'Cancel anytime in Google Play → Payments & subscriptions.',
    footer:
      'Subscriptions auto-renew unless cancelled before the renewal date. Payment is charged to your Google Play account at confirmation. Manage or cancel in Google Play → Payments & subscriptions.',
  },
  web: {
    perk: 'cancel from Profile → Manage Subscription at any time',
    renew: 'Cancel anytime from Profile → Manage Subscription.',
    footer:
      'Subscriptions renew monthly until cancelled. Payment is charged to your card at checkout. Cancel anytime from Profile → Manage Subscription; access continues to the end of the paid period.',
  },
};

export const billingCopy = (s: Store = store()) => COPY[s];

/** The delete-account warning for an active subscriber. */
export function deleteAccountSubscriptionMessage(
  tierName: string,
  expiring: boolean,
  s: Store = store(),
): string {
  if (s === 'web') {
    // delete-user cancels the Square subscription before removing the account.
    return `Your ${tierName} subscription is active. Deleting your PepTalk account cancels it — you won't be charged again.\n\nIf you only want to stop billing, tap "Manage subscription" instead.`;
  }
  const owner = s === 'ios' ? 'Apple' : 'Google Play';
  const where = s === 'ios' ? 'your Apple ID' : 'Google Play';
  return expiring
    ? `Your ${tierName} subscription is set to renew soon through ${where}. Deleting your PepTalk account does NOT cancel that renewal — ${owner} owns billing.\n\nTap "Manage subscription" first to turn off auto-renew, then come back to delete.`
    : `Your ${tierName} subscription will keep renewing through ${where} unless you cancel it FIRST.\n\nDeleting your PepTalk account does NOT cancel your ${owner === 'Apple' ? 'Apple' : 'Google Play'} subscription — ${owner} owns billing.\n\nWe recommend you tap "Manage subscription" first to cancel through ${owner}, then come back to delete the account.`;
}
