/**
 * Peptide Library — Master Refactor Plan v3.1 §8.10.
 *
 * Browsable catalog of every peptide in the system. Each card shows
 * the peptide name, abbreviation, primary categories, and a one-line
 * "what people report" line. Tapping a row deep-links into the existing
 * peptide detail screen so the clinical summary, dose range, and
 * cycling guidance still surface from the canonical source.
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import { PEPTIDES } from '../../src/data/peptides';

export default function PeptideLibraryScreen() {
  const t = useV3Theme();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PEPTIDES;
    return PEPTIDES.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if ((p.abbreviation ?? '').toLowerCase().includes(q)) return true;
      if (p.categories?.some((c) => c.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [query]);

  return (
    <V3DetailShell
      title="Library"
      observation={`${PEPTIDES.length} peptides. Search by name, abbreviation, or goal.`}
      intent="doses_library"
    >
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        removeClippedSubviews
        windowSize={9}
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 80 }}
        ListHeaderComponent={
          <View
            style={[
              styles.searchBox,
              {
                borderColor: t.colors.cardBorder as string,
                backgroundColor: t.isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(255,255,255,0.5)',
              },
            ]}
          >
            <Ionicons
              name="search"
              size={16}
              color={t.colors.textSecondary as string}
            />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search peptides…"
              placeholderTextColor={t.colors.textSecondary as string}
              style={{
                flex: 1,
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.body,
                fontSize: 14,
                marginLeft: 8,
              }}
            />
          </View>
        }
        renderItem={({ item: p }) => (
          <Pressable
            onPress={() => {
              tapLight();
              router.push(`/peptide/${p.id}` as never);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${p.name} library entry`}
          >
            <GlassCard style={styles.card}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.name,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.isDark
                          ? t.typography.headlineMale
                          : t.typography.headlineFemale,
                      },
                    ]}
                  >
                    {p.name}
                  </Text>
                  {p.abbreviation ? (
                    <Text
                      style={[
                        styles.abbr,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      {p.abbreviation}
                    </Text>
                  ) : null}
                  {p.uses?.whatPeopleReport ? (
                    <Text
                      style={[
                        styles.report,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                      numberOfLines={2}
                    >
                      {p.uses.whatPeopleReport}
                    </Text>
                  ) : null}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={t.colors.textSecondary as string}
                />
              </View>
            </GlassCard>
          </Pressable>
        )}
      />
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    height: 40,
    marginBottom: 12,
  },
  card: {
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    fontSize: 17,
  },
  abbr: {
    fontSize: 11,
    marginTop: 1,
  },
  report: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 17,
  },
});
