/**
 * Side Effects log — Master Refactor Plan v3.1 §8.12 + §13.3.
 *
 * Add an entry: tag (curated or free text) + 1–5 severity + optional
 * peptide link + notes. List view groups by week with severity tint.
 */

import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard, Chip } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import {
  useSideEffectStore,
  SIDE_EFFECT_TAGS,
  type SideEffectSeverity,
} from '../../src/store/useSideEffectStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { PEPTIDES } from '../../src/data/peptides';
import {
  isHealthDataAvailable,
  writeSymptomToHealth,
} from '../../src/services/healthDataService';

function severityColorFor(
  t: ReturnType<typeof useV3Theme>,
  n: SideEffectSeverity,
): string {
  const c = t.colors as any;
  return (
    [c.severity1, c.severity2, c.severity3, c.severity4, c.severity5][n - 1] ??
    c.semanticNeutral
  );
}

export default function SideEffectsScreen() {
  const t = useV3Theme();
  const entries = useSideEffectStore((s) => s.entries);
  const logSideEffect = useSideEffectStore((s) => s.logSideEffect);
  const removeSideEffect = useSideEffectStore((s) => s.removeSideEffect);
  const recentDose = useDoseLogStore((s) => s.doses[0]);

  const [symptom, setSymptom] = useState('');
  const [severity, setSeverity] = useState<SideEffectSeverity>(2);
  const [linkToRecentDose, setLinkToRecentDose] = useState(true);

  const handleLog = () => {
    if (!symptom.trim()) return;
    tapMedium();
    logSideEffect({
      symptom: symptom.trim(),
      severity,
      linkedDoseId:
        linkToRecentDose && recentDose ? recentDose.id : undefined,
      peptideId: recentDose?.peptideId,
    });

    // Write-back to Apple Health (iOS) — backs the NSHealthUpdateUsageDescription
    // claim that PepTalk writes symptom logs back to Health. Guarded internally
    // on availability + permission; fire-and-forget so a write failure never
    // blocks the local log.
    if (isHealthDataAvailable()) {
      void writeSymptomToHealth();
    }

    setSymptom('');
    setSeverity(2);
  };

  const observation = useMemo(() => {
    if (entries.length === 0) return 'No side effects logged. Nice.';
    const recent = entries.filter(
      (e) => new Date(e.loggedAt).getTime() > Date.now() - 7 * 86400_000,
    );
    if (recent.length === 0) return 'Quiet week. Last log was a while back.';
    const severe = recent.filter((e) => e.severity >= 4).length;
    if (severe > 0)
      return `${severe} severe entries this week — worth flagging in chat.`;
    return `${recent.length} entries this week, all mild to moderate.`;
  }, [entries]);

  const peptideName = (id?: string) =>
    id ? PEPTIDES.find((p) => p.id === id)?.name ?? id : undefined;

  return (
    <V3DetailShell
      title="Side Effects"
      observation={observation}
      intent="doses_side_effects"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Log entry */}
        <GlassCard style={styles.cardSpacing}>
          <Text
            style={[
              styles.title,
              {
                color: t.colors.textPrimary as string,
                fontFamily: t.isDark
                  ? t.typography.headlineMale
                  : t.typography.headlineFemale,
              },
            ]}
          >
            Log a side effect
          </Text>

          <Text
            style={[
              styles.label,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
              },
            ]}
          >
            Symptom
          </Text>
          <View style={styles.chipWrap}>
            {SIDE_EFFECT_TAGS.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                primary={symptom === tag}
                onPress={() => {
                  tapLight();
                  setSymptom(tag);
                }}
              />
            ))}
          </View>
          <View
            style={[
              styles.inputBox,
              {
                borderColor: t.colors.cardBorder as string,
                backgroundColor: t.isDark
                  ? 'rgba(255,255,255,0.04)'
                  : 'rgba(255,255,255,0.5)',
              },
            ]}
          >
            <TextInput
              value={symptom}
              onChangeText={setSymptom}
              placeholder="Or describe it…"
              placeholderTextColor={t.colors.textSecondary as string}
              style={{
                flex: 1,
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.body,
                fontSize: 14,
              }}
            />
          </View>

          <Text
            style={[
              styles.label,
              {
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                marginTop: 14,
              },
            ]}
          >
            Severity
          </Text>
          <View style={styles.severityRow}>
            {([1, 2, 3, 4, 5] as SideEffectSeverity[]).map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  tapLight();
                  setSeverity(n);
                }}
                style={[
                  styles.severityDot,
                  {
                    backgroundColor:
                      severity === n ? severityColorFor(t, n) : 'transparent',
                    borderColor: severityColorFor(t, n),
                  },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: severity === n }}
                accessibilityLabel={`Severity ${n} of 5`}
              >
                <Text
                  style={{
                    color:
                      severity === n
                        ? '#fff'
                        : (t.colors.textSecondary as string),
                    fontFamily: t.typography.bodyBold,
                    fontSize: 13,
                  }}
                >
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>

          {recentDose ? (
            <Pressable
              onPress={() => {
                tapLight();
                setLinkToRecentDose((v) => !v);
              }}
              style={styles.linkRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: linkToRecentDose }}
              accessibilityLabel="Link this side effect to the last logged dose"
            >
              <Ionicons
                name={linkToRecentDose ? 'checkbox' : 'square-outline'}
                size={18}
                color={t.colors.textSecondary as string}
              />
              <Text
                style={{
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                  fontSize: 12,
                  marginLeft: 8,
                  flex: 1,
                }}
              >
                Link to your last dose ({peptideName(recentDose.peptideId)} ·{' '}
                {recentDose.amount} {recentDose.unit})
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={handleLog}
            disabled={!symptom.trim()}
            style={[
              styles.cta,
              {
                backgroundColor: symptom.trim()
                  ? (t.colors.textPrimary as string)
                  : (t.colors.textSecondary as string),
                opacity: symptom.trim() ? 1 : 0.5,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Log side effect entry"
            accessibilityState={{ disabled: !symptom.trim() }}
          >
            <Text
              style={{
                color: t.colors.bgBase1 as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 13,
                letterSpacing: 0.3,
              }}
            >
              Log entry
            </Text>
          </Pressable>
        </GlassCard>

        {/* History */}
        <Text
          style={[
            styles.sectionHeader,
            {
              color: t.colors.textSecondary as string,
              fontFamily: t.typography.body,
            },
          ]}
        >
          History
        </Text>
        {entries.length === 0 ? (
          <GlassCard>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              No entries yet.
            </Text>
          </GlassCard>
        ) : (
          entries.map((e) => (
            <GlassCard key={e.id} style={styles.entryCard}>
              <View style={styles.entryRow}>
                <View
                  style={[
                    styles.sevPill,
                    { backgroundColor: severityColorFor(t, e.severity) },
                  ]}
                >
                  <Text style={styles.sevPillText}>{e.severity}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.entrySymptom,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.typography.bodyBold,
                      },
                    ]}
                  >
                    {e.symptom}
                  </Text>
                  <Text
                    style={[
                      styles.entryMeta,
                      {
                        color: t.colors.textSecondary as string,
                        fontFamily: t.typography.body,
                      },
                    ]}
                  >
                    {new Date(e.loggedAt).toLocaleString()}
                    {e.peptideId ? ` · ${peptideName(e.peptideId)}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    tapMedium();
                    removeSideEffect(e.id);
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete ${e.symptom} side-effect entry`}
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={t.colors.textSecondary as string}
                  />
                </Pressable>
              </View>
            </GlassCard>
          ))
        )}
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginTop: 12 },
  title: {
    fontSize: 18,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  inputBox: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  },
  severityRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  severityDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
  },
  cta: {
    marginTop: 14,
    alignSelf: 'stretch',
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  sectionHeader: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 8,
  },
  entryCard: {
    marginBottom: 8,
    paddingVertical: 12,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sevPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sevPillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  entrySymptom: {
    fontSize: 14,
  },
  entryMeta: {
    fontSize: 11,
    marginTop: 2,
  },
});
