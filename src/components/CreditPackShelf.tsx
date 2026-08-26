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
 */

import React, { useCallback, useEffect, useState } from 'react';
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

export function CreditPackShelf() {
  const t = useTheme();
  const [packs, setPacks] = useState<PurchasablePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  const refreshBalance = useCallback(async () => {
    const usage = await fetchAimeeUsage();
    // null stays null: "unknown" must not render as "$0.00", which would tell
    // someone who just paid that their credits vanished.
    setBalanceCents(usage?.creditBalanceCents ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [available] = await Promise.all([listAvailablePacks(), refreshBalance()]);
      if (!active) return;
      setPacks(available);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshBalance]);

  const onBuy = useCallback(
    async (pack: PurchasablePack) => {
      setBusyId(pack.productId);
      try {
        await buyCreditPack(pack.productId);
        if (Platform.OS !== 'web') {
          // Native hands off to the store; the grant lands when the purchase
          // listener validates it. Re-read rather than assume.
          await refreshBalance();
        }
      } catch (err) {
        captureException(err, { source: 'CreditPackShelf.buy', productId: pack.productId });
        Alert.alert(
          'Purchase not completed',
          err instanceof Error ? err.message : 'Please try again.',
        );
      } finally {
        setBusyId(null);
      }
    },
    [refreshBalance],
  );

  if (loading) return null;
  // Nothing purchasable on this platform yet.
  if (packs.length === 0) return null;

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
              disabled={busyId !== null}
              accessibilityRole="button"
              accessibilityLabel={`${pack.name}, ${pack.displayPrice}`}
              style={({ pressed }) => [
                styles.pack,
                {
                  borderColor: t.cardBorder,
                  backgroundColor: t.bg,
                  opacity: busyId !== null && !busy ? 0.5 : pressed ? 0.85 : 1,
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
