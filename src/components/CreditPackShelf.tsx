/**
 * Buy more AI credit when the plan allowance runs out.
 *
 * RENDERS NOTHING WHEN NOTHING CAN BE BOUGHT.
 * `listAvailablePacks()` asks the store what actually exists; until the SKUs
 * are created in App Store Connect and Play Console it returns [] and this
 * component is invisible. That is deliberate — a shelf of buy buttons that
 * dead-end reads as a broken app, and it is exactly the kind of thing a store
 * reviewer taps first.
 *
 * The balance is read back from the SERVER after a purchase, never incremented
 * locally. Only the server knows whether a purchase actually validated, and a
 * local guess that disagrees with it is a support ticket about missing credits.
 *
 * THE REDIRECT GAP
 * On web the buyer leaves for a Square-hosted page and comes back to a fully
 * reloaded app. Square redirects the moment the payment completes, but the
 * webhook that grants the credit is a separate call landing a moment later —
 * so the buyer can arrive back and see the balance they had before they paid.
 * That is indistinguishable from losing their money. On return this polls for
 * the balance to actually move, and says plainly that it is confirming.
 *
 * It never claims a success it cannot see: if the balance is not yet provably
 * higher when polling stops, the message says the payment went through and the
 * credit is still landing, because that is what is true — the money moved and
 * the webhook is simply slower than the redirect.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Alert } from '../lib/alert';
import { captureException } from '../services/telemetry';
import {
  listAvailablePacks,
  buyCreditPack,
  type PurchasablePack,
} from '../services/creditPurchase';
import { fetchAimeeUsage } from '../services/aimeeUsage';
import { formatCents } from '../lib/creditPacks';
import {
  rememberCreditPurchase,
  readPendingCreditPurchase,
  clearPendingCreditPurchase,
  isCheckoutReturn,
  balanceIncreased,
} from '../lib/pendingCreditPurchase';

/** Poll cadence and ceiling while waiting for the webhook to land. */
const POLL_INTERVAL_MS = 2_000;
const POLL_CEILING_MS = 24_000;

type Confirm =
  | { state: 'idle' }
  | { state: 'polling' }
  | { state: 'confirmed'; addedCents: number | null }
  | { state: 'slow' };

export function CreditPackShelf() {
  const t = useTheme();
  const [packs, setPacks] = useState<PurchasablePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm>({ state: 'idle' });
  const cancelled = useRef(false);

  const refreshBalance = useCallback(async () => {
    const usage = await fetchAimeeUsage();
    // null stays null: "unknown" must not render as "$0.00", which would tell
    // someone who just paid that their credits vanished.
    const cents = usage?.creditBalanceCents ?? null;
    setBalanceCents(cents);
    return cents;
  }, []);

  /** Wait for the webhook. Resolves when the balance provably moves, or gives up. */
  const awaitGrant = useCallback(async () => {
    const pending = readPendingCreditPurchase();
    if (!pending) return;
    setConfirm({ state: 'polling' });

    const deadline = Date.now() + POLL_CEILING_MS;
    for (;;) {
      const cents = await refreshBalance();
      if (cancelled.current) return;
      if (balanceIncreased(pending, cents)) {
        clearPendingCreditPurchase();
        setConfirm({
          state: 'confirmed',
          addedCents:
            pending.balanceBeforeCents === null || cents === null
              ? null
              : cents - pending.balanceBeforeCents,
        });
        return;
      }
      if (Date.now() >= deadline) {
        // Deliberately NOT an error. The payment completed — Square only
        // redirects after that — so the honest statement is that the credit is
        // still on its way. The record is cleared so this does not re-run
        // forever on every visit.
        clearPendingCreditPurchase();
        setConfirm({ state: 'slow' });
        return;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      if (cancelled.current) return;
    }
  }, [refreshBalance]);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      const [available] = await Promise.all([listAvailablePacks(), refreshBalance()]);
      if (cancelled.current) return;
      setPacks(available);
      setLoading(false);
      // Only on web, and only when we actually came back from checkout.
      if (Platform.OS === 'web' && isCheckoutReturn() && readPendingCreditPurchase()) {
        void awaitGrant();
      }
    })();
    return () => {
      cancelled.current = true;
    };
  }, [refreshBalance, awaitGrant]);

  const onBuy = useCallback(
    async (pack: PurchasablePack) => {
      setBusyId(pack.productId);
      try {
        if (Platform.OS === 'web') {
          // Record the balance BEFORE leaving, so the return can prove the
          // credit actually landed rather than assuming it did.
          rememberCreditPurchase(pack.productId, balanceCents);
        }
        await buyCreditPack(pack.productId);
        if (Platform.OS !== 'web') {
          // Native hands off to the store; the grant lands when the purchase
          // listener validates it. Re-read rather than assume.
          await refreshBalance();
        }
      } catch (err) {
        if (Platform.OS === 'web') clearPendingCreditPurchase();
        captureException(err, { source: 'CreditPackShelf.buy', productId: pack.productId });
        Alert.alert(
          'Purchase not completed',
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [balanceCents, refreshBalance],
  );

  if (loading) return null;
  // Nothing purchasable on this platform yet.
  if (packs.length === 0) return null;

  const banner =
    confirm.state === 'polling' ? (
      <View style={[styles.banner, { backgroundColor: t.cardBorder }]}>
        <ActivityIndicator size="small" color={t.textSecondary} />
        <Text style={[styles.bannerText, { color: t.text }]}>
          Confirming your purchase…
        </Text>
      </View>
    ) : confirm.state === 'confirmed' ? (
      <View style={[styles.banner, { backgroundColor: t.cardBorder }]}>
        <Text style={[styles.bannerText, { color: t.text }]}>
          {confirm.addedCents != null
            ? `${formatCents(confirm.addedCents)} of AI credit added.`
            : 'Credit added.'}
        </Text>
      </View>
    ) : confirm.state === 'slow' ? (
      <View style={[styles.banner, { backgroundColor: t.cardBorder }]}>
        <Text style={[styles.bannerText, { color: t.textSecondary }]}>
          Your payment went through. The credit is still landing — it should
          appear here within a minute.
        </Text>
      </View>
    ) : null;

  return (
    <View style={[styles.card, { borderColor: t.cardBorder, backgroundColor: t.card }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: t.text }]}>Top up AI credit</Text>
        {balanceCents !== null && balanceCents > 0 ? (
          <Text style={[styles.balance, { color: t.primary }]}>
            {formatCents(balanceCents)} left
          </Text>
        ) : null}
      </View>

      {banner}

      <Text style={[styles.blurb, { color: t.textSecondary }]}>
        Credit is used only after your plan{"'"}s monthly allowance runs out. It
        does not expire at the end of the month.
      </Text>

      <View style={styles.row}>
        {packs.map((pack) => {
          const busy = busyId === pack.productId;
          return (
            <Pressable
              key={pack.productId}
              onPress={() => onBuy(pack)}
              disabled={busyId !== null || confirm.state === 'polling'}
              accessibilityRole="button"
              accessibilityLabel={`${pack.name}, ${pack.displayPrice}`}
              style={({ pressed }) => [
                styles.pack,
                {
                  borderColor: t.cardBorder,
                  backgroundColor: t.bg,
                  opacity:
                    (busyId !== null && !busy) || confirm.state === 'polling'
                      ? 0.5
                      : pressed
                        ? 0.85
                        : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={t.primary} />
              ) : (
                <>
                  <Text style={[styles.packCredit, { color: t.text }]}>
                    {formatCents(pack.creditCents)}
                  </Text>
                  <Text style={[styles.packLabel, { color: t.textSecondary }]}>of AI use</Text>
                  <Text style={[styles.packPrice, { color: t.primary }]}>
                    {pack.displayPrice}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700' },
  balance: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  bannerText: { fontSize: 12.5, lineHeight: 17, flex: 1 },
  blurb: { fontSize: 12.5, lineHeight: 17 },
  row: { flexDirection: 'row', gap: 8 },
  pack: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 82,
    gap: 2,
  },
  packCredit: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  packLabel: { fontSize: 10.5 },
  packPrice: { fontSize: 13, fontWeight: '700', marginTop: 2 },
});

export default CreditPackShelf;
