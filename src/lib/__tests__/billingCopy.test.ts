import { billingCopy, deleteAccountSubscriptionMessage } from '../billingCopy';

describe('billing wording by store', () => {
  it('iOS keeps the App Review wording exactly', () => {
    expect(billingCopy('ios').renew).toBe('Cancel anytime in your Apple ID Subscriptions.');
    expect(billingCopy('ios').footer).toBe(
      'Subscriptions auto-renew unless cancelled at least 24 hours before the renewal date. Payment is charged to your Apple ID account at confirmation. Manage or cancel in your Apple ID Subscriptions.',
    );
    expect(billingCopy('ios').perk).toBe('manage your subscription from your Apple ID at any time');
    expect(deleteAccountSubscriptionMessage('PepTalk+', false, 'ios')).toContain('Apple owns billing');
  });

  it('web never tells a Square customer to use their Apple ID', () => {
    for (const v of Object.values(billingCopy('web'))) expect(v).not.toMatch(/Apple|Google/);
    expect(deleteAccountSubscriptionMessage('PepTalk+', false, 'web')).not.toMatch(/Apple|Google/);
  });

  it('Android points at Google Play', () => {
    expect(billingCopy('android').renew).toMatch(/Google Play/);
    expect(deleteAccountSubscriptionMessage('PepTalk Pro', true, 'android')).toMatch(/Google Play/);
  });
});
