import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { GlassCard } from '../../src/components/GlassCard';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useJournalStore } from '../../src/store/useJournalStore';
import { getGoalLabel } from '../../src/constants/goals';
import { GoalType } from '../../src/types';
import { getPeptideById } from '../../src/data/peptides';
import { PaywallGate } from '../../src/hooks/useFeatureGate';
import { LabTrendsCard } from '../../src/components/LabTrendsCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDate = (d: Date) =>
  d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HealthReportScreen() {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);

  // Stores
  const onboardingProfile = useOnboardingStore((s) => s.profile);
  const healthProfile = useHealthProfileStore((s) => s.profile);
  const checkinEntries = useCheckinStore((s) => s.entries);
  const doseProtocols = useDoseLogStore((s) => s.protocols);
  const journalEntries = useJournalStore((s) => s.entries);

  // Date range (last 14 days)
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const rangeStart = formatDate(fourteenDaysAgo);
  const rangeEnd = formatDate(now);
  const rangeStartKey = toDateKey(fourteenDaysAgo);
  const rangeEndKey = toDateKey(now);

  // Active protocols
  const activeProtocols = useMemo(
    () => doseProtocols.filter((p) => p.isActive),
    [doseProtocols]
  );

  // Check-in averages (last 14 days)
  const checkinAverages = useMemo(() => {
    const recent = checkinEntries.filter(
      (e) => e.date >= rangeStartKey && e.date <= rangeEndKey
    );
    if (recent.length === 0) return null;

    const sum = { mood: 0, energy: 0, stress: 0, sleep: 0, recovery: 0, appetite: 0 };
    recent.forEach((e) => {
      sum.mood += e.mood;
      sum.energy += e.energy;
      sum.stress += e.stress;
      sum.sleep += e.sleepQuality;
      sum.recovery += e.recovery;
      sum.appetite += e.appetite;
    });
    const n = recent.length;
    return {
      count: n,
      mood: (sum.mood / n).toFixed(1),
      energy: (sum.energy / n).toFixed(1),
      stress: (sum.stress / n).toFixed(1),
      sleep: (sum.sleep / n).toFixed(1),
      recovery: (sum.recovery / n).toFixed(1),
      appetite: (sum.appetite / n).toFixed(1),
    };
  }, [checkinEntries, rangeStartKey, rangeEndKey]);

  // Journal summary (count by category)
  const journalSummary = useMemo(() => {
    const recent = journalEntries.filter(
      (e) => e.date >= rangeStartKey && e.date <= rangeEndKey
    );
    const counts: Record<string, number> = {};
    recent.forEach((e) => {
      counts[e.category] = (counts[e.category] || 0) + 1;
    });
    return { total: recent.length, byCategory: counts };
  }, [journalEntries, rangeStartKey, rangeEndKey]);

  // Health goals
  const healthGoals = useMemo(
    () => onboardingProfile.healthGoals.map((g: GoalType) => getGoalLabel(g)),
    [onboardingProfile.healthGoals]
  );

  // Build plain-text report
  const reportText = useMemo(() => {
    const lines: string[] = [];
    const divider = '─'.repeat(40);

    lines.push('PEPTALK HEALTH REPORT');
    lines.push(`Report Period: ${rangeStart} - ${rangeEnd}`);
    lines.push(`Generated: ${formatDate(now)}`);
    lines.push('');

    // Demographics
    lines.push(divider);
    lines.push('DEMOGRAPHICS');
    lines.push(divider);
    if (onboardingProfile.gender) lines.push(`Gender: ${onboardingProfile.gender}`);
    if (onboardingProfile.ageRange) lines.push(`Age Range: ${onboardingProfile.ageRange}`);
    if (healthProfile.biologicalSex) lines.push(`Biological Sex: ${healthProfile.biologicalSex}`);
    if (healthProfile.dateOfBirth) lines.push(`Date of Birth: ${healthProfile.dateOfBirth}`);
    if (healthProfile.bodyMetrics?.weightLbs)
      lines.push(`Weight: ${healthProfile.bodyMetrics.weightLbs} lbs`);
    if (healthProfile.bodyMetrics?.heightInches)
      lines.push(`Height: ${healthProfile.bodyMetrics.heightInches} in`);
    if (healthProfile.bodyMetrics?.bodyFatPercent)
      lines.push(`Body Fat: ${healthProfile.bodyMetrics.bodyFatPercent}%`);
    lines.push('');

    // Health Goals
    lines.push(divider);
    lines.push('HEALTH GOALS');
    lines.push(divider);
    if (healthGoals.length > 0) {
      healthGoals.forEach((g) => lines.push(`  - ${g}`));
    } else {
      lines.push('  No goals set');
    }
    lines.push('');

    // Medical History
    lines.push(divider);
    lines.push('MEDICAL HISTORY');
    lines.push(divider);
    const med = healthProfile.medical;
    if (med.conditions.length > 0) {
      lines.push('Conditions:');
      med.conditions.forEach((c) => lines.push(`  - ${c}`));
    } else {
      lines.push('Conditions: None reported');
    }
    if (med.medications.length > 0) {
      lines.push('Medications:');
      med.medications.forEach((m) => lines.push(`  - ${m}`));
    } else {
      lines.push('Medications: None reported');
    }
    if (med.allergies.length > 0) {
      lines.push('Allergies:');
      med.allergies.forEach((a) => lines.push(`  - ${a}`));
    } else {
      lines.push('Allergies: None reported');
    }
    lines.push(
      `Provider Supervision: ${med.hasProviderSupervision ? 'Yes' : 'No'}`
    );
    lines.push('');

    // Active Protocols
    lines.push(divider);
    lines.push('ACTIVE PROTOCOLS');
    lines.push(divider);
    if (activeProtocols.length > 0) {
      activeProtocols.forEach((p) => {
        const peptide = getPeptideById(p.peptideId);
        const name = peptide?.name || p.peptideId;
        lines.push(
          `  - ${name}: ${p.dose} ${p.unit} ${p.route} (${p.frequency}) since ${p.startDate}`
        );
      });
    } else {
      lines.push('  No active protocols');
    }
    lines.push('');

    // Check-in Averages
    lines.push(divider);
    lines.push(`CHECK-IN AVERAGES (Last 14 Days)`);
    lines.push(divider);
    if (checkinAverages) {
      lines.push(`Based on ${checkinAverages.count} check-in(s):`);
      lines.push(`  Mood:      ${checkinAverages.mood}/5`);
      lines.push(`  Energy:    ${checkinAverages.energy}/5`);
      lines.push(`  Stress:    ${checkinAverages.stress}/5`);
      lines.push(`  Sleep:     ${checkinAverages.sleep}/5`);
      lines.push(`  Recovery:  ${checkinAverages.recovery}/5`);
      lines.push(`  Appetite:  ${checkinAverages.appetite}/5`);
    } else {
      lines.push('  No check-ins in this period');
    }
    lines.push('');

    // Journal Summary
    lines.push(divider);
    lines.push('JOURNAL SUMMARY (Last 14 Days)');
    lines.push(divider);
    if (journalSummary.total > 0) {
      lines.push(`Total entries: ${journalSummary.total}`);
      Object.entries(journalSummary.byCategory).forEach(([cat, count]) => {
        const label = cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        lines.push(`  - ${label}: ${count}`);
      });
    } else {
      lines.push('  No journal entries in this period');
    }
    lines.push('');

    lines.push(divider);
    lines.push('Generated by PepTalk App');
    lines.push('This report is informational only and does not constitute medical advice.');

    return lines.join('\n');
  }, [
    onboardingProfile,
    healthProfile,
    healthGoals,
    activeProtocols,
    checkinAverages,
    journalSummary,
    rangeStart,
    rangeEnd,
  ]);

  // Share as plain text (kept as a fallback / quick copy path)
  const handleShareText = async () => {
    try {
      await Share.share({
        message: reportText,
        title: 'PepTalk Health Report',
      });
    } catch {
      // User cancelled or error — no action needed
    }
  };

  // Build a print-friendly HTML version of the report. Mirrors the
  // text version's section structure so anything visible on-screen ends
  // up in the PDF. Inline styles keep the document self-contained so
  // the print engine renders it identically across iOS / Android.
  const buildReportHtml = (): string => {
    const escape = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const li = (item: string) => `<li>${escape(item)}</li>`;
    const section = (title: string, body: string) => `
      <section style="margin-top:24px">
        <h2 style="font-size:14px;letter-spacing:1.2px;color:#7ABED0;text-transform:uppercase;border-bottom:1px solid #EAE4DC;padding-bottom:6px;margin:0 0 12px 0">
          ${escape(title)}
        </h2>
        <div style="font-size:13px;line-height:1.6;color:#2D2D2D">${body}</div>
      </section>`;

    const demographicsBody = [
      onboardingProfile.gender && `<div><strong>Gender:</strong> ${escape(onboardingProfile.gender)}</div>`,
      onboardingProfile.ageRange && `<div><strong>Age Range:</strong> ${escape(onboardingProfile.ageRange)}</div>`,
      healthProfile.biologicalSex && `<div><strong>Biological Sex:</strong> ${escape(healthProfile.biologicalSex)}</div>`,
      healthProfile.dateOfBirth && `<div><strong>Date of Birth:</strong> ${escape(healthProfile.dateOfBirth)}</div>`,
      healthProfile.bodyMetrics?.weightLbs && `<div><strong>Weight:</strong> ${healthProfile.bodyMetrics.weightLbs} lbs</div>`,
      healthProfile.bodyMetrics?.heightInches && `<div><strong>Height:</strong> ${healthProfile.bodyMetrics.heightInches} in</div>`,
      healthProfile.bodyMetrics?.bodyFatPercent != null && `<div><strong>Body Fat:</strong> ${healthProfile.bodyMetrics.bodyFatPercent}%</div>`,
    ].filter(Boolean).join('') || '<em>Not provided</em>';

    const goalsBody = healthGoals.length
      ? `<ul style="margin:0;padding-left:18px">${healthGoals.map(li).join('')}</ul>`
      : '<em>No goals set</em>';

    const med = healthProfile.medical;
    const medicalBody = `
      <div style="margin-bottom:6px"><strong>Conditions:</strong> ${med.conditions.length ? escape(med.conditions.join(', ')) : 'None reported'}</div>
      <div style="margin-bottom:6px"><strong>Medications:</strong> ${med.medications.length ? escape(med.medications.join(', ')) : 'None reported'}</div>
      <div style="margin-bottom:6px"><strong>Allergies:</strong> ${med.allergies.length ? escape(med.allergies.join(', ')) : 'None reported'}</div>
      <div><strong>Provider Supervision:</strong> ${med.hasProviderSupervision ? 'Yes' : 'No'}</div>
    `;

    const protocolsBody = activeProtocols.length
      ? `<ul style="margin:0;padding-left:18px">${
          activeProtocols
            .map((p) => {
              const peptide = getPeptideById(p.peptideId);
              const name = peptide?.name || p.peptideId;
              return li(`${name}: ${p.dose} ${p.unit} ${p.route} (${p.frequency}) since ${p.startDate}`);
            })
            .join('')
        }</ul>`
      : '<em>No active protocols</em>';

    const checkinsBody = checkinAverages
      ? `
          <div style="margin-bottom:6px"><em>Based on ${checkinAverages.count} check-in(s)</em></div>
          <table style="width:100%;border-collapse:collapse">
            <tbody>
              <tr><td style="padding:4px 0"><strong>Mood</strong></td><td style="text-align:right">${checkinAverages.mood} / 5</td></tr>
              <tr><td style="padding:4px 0"><strong>Energy</strong></td><td style="text-align:right">${checkinAverages.energy} / 5</td></tr>
              <tr><td style="padding:4px 0"><strong>Stress</strong></td><td style="text-align:right">${checkinAverages.stress} / 5</td></tr>
              <tr><td style="padding:4px 0"><strong>Sleep</strong></td><td style="text-align:right">${checkinAverages.sleep} / 5</td></tr>
              <tr><td style="padding:4px 0"><strong>Recovery</strong></td><td style="text-align:right">${checkinAverages.recovery} / 5</td></tr>
              <tr><td style="padding:4px 0"><strong>Appetite</strong></td><td style="text-align:right">${checkinAverages.appetite} / 5</td></tr>
            </tbody>
          </table>`
      : '<em>No check-ins in this period</em>';

    const journalBody = journalSummary.total
      ? `
          <div style="margin-bottom:6px">Total entries: <strong>${journalSummary.total}</strong></div>
          <ul style="margin:0;padding-left:18px">
            ${Object.entries(journalSummary.byCategory)
              .map(([cat, count]) => {
                const label = cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                return li(`${label}: ${count}`);
              })
              .join('')}
          </ul>`
      : '<em>No journal entries in this period</em>';

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>PepTalk Health Report</title>
  <style>
    @page { margin: 24px 28px; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #2D2D2D; background: #FFFFFF; }
    h1 { font-size: 24px; letter-spacing: -0.5px; margin: 0; color: #2D2D2D; }
    .meta { color: #6B7280; font-size: 12px; margin-top: 4px; }
    .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #EAE4DC; font-size: 10px; color: #9CA3AF; line-height: 1.5; }
  </style>
</head>
<body>
  <header>
    <h1>PepTalk Health Report</h1>
    <div class="meta">${escape(rangeStart)} &ndash; ${escape(rangeEnd)} &middot; Generated ${escape(formatDate(now))}</div>
  </header>
  ${section('Demographics', demographicsBody)}
  ${section('Health Goals', goalsBody)}
  ${section('Medical History', medicalBody)}
  ${section('Active Protocols', protocolsBody)}
  ${section('Check-in Averages (Last 14 Days)', checkinsBody)}
  ${section('Journal Summary (Last 14 Days)', journalBody)}
  <div class="footer">
    Generated by PepTalk. This report is informational only and does not constitute medical advice.
    Always consult a licensed healthcare provider before starting or changing any peptide protocol.
  </div>
</body>
</html>`;
  };

  // Generate the PDF and hand it to the system share sheet so the user
  // can email it, AirDrop it to their doctor, save to Files, etc.
  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const html = buildReportHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share PepTalk Health Report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        // Sharing unavailable (rare on a real device) — fall back to text share.
        await handleShareText();
      }
    } catch (err: any) {
      Alert.alert('Export failed', err?.message ?? 'Could not generate PDF. Try again.');
    } finally {
      setExporting(false);
    }
  };

  // ------- Render helpers -------

  const SectionHeader = ({ icon, title }: { icon: string; title: string }) => (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon as any} size={18} color="#e3a7a1" />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const DataRow = ({ label, value }: { label: string; value: string }) => (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );

  return (
    <PaywallGate feature="health_reports">
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={24} color="#2D2D2D" />
        </Pressable>
        <Text style={styles.headerTitle}>Health Report</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Explanation card */}
        <GlassCard variant="accent" style={styles.explainCard}>
          <Ionicons name="document-text-outline" size={22} color="#e3a7a1" />
          <Text style={styles.explainText}>
            Generate a comprehensive health summary to share with your
            healthcare provider. This report includes your profile, check-in
            trends, active protocols, and journal entries.
          </Text>
        </GlassCard>

        {/* Date Range */}
        <View style={styles.dateRangeRow}>
          <Ionicons name="calendar-outline" size={16} color="#6B7280" />
          <Text style={styles.dateRangeText}>
            Report Period: {rangeStart} - {rangeEnd}
          </Text>
        </View>

        {/* Lab Trends — surfaces user's actual bloodwork before the
            generated report so they can see Aimee-relevant data inline. */}
        <View style={{ marginTop: 12, marginBottom: 4 }}>
          <LabTrendsCard />
        </View>

        {/* Report Preview */}

        {/* Demographics */}
        <GlassCard style={styles.reportCard}>
          <SectionHeader icon="person-outline" title="Demographics" />
          {onboardingProfile.gender && (
            <DataRow label="Gender" value={onboardingProfile.gender} />
          )}
          {onboardingProfile.ageRange && (
            <DataRow label="Age Range" value={onboardingProfile.ageRange} />
          )}
          {healthProfile.biologicalSex && (
            <DataRow label="Biological Sex" value={healthProfile.biologicalSex} />
          )}
          {healthProfile.bodyMetrics?.weightLbs && (
            <DataRow
              label="Weight"
              value={`${healthProfile.bodyMetrics.weightLbs} lbs`}
            />
          )}
          {healthProfile.bodyMetrics?.heightInches && (
            <DataRow
              label="Height"
              value={`${healthProfile.bodyMetrics.heightInches} in`}
            />
          )}
          {!onboardingProfile.gender &&
            !onboardingProfile.ageRange &&
            !healthProfile.biologicalSex &&
            !healthProfile.bodyMetrics?.weightLbs &&
            !healthProfile.bodyMetrics?.heightInches && (
              <Text style={styles.emptyHint}>
                No demographic data available. Complete your profile to include
                this section.
              </Text>
            )}
        </GlassCard>

        {/* Health Goals */}
        <GlassCard style={styles.reportCard}>
          <SectionHeader icon="flag-outline" title="Health Goals" />
          {healthGoals.length > 0 ? (
            <View style={styles.chipRow}>
              {healthGoals.map((g) => (
                <View key={g} style={styles.chip}>
                  <Text style={styles.chipText}>{g}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>No goals set</Text>
          )}
        </GlassCard>

        {/* Medical History */}
        <GlassCard style={styles.reportCard}>
          <SectionHeader icon="medkit-outline" title="Medical History" />

          <Text style={styles.subLabel}>Conditions</Text>
          {healthProfile.medical.conditions.length > 0 ? (
            <View style={styles.chipRow}>
              {healthProfile.medical.conditions.map((c) => (
                <View key={c} style={styles.chipWarning}>
                  <Text style={styles.chipWarningText}>{c}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>None reported</Text>
          )}

          <Text style={styles.subLabel}>Medications</Text>
          {healthProfile.medical.medications.length > 0 ? (
            <View style={styles.chipRow}>
              {healthProfile.medical.medications.map((m) => (
                <View key={m} style={styles.chip}>
                  <Text style={styles.chipText}>{m}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>None reported</Text>
          )}

          <Text style={styles.subLabel}>Allergies</Text>
          {healthProfile.medical.allergies.length > 0 ? (
            <View style={styles.chipRow}>
              {healthProfile.medical.allergies.map((a) => (
                <View key={a} style={styles.chipWarning}>
                  <Text style={styles.chipWarningText}>{a}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyHint}>None reported</Text>
          )}

          <DataRow
            label="Provider Supervision"
            value={healthProfile.medical.hasProviderSupervision ? 'Yes' : 'No'}
          />
        </GlassCard>

        {/* Active Protocols */}
        <GlassCard style={styles.reportCard}>
          <SectionHeader icon="flask-outline" title="Active Protocols" />
          {activeProtocols.length > 0 ? (
            activeProtocols.map((p) => {
              const peptide = getPeptideById(p.peptideId);
              const name = peptide?.name || p.peptideId;
              return (
                <View key={p.id} style={styles.protocolRow}>
                  <Text style={styles.protocolName}>{name}</Text>
                  <Text style={styles.protocolDetail}>
                    {p.dose} {p.unit} {p.route} ({p.frequency})
                  </Text>
                  <Text style={styles.protocolDate}>Since {p.startDate}</Text>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyHint}>No active protocols</Text>
          )}
        </GlassCard>

        {/* Check-in Averages */}
        <GlassCard style={styles.reportCard}>
          <SectionHeader icon="pulse-outline" title="Check-in Averages (14 days)" />
          {checkinAverages ? (
            <>
              <Text style={styles.checkinCount}>
                Based on {checkinAverages.count} check-in
                {checkinAverages.count !== 1 ? 's' : ''}
              </Text>
              <View style={styles.averagesGrid}>
                <AverageItem label="Mood" value={checkinAverages.mood} />
                <AverageItem label="Energy" value={checkinAverages.energy} />
                <AverageItem label="Stress" value={checkinAverages.stress} />
                <AverageItem label="Sleep" value={checkinAverages.sleep} />
                <AverageItem label="Recovery" value={checkinAverages.recovery} />
                <AverageItem label="Appetite" value={checkinAverages.appetite} />
              </View>
            </>
          ) : (
            <Text style={styles.emptyHint}>
              No check-ins in the last 14 days
            </Text>
          )}
        </GlassCard>

        {/* Journal Summary */}
        <GlassCard style={styles.reportCard}>
          <SectionHeader icon="journal-outline" title="Journal Summary (14 days)" />
          {journalSummary.total > 0 ? (
            <>
              <Text style={styles.checkinCount}>
                {journalSummary.total} total entr
                {journalSummary.total !== 1 ? 'ies' : 'y'}
              </Text>
              {Object.entries(journalSummary.byCategory).map(([cat, count]) => {
                const label = cat
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <DataRow key={cat} label={label} value={String(count)} />
                );
              })}
            </>
          ) : (
            <Text style={styles.emptyHint}>
              No journal entries in the last 14 days
            </Text>
          )}
        </GlassCard>

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
          <Text style={styles.disclaimerText}>
            This report is informational only and does not constitute medical
            advice. Always consult your healthcare provider before making changes
            to your health regimen.
          </Text>
        </View>

        {/* Export buttons — PDF is primary (what users send to their
            doctor); plain-text share is the lightweight backup that
            works in any messaging app. */}
        <Pressable
          style={[styles.shareBtn, exporting && { opacity: 0.6 }]}
          onPress={handleExportPdf}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel={exporting ? 'Generating PDF' : 'Export report as PDF'}
        >
          <Ionicons name="document-text-outline" size={20} color="#2D2D2D" />
          <Text style={styles.shareBtnText}>
            {exporting ? 'Generating PDF…' : 'Export as PDF'}
          </Text>
        </Pressable>

        <Pressable
          style={[styles.shareBtn, { marginTop: 10, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EAE4DC' }]}
          onPress={handleShareText}
          accessibilityRole="button"
          accessibilityLabel="Share report as plain text"
        >
          <Ionicons name="share-outline" size={18} color="#6B7280" />
          <Text style={[styles.shareBtnText, { color: '#6B7280' }]}>Share as text</Text>
        </Pressable>

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
    </PaywallGate>
  );
}

// ---------------------------------------------------------------------------
// Small components
// ---------------------------------------------------------------------------

function AverageItem({ label, value }: { label: string; value: string }) {
  const numVal = parseFloat(value);
  const color =
    numVal >= 4
      ? '#22c55e'
      : numVal >= 3
        ? '#F4ECC2'
        : '#ef4444';

  return (
    <View style={styles.avgItem}>
      <Text style={styles.avgLabel}>{label}</Text>
      <Text style={[styles.avgValue, { color }]}>{value}</Text>
      <Text style={styles.avgMax}>/5</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F0EEE9',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // Content
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Explain card
  explainCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  explainText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  // Date range
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  dateRangeText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },

  // Report cards
  reportCard: {
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // Data rows
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  dataLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  dataValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D2D',
  },

  // Sub labels
  subLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 10,
    marginBottom: 6,
  },

  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  chip: {
    backgroundColor: 'rgba(227,167,161,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 12,
    color: '#e3a7a1',
    fontWeight: '600',
  },
  chipWarning: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  chipWarningText: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
  },

  // Empty
  emptyHint: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },

  // Protocol rows
  protocolRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  protocolName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D2D2D',
    marginBottom: 2,
  },
  protocolDetail: {
    fontSize: 13,
    color: '#6B7280',
  },
  protocolDate: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },

  // Check-in averages
  checkinCount: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 10,
  },
  averagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  avgItem: {
    width: '30%',
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  avgLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  avgValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  avgMax: {
    fontSize: 11,
    color: '#6b7280',
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 17,
  },

  // Share button
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e3a7a1',
    paddingVertical: 16,
    borderRadius: 16,
  },
  shareBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
  },
});
