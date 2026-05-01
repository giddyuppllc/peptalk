/**
 * <PeptideGuide /> — full reference card rendered inline on the dosing
 * calculator (after the math results) so users see the protocol context
 * around the numbers they just calculated. Same component can be lifted
 * to a standalone /peptides/[id] guide page later.
 *
 * Sections (in render order, each hidden if no data):
 *   1. Header — name + aliases + status + evidence badge
 *   2. Quickstart overview
 *   3. Mechanism of action
 *   4. Research applications (primary uses)
 *   5. Dosing protocol (dose / route / frequency / cycle / timing)
 *   6. Reconstitution math (vial + BAC + concentration)
 *   7. Example calculations table
 *   8. Storage (lyophilized + reconstituted)
 *   9. Lifestyle / timing rules
 *  10. Important notes
 *  11. Side effects + contraindications
 *  12. References (PubMed / DOI links)
 *  13. Disclaimer
 *
 * Data sources, in priority order:
 *   - PEPTIDES (src/data/peptides.ts)              — biological + status
 *   - PROTOCOL_TEMPLATES (src/data/protocols.ts)   — dosing + cycle
 *   - SAFETY_PROFILES (src/data/safetyProfiles.ts) — side effects
 *   - PEPTIDE_TIMING (src/data/peptideTiming.ts)   — lifestyle/timing
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from './GlassCard';
import { Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../hooks/useTheme';
import { PROTOCOL_TEMPLATES } from '../data/protocols';
import { SAFETY_PROFILES } from '../data/safetyProfiles';
import { getPeptideTiming } from '../data/peptideTiming';
import {
  RESEARCH_DISCLAIMER,
  COMPLIANCE_TIER_DISPLAY,
  EVIDENCE_GRADE_DISPLAY,
} from '../constants/compliance';
import { calculatePeptideDose, generateDoseTable } from '../lib/mathEngine';
import type { Peptide } from '../types';

interface Props {
  peptide: Peptide;
  /** Vial size + BAC water from the calculator above — drives the
   *  worked example table so it matches what the user sees up top. */
  vial_mg?: number;
  bac_water_ml?: number;
}

export function PeptideGuide({ peptide, vial_mg, bac_water_ml }: Props) {
  const t = useTheme();

  // Find the canonical protocol for this peptide (if multiple, take the
  // first — typically the SubQ standard).
  const protocol = useMemo(
    () => PROTOCOL_TEMPLATES.find((p) => p.peptideId === peptide.id),
    [peptide.id],
  );

  const safety = useMemo(
    () => SAFETY_PROFILES.find((s) => s.peptideId === peptide.id),
    [peptide.id],
  );

  const timing = useMemo(() => getPeptideTiming(peptide.id), [peptide.id]);

  // Reconstitution math: prefer the user's actual vial/BAC inputs from
  // the calculator above; fall back to a sensible default (10 mg + 2 mL
  // = 5 mg/mL — Edward's spec default) so the section still renders
  // educationally before the user has typed anything in.
  const recon_vial = vial_mg && vial_mg > 0 ? vial_mg : 10;
  const recon_bac  = bac_water_ml && bac_water_ml > 0 ? bac_water_ml : 2;
  const reconMath = calculatePeptideDose(recon_vial, recon_bac, 0);
  const examples  = generateDoseTable(recon_vial, recon_bac);

  // Compliance tier badge — fall back to mapping approvalStatus when the
  // newer complianceTier field isn't filled in yet
  const tierKey =
    peptide.complianceTier ??
    (peptide.approvalStatus === 'fda_approved' || peptide.approvalStatus === 'ema_approved' || peptide.approvalStatus === 'approved_other'
      ? 'fda_approved'
      : peptide.approvalStatus?.startsWith('phase_')
      ? 'investigational'
      : 'research_only');
  const tier = COMPLIANCE_TIER_DISPLAY[tierKey];
  const evidence = peptide.evidenceGrade ? EVIDENCE_GRADE_DISPLAY[peptide.evidenceGrade] : undefined;

  const styles = makeStyles(t);

  return (
    <View style={styles.root}>

      {/* ─── Header — name + status + evidence ─────────────────────── */}
      <GlassCard style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.peptideName}>{peptide.name}</Text>
            {peptide.abbreviation && peptide.abbreviation !== peptide.name && (
              <Text style={styles.peptideAlias}>{peptide.abbreviation}</Text>
            )}
            {peptide.aliases && peptide.aliases.length > 0 && (
              <Text style={styles.peptideAlias}>aka {peptide.aliases.join(', ')}</Text>
            )}
          </View>
        </View>
        <View style={styles.badgeRow}>
          {tier && (
            <View style={[styles.badge, { backgroundColor: tier.color + '22', borderColor: tier.color + '55' }]}>
              <Text style={[styles.badgeText, { color: tier.color }]}>{tier.label}</Text>
            </View>
          )}
          {evidence && (
            <View style={[styles.badge, { backgroundColor: evidence.color + '22', borderColor: evidence.color + '55' }]}>
              <Text style={[styles.badgeText, { color: evidence.color }]}>
                Evidence {evidence.letter} — {evidence.label}
              </Text>
            </View>
          )}
        </View>
      </GlassCard>

      {/* ─── Quickstart overview ───────────────────────────────────── */}
      <Section title="Overview" icon="information-circle-outline">
        <Text style={styles.body}>{peptide.researchSummary}</Text>
      </Section>

      {/* ─── Mechanism of action ───────────────────────────────────── */}
      {peptide.mechanismOfAction && (
        <Section title="How It Works" icon="git-branch-outline">
          <Text style={styles.body}>{peptide.mechanismOfAction}</Text>
          {peptide.receptorTargets && peptide.receptorTargets.length > 0 && (
            <View style={styles.tagWrap}>
              {peptide.receptorTargets.map((r) => (
                <Text key={r} style={styles.tag}>{r}</Text>
              ))}
            </View>
          )}
        </Section>
      )}

      {/* ─── Research applications / benefits ──────────────────────── */}
      {peptide.uses?.primaryUses && peptide.uses.primaryUses.length > 0 && (
        <Section title="Research Applications" icon="flask-outline">
          {peptide.uses.primaryUses.map((u, i) => (
            <BulletRow key={i} text={u} />
          ))}
          {peptide.uses.whatPeopleReport && (
            <Text style={[styles.body, { marginTop: Spacing.sm, fontStyle: 'italic', color: t.textSecondary }]}>
              {peptide.uses.whatPeopleReport}
            </Text>
          )}
        </Section>
      )}

      {/* ─── Dosing protocol ──────────────────────────────────────── */}
      {protocol && (
        <Section title="Dosing Protocol" icon="medkit-outline">
          <ProtocolKV label="Typical dose" value={`${protocol.typicalDose.min}–${protocol.typicalDose.max} ${protocol.typicalDose.unit}`} />
          <ProtocolKV label="Route"        value={protocol.route} />
          <ProtocolKV label="Frequency"    value={protocol.frequencyLabel} />
          <ProtocolKV label="Cycle"        value={`${protocol.durationWeeks.min}–${protocol.durationWeeks.max} weeks`} />
          {protocol.timing && <ProtocolKV label="Timing" value={protocol.timing} />}
          {protocol.titrationSchedule && protocol.titrationSchedule.length > 0 && (
            <View style={{ marginTop: Spacing.sm }}>
              <Text style={styles.subTitle}>Titration ladder</Text>
              {protocol.titrationSchedule.map((step, i) => (
                <Text key={i} style={styles.body}>
                  • Wk {step.weekStart}{step.weekEnd ? `–${step.weekEnd}` : '+'}: {step.dose} {step.unit} {step.frequencyLabel ?? step.frequency}
                  {step.note ? ` — ${step.note}` : ''}
                </Text>
              ))}
            </View>
          )}
        </Section>
      )}

      {/* ─── Reconstitution math ──────────────────────────────────── */}
      <Section title="Reconstitution Math" icon="calculator-outline">
        <ProtocolKV label="Vial size"     value={`${recon_vial} mg`} />
        <ProtocolKV label="BAC water"     value={`${recon_bac} mL`} />
        <ProtocolKV label="Concentration" value={`${reconMath.concentration_mg_per_ml.toFixed(2)} mg/mL`} highlight />
        <ProtocolKV label="1 unit equals" value={`${reconMath.mcg_per_unit.toFixed(0)} mcg`} />
        {peptide.solubilityNotes && (
          <Text style={[styles.body, { marginTop: Spacing.sm, color: t.textSecondary }]}>
            {peptide.solubilityNotes}
          </Text>
        )}
        {protocol?.reconstitutionNotes && !peptide.solubilityNotes && (
          <Text style={[styles.body, { marginTop: Spacing.sm, color: t.textSecondary }]}>
            {protocol.reconstitutionNotes}
          </Text>
        )}
      </Section>

      {/* ─── Example calculations table ──────────────────────────── */}
      {examples.length > 0 && (
        <Section title="Example Calculations" icon="grid-outline">
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHead]}>
              <Text style={[styles.tableCell, styles.tableHeadText]}>Dose</Text>
              <Text style={[styles.tableCell, styles.tableHeadText]}>mL</Text>
              <Text style={[styles.tableCell, styles.tableHeadText]}>Units (U-100)</Text>
            </View>
            {examples.map((row, i) => (
              <View key={i} style={styles.tableRow}>
                <Text style={styles.tableCell}>{row.dose_mg < 1 ? `${(row.dose_mg * 1000).toFixed(0)} mcg` : `${row.dose_mg.toFixed(2)} mg`}</Text>
                <Text style={styles.tableCell}>{row.volume_ml.toFixed(2)}</Text>
                <Text style={styles.tableCell}>{row.units_u100.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      {/* ─── Storage ──────────────────────────────────────────────── */}
      {(peptide.stabilityNotes || peptide.storageTemp || protocol?.storageNotes) && (
        <Section title="Storage" icon="snow-outline">
          {peptide.storageTemp && (
            <ProtocolKV label="Lyophilized" value={peptide.storageTemp} />
          )}
          {protocol?.storageNotes && (
            <ProtocolKV label="Reconstituted" value={protocol.storageNotes} />
          )}
          {peptide.stabilityNotes && (
            <Text style={[styles.body, { marginTop: Spacing.sm, color: t.textSecondary }]}>
              {peptide.stabilityNotes}
            </Text>
          )}
        </Section>
      )}

      {/* ─── Lifestyle / timing ───────────────────────────────────── */}
      {timing && (
        <Section title="Lifestyle & Timing" icon="time-outline">
          <Text style={[styles.subTitle, { color: t.text }]}>{timing.title}</Text>
          <Text style={styles.body}>{timing.body}</Text>
          {timing.fastBeforeMin && (
            <ProtocolKV label="Fast before" value={`${timing.fastBeforeMin} min`} />
          )}
          {timing.fastAfterMin && (
            <ProtocolKV label="Fast after" value={`${timing.fastAfterMin} min`} />
          )}
          {timing.suggestedTime && (
            <ProtocolKV label="Recommended time" value={timing.suggestedTime} />
          )}
        </Section>
      )}

      {/* ─── Important notes (from protocol) ──────────────────────── */}
      {protocol?.importantNotes && protocol.importantNotes.length > 0 && (
        <Section title="Important Notes" icon="bookmark-outline">
          {protocol.importantNotes.map((n, i) => (
            <BulletRow key={i} text={n} />
          ))}
        </Section>
      )}

      {/* ─── Side effects + contraindications ─────────────────────── */}
      {(safety || protocol) && (
        <Section title="Safety Notes" icon="warning-outline">
          {safety?.commonSideEffects && safety.commonSideEffects.length > 0 && (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text style={styles.subTitle}>Common side effects</Text>
              {safety.commonSideEffects.map((s, i) => <BulletRow key={i} text={s} />)}
            </View>
          )}
          {safety?.seriousAdverseEffects && safety.seriousAdverseEffects.length > 0 && (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text style={[styles.subTitle, { color: '#ef4444' }]}>Serious adverse effects</Text>
              {safety.seriousAdverseEffects.map((s, i) => <BulletRow key={i} text={s} color="#ef4444" />)}
            </View>
          )}
          {(safety?.contraindications ?? protocol?.contraindications) && (
            <View style={{ marginBottom: Spacing.sm }}>
              <Text style={styles.subTitle}>Contraindications</Text>
              {(safety?.contraindications ?? protocol?.contraindications ?? []).map((c, i) => (
                <BulletRow key={i} text={c} />
              ))}
            </View>
          )}
          {protocol?.cautionConditions && protocol.cautionConditions.length > 0 && (
            <View>
              <Text style={styles.subTitle}>Use with caution</Text>
              {protocol.cautionConditions.map((c, i) => <BulletRow key={i} text={c} />)}
            </View>
          )}
        </Section>
      )}

      {/* ─── References ───────────────────────────────────────────── */}
      {((peptide.pubmedLinks?.length ?? 0) + (peptide.doiLinks?.length ?? 0)) > 0 && (
        <Section title="References" icon="library-outline">
          {(peptide.pubmedLinks ?? []).map((url, i) => (
            <TouchableOpacity key={`pm-${i}`} onPress={() => Linking.openURL(url)} style={styles.linkRow}>
              <Ionicons name="open-outline" size={14} color={t.primary} />
              <Text style={styles.linkText} numberOfLines={1}>{url}</Text>
            </TouchableOpacity>
          ))}
          {(peptide.doiLinks ?? []).map((url, i) => (
            <TouchableOpacity key={`doi-${i}`} onPress={() => Linking.openURL(url)} style={styles.linkRow}>
              <Ionicons name="open-outline" size={14} color={t.primary} />
              <Text style={styles.linkText} numberOfLines={1}>{url}</Text>
            </TouchableOpacity>
          ))}
        </Section>
      )}

      {/* ─── Disclaimer ───────────────────────────────────────────── */}
      <GlassCard style={styles.disclaimerCard} variant="accent">
        <Text style={styles.disclaimerText}>{RESEARCH_DISCLAIMER}</Text>
      </GlassCard>
    </View>
  );
}

// ─── Sub-pieces ─────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: Spacing.md }}>
      <View style={localStyles.sectionHead}>
        <Ionicons name={icon} size={16} color={t.primary} />
        <Text style={[localStyles.sectionTitle, { color: t.text }]}>{title}</Text>
      </View>
      <GlassCard>{children}</GlassCard>
    </View>
  );
}

function ProtocolKV({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const t = useTheme();
  return (
    <View style={localStyles.kvRow}>
      <Text style={[localStyles.kvLabel, { color: t.textSecondary }]}>{label}</Text>
      <Text style={[localStyles.kvValue, { color: highlight ? t.primary : t.text, fontWeight: highlight ? '700' : '600' }]}>
        {value}
      </Text>
    </View>
  );
}

function BulletRow({ text, color }: { text: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={localStyles.bulletRow}>
      <Text style={[localStyles.bullet, { color: color ?? t.textSecondary }]}>•</Text>
      <Text style={[localStyles.bulletText, { color: color ?? t.text }]}>{text}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const localStyles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: FontSizes.md,
    fontWeight: '700',
  },
  kvRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  kvLabel: {
    fontSize: FontSizes.sm,
  },
  kvValue: {
    fontSize: FontSizes.sm,
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: Spacing.sm,
  },
  bulletRow: {
    flexDirection: 'row',
    paddingVertical: 3,
  },
  bullet: {
    width: 14,
    fontSize: FontSizes.sm,
  },
  bulletText: {
    flex: 1,
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
});

function makeStyles(t: ReturnType<typeof useTheme>) {
  return StyleSheet.create({
    root: {
      gap: Spacing.md,
    },
    headerCard: {
      paddingBottom: Spacing.sm,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    peptideName: {
      fontSize: FontSizes.xl,
      fontWeight: '700',
      color: t.text,
    },
    peptideAlias: {
      fontSize: FontSizes.sm,
      color: t.textSecondary,
      marginTop: 2,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: BorderRadius.sm,
      borderWidth: 1,
    },
    badgeText: {
      fontSize: FontSizes.xs,
      fontWeight: '600',
    },
    body: {
      fontSize: FontSizes.sm,
      color: t.text,
      lineHeight: 20,
    },
    subTitle: {
      fontSize: FontSizes.sm,
      fontWeight: '700',
      color: t.text,
      marginTop: Spacing.xs,
      marginBottom: 4,
    },
    tagWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: Spacing.sm,
    },
    tag: {
      fontSize: FontSizes.xs,
      color: t.textSecondary,
      backgroundColor: t.glass,
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: BorderRadius.sm,
    },
    table: {
      borderRadius: BorderRadius.sm,
      overflow: 'hidden',
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.glass,
    },
    tableHead: {
      backgroundColor: t.glass,
    },
    tableCell: {
      flex: 1,
      fontSize: FontSizes.sm,
      color: t.text,
      paddingHorizontal: 8,
    },
    tableHeadText: {
      fontWeight: '700',
      color: t.textSecondary,
      fontSize: FontSizes.xs,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
    },
    linkText: {
      flex: 1,
      fontSize: FontSizes.xs,
      color: t.primary,
    },
    disclaimerCard: {
      padding: Spacing.sm,
    },
    disclaimerText: {
      fontSize: FontSizes.xs,
      color: t.textSecondary,
      lineHeight: 16,
      fontStyle: 'italic',
    },
  });
}
