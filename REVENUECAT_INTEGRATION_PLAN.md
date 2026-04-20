# RevenueCat IAP Integration Plan

## Why RevenueCat over native IAP

- Handles both iOS (StoreKit) and Android (Play Billing) with one SDK
- Free up to $2.5K MRR ($0.30/user for analytics beyond)
- Handles receipt validation, subscription state, edge cases (lapsed renewals, refunds) automatically
- Cross-platform subscriber state for web dashboard

## Step-by-step integration

### 1. Create RevenueCat account + app
- Sign up at https://app.revenuecat.com
- Create project "PepTalk"
- Add iOS app: bundle ID `com.peptalkapp.peptalk`
- Add Android app: package `com.peptalkapp.peptalk`

### 2. Configure App Store Connect subscriptions
In App Store Connect → Monetization → Subscriptions:
- Create subscription group "PepTalk Premium"
- Add products:
  - `peptalk_plus_monthly` ($9.99/mo — matches current plan)
  - `peptalk_plus_yearly` ($79.99/yr)
  - `peptalk_pro_monthly` ($19.99/mo)
  - `peptalk_pro_yearly` ($149.99/yr)
- Set trial periods (7-day mentioned in subscription.tsx)

### 3. Wire products in RevenueCat
- Map each App Store product to an Entitlement:
  - `plus_monthly`, `plus_yearly` → entitlement `plus`
  - `pro_monthly`, `pro_yearly` → entitlement `pro`
- Get public API key: `appl_XXXXXXXXXXXX`

### 4. Install SDK
```bash
npx expo install react-native-purchases
npx expo prebuild
```

### 5. Initialize on app boot
In `app/_layout.tsx` near Sentry init:
```typescript
import Purchases from 'react-native-purchases';

Purchases.configure({
  apiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS ?? '',
});
```

Add to `.env`:
```
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_XXX
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_XXX
```

### 6. Replace useSubscriptionStore tier logic
Current state: purely client-side `setTier()` calls.
New state: RevenueCat is source of truth; store just mirrors.

```typescript
// In useSubscriptionStore.ts — add sync method
syncFromRevenueCat: async () => {
  const info = await Purchases.getCustomerInfo();
  let tier: 'free' | 'plus' | 'pro' = 'free';
  if (info.entitlements.active['pro']) tier = 'pro';
  else if (info.entitlements.active['plus']) tier = 'plus';
  set({ tier, isActive: tier !== 'free' });
},
```

Call this:
- On app boot (after restoreSession)
- After any purchase/restore
- On Purchases.addCustomerInfoUpdateListener

### 7. Replace "Coming Soon" alert in subscription.tsx
Current:
```typescript
Alert.alert('Coming Soon', '...');
```

New:
```typescript
const offerings = await Purchases.getOfferings();
const pkg = offerings.current?.availablePackages.find(p => p.identifier === 'pro_monthly');
if (!pkg) return;
const { customerInfo } = await Purchases.purchasePackage(pkg);
// Auto-syncs via listener
```

### 8. Add restore purchases button
```typescript
const restore = async () => {
  const info = await Purchases.restorePurchases();
  // Auto-syncs
};
```

### 9. Server-side validation (optional but recommended)
RevenueCat webhook → Supabase edge function → update `profiles.subscription_tier`
This way server-side feature gates (future) can also check.

## Timeline estimate
- Account setup + App Store products: 2 hours (Apple review on products)
- SDK integration + tier sync: 4 hours
- Replace UI placeholders: 2 hours
- Testing (sandbox purchases): 3 hours
- **Total: ~1.5 days of work**

## What I need from you to start

1. RevenueCat account created + API keys
2. App Store Connect subscription products created and approved by Apple
3. Pricing confirmed for each tier

Then I can do the code integration end-to-end.
