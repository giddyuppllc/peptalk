/**
 * The PT button and its navigation sheet — the app's visible way around.
 *
 * ── Why this replaces the old shortcut popover ────────────────────────────
 * PepTalk hides its tab bar by design; the four Home cards are the navigation.
 * The consequence was that anything the cards do not point at had no door. App
 * Review rejected build 1.9.8 under 2.3 because the reviewer could not find the
 * dose calculator named in our own App Store description — it exists, two taps
 * from Home, but a reviewer looking for tabs sees nothing at all.
 *
 * The predecessor (`ProfileShortcutFab`) was the right idea in the wrong place:
 * five destinations, mounted only inside the tabs group, and explicitly hidden
 * on Home — absent exactly where a new user starts, and absent entirely on
 * /doses, /labs, /learn and everything else outside the group.
 *
 * ── Two deliberate properties ─────────────────────────────────────────────
 * 1. It opens a SHEET, not a route. Closing returns you to precisely where you
 *    were, with no navigation having happened — which is why the X can be an X
 *    rather than a back button.
 * 2. Its contents come from `src/lib/navMap.ts`, which
 *    `scripts/verify-route-reachability.ts` also reads. A screen nobody can
 *    reach now fails the build instead of waiting for a reviewer to find it.
 */

import React, { useState } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { NAV_GROUPS, navHiddenOn } from '../lib/navMap';

export function AppNavSheet() {
  const t = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  if (navHiddenOn(pathname)) return null;

  const goTo = (href: string) => {
    setOpen(false);
    router.push(href as never);
  };

  return (
    <>
      {/* Top-right, where the shortcut menu it replaces already lived. Bottom
          -left is HomeFab and bottom-right is the Aimee FAB, so this is the one
          free corner — and putting nav back where users already reach for it
          means this adds no button, it swaps one. */}
      <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Open navigation menu"
          accessibilityHint="Lists every screen in PepTalk"
          // 44pt minimum touch target — the visual circle is smaller than the
          // tappable area on purpose.
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={[styles.fab, { backgroundColor: t.primary }]}
          activeOpacity={0.85}
        >
          {/* A wordmark rather than a bare glyph. An unlabelled circle is a
              guessing game, and reviewers pattern-match on convention. */}
          <Text style={styles.fabText}>PT</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: t.bg,
                borderColor: t.cardBorder,
                paddingBottom: insets.bottom + 16,
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: t.text }]}>Go to</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[styles.close, { borderColor: t.cardBorder }]}
              >
                <Ionicons name="close" size={18} color={t.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
            >
              {NAV_GROUPS.map((group) => (
                <View key={group.title} style={styles.group}>
                  <Text style={[styles.groupTitle, { color: t.textMuted }]}>
                    {group.title.toUpperCase()}
                  </Text>
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <TouchableOpacity
                        key={item.href}
                        onPress={() => goTo(item.href)}
                        accessibilityRole="link"
                        accessibilityLabel={item.label}
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.row,
                          { borderColor: t.cardBorder },
                          active && { backgroundColor: `${t.primary}14` },
                        ]}
                      >
                        <View style={[styles.rowIcon, { backgroundColor: `${t.primary}18` }]}>
                          <Ionicons name={item.icon} size={17} color={t.primary} />
                        </View>
                        <View style={styles.rowText}>
                          <Text style={[styles.rowLabel, { color: t.text }]}>{item.label}</Text>
                          {item.hint ? (
                            <Text style={[styles.rowHint, { color: t.textMuted }]} numberOfLines={1}>
                              {item.hint}
                            </Text>
                          ) : null}
                        </View>
                        <Ionicons name="chevron-forward" size={15} color={t.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 14, zIndex: 100, elevation: 100 },
  fab: {
    // Smaller than a primary FAB — it sits in the header band, not the thumb
    // zone, and hitSlop carries it to a 44pt target.
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '700' },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 14 },
  bodyContent: { paddingBottom: 8 },
  group: { marginBottom: 18 },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    paddingHorizontal: 6,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 11,
    borderRadius: 12,
  },
  rowIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowHint: { fontSize: 12, marginTop: 1 },
});

export default AppNavSheet;
