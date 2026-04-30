/**
 * PantryAlertCard — surfaces pantry items expiring within 3 days so users
 * cook them before they go to waste.
 *
 * Reuses usePantryStore.getExpiringItems(3) — already implemented.
 * Hides itself when nothing's near expiry. Stays inside the rose accent
 * family that the food-safety system already uses elsewhere.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { useTheme } from '../hooks/useTheme';
import { usePantryStore } from '../store/usePantryStore';
import { Spacing, FontSizes } from '../constants/theme';

const ALERT_DAYS = 3;

function daysUntil(iso: string): number {
  const target = new Date(iso + 'T12:00:00').getTime();
  const now = new Date().getTime();
  if (isNaN(target)) return 999;
  return Math.ceil((target - now) / (24 * 60 * 60 * 1000));
}

export function PantryAlertCard() {
  const t = useTheme();
  const router = useRouter();
  // Select the items array directly and filter via useMemo. Calling
  // s.getExpiringItems(ALERT_DAYS) inline returned a fresh filtered
  // array every selector call → Zustand's === check failed → infinite
  // re-render loop on home tab mount.
  const items = usePantryStore((s) => s.items);

  const expiring = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + ALERT_DAYS);
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    return items
      .filter((i) => i.expiryDate && i.expiryDate <= cutoffKey)
      .sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''));
  }, [items]);
  const sorted = useMemo(() => expiring.slice(0, 4), [expiring]);

  if (sorted.length === 0) return null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="alert-circle-outline" size={16} color="#D98C86" />
        <Text style={[styles.title, { color: t.text }]}>Pantry — use soon</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={() => router.push('/pantry' as any)}
          accessibilityRole="link"
        >
          <Text style={[styles.viewAll, { color: '#D98C86' }]}>View all</Text>
        </TouchableOpacity>
      </View>

      {sorted.map((item, idx) => {
        const days = item.expiryDate ? daysUntil(item.expiryDate) : null;
        const detailParts: string[] = [];
        if (item.quantity != null && item.unit) {
          detailParts.push(`${item.quantity} ${item.unit}`);
        }
        if (days != null) {
          detailParts.push(
            days <= 0 ? 'expires today' : days === 1 ? 'expires tomorrow' : `expires in ${days} days`,
          );
        }
        return (
          <View
            key={item.id}
            style={[
              styles.row,
              idx > 0 && { borderTopWidth: 1, borderTopColor: t.cardBorder },
            ]}
          >
            <View style={[styles.itemIcon, { backgroundColor: 'rgba(217,140,134,0.12)' }]}>
              <Ionicons name="basket-outline" size={14} color="#D98C86" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemName, { color: t.text }]} numberOfLines={1}>
                {item.name}
                {item.brand ? ` · ${item.brand}` : ''}
              </Text>
              {detailParts.length > 0 && (
                <Text style={[styles.itemMeta, { color: t.textSecondary }]} numberOfLines={1}>
                  {detailParts.join(' · ')}
                </Text>
              )}
            </View>
          </View>
        );
      })}

      {expiring.length > 4 && (
        <Text style={[styles.moreText, { color: t.textMuted }]}>
          +{expiring.length - 4} more expiring soon
        </Text>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  viewAll: { fontSize: FontSizes.xs, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { fontSize: FontSizes.sm, fontWeight: '600' },
  itemMeta: { fontSize: FontSizes.xs, marginTop: 1 },
  moreText: { fontSize: FontSizes.xs, marginTop: Spacing.xs, textAlign: 'center' },
});
