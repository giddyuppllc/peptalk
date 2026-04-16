import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { StackAnalysis, PeptideInteraction } from '../types';
import { SynergyScore } from './SynergyScore';
import { GlassCard } from './GlassCard';
import { getPeptideById } from '../data/peptides';
import { getCategoryColor } from '../constants/categories';

interface AnalysisCardProps {
  analysis: StackAnalysis;
}

const InteractionCard: React.FC<{ interaction: PeptideInteraction }> = ({
  interaction,
}) => {
  const peptideA = getPeptideById(interaction.peptideA);
  const peptideB = getPeptideById(interaction.peptideB);

  const interactionTypeColor =
    interaction.interactionType === 'synergistic'
      ? '#22c55e'
      : interaction.interactionType === 'competitive' || interaction.interactionType === 'contraindicated'
        ? '#ef4444'
        : '#F4E9A7';

  return (
    <GlassCard style={styles.interactionCard}>
      <View style={styles.interactionHeader}>
        <View style={styles.peptidePair}>
          <Text style={styles.peptideName}>
            {peptideA?.name ?? interaction.peptideA}
          </Text>
          <Text style={styles.interactionArrow}>{'\u2194'}</Text>
          <Text style={styles.peptideName}>
            {peptideB?.name ?? interaction.peptideB}
          </Text>
        </View>
        <SynergyScore score={interaction.synergyScore} size="small" showLabel={false} />
      </View>

      <View style={styles.interactionTypeBadge}>
        <View
          style={[
            styles.typePill,
            { backgroundColor: `${interactionTypeColor}20` },
          ]}
        >
          <Text style={[styles.typeText, { color: interactionTypeColor }]}>
            {interaction.interactionType}
          </Text>
        </View>
      </View>

      {interaction.mechanismAnalysis ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>Mechanism</Text>
          <Text style={styles.detailText}>{interaction.mechanismAnalysis}</Text>
        </View>
      ) : null}

      {interaction.stabilityConsiderations ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailLabel}>Stability Notes</Text>
          <Text style={styles.detailText}>{interaction.stabilityConsiderations}</Text>
        </View>
      ) : null}
    </GlassCard>
  );
};

export const AnalysisCard: React.FC<AnalysisCardProps> = ({ analysis }) => {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <GlassCard variant="elevated" style={styles.overallScoreCard}>
        <Text style={styles.sectionTitle}>Overall Synergy</Text>
        <View style={styles.overallScoreRow}>
          <SynergyScore score={analysis.overallSynergyScore} size="large" />
          <View style={styles.overallScoreInfo}>
            <Text style={styles.scoreOutOf}>
              {analysis.overallSynergyScore} / 10
            </Text>
            <Text style={styles.scoreSubtext}>
              Based on {analysis.interactions.length} interaction
              {analysis.interactions.length !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </GlassCard>

      {analysis.categoryCoverage && analysis.categoryCoverage.length > 0 ? (
        <GlassCard style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Category Coverage</Text>
          <View style={styles.categoriesRow}>
            {analysis.categoryCoverage.map((category) => {
              const color = getCategoryColor(category);
              return (
                <View
                  key={category}
                  style={[
                    styles.categoryPill,
                    {
                      backgroundColor: `${color}20`,
                      borderColor: `${color}40`,
                    },
                  ]}
                >
                  <Text style={[styles.categoryPillText, { color }]}>
                    {category}
                  </Text>
                </View>
              );
            })}
          </View>
        </GlassCard>
      ) : null}

      {analysis.interactions.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Interactions</Text>
          {analysis.interactions.map((interaction, index) => (
            <InteractionCard key={index} interaction={interaction} />
          ))}
        </View>
      ) : null}

      {analysis.warnings && analysis.warnings.length > 0 ? (
        <GlassCard variant="accent" style={styles.warningsCard}>
          <Text style={styles.warningsTitle}>Warnings</Text>
          {analysis.warnings.map((warning, index) => (
            <View key={index} style={styles.warningRow}>
              <Text style={styles.warningBullet}>{'\u26A0'}</Text>
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}
        </GlassCard>
      ) : null}

      {analysis.summary ? (
        <GlassCard style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summaryText}>{analysis.summary}</Text>
        </GlassCard>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 24 },
  overallScoreCard: { marginBottom: 16 },
  overallScoreRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  overallScoreInfo: { marginLeft: 20, flex: 1 },
  scoreOutOf: { fontSize: 20, fontWeight: '700', color: '#2D2D2D' },
  scoreSubtext: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  sectionCard: { marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2D2D2D', marginBottom: 8 },
  categoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  categoryPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  categoryPillText: { fontSize: 12, fontWeight: '600' },
  interactionCard: { marginBottom: 12 },
  interactionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  peptidePair: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  peptideName: { fontSize: 14, fontWeight: '700', color: '#2D2D2D' },
  interactionArrow: { fontSize: 14, color: '#6B7280', marginHorizontal: 8 },
  interactionTypeBadge: { flexDirection: 'row', marginTop: 8 },
  typePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  typeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  detailSection: { marginTop: 10 },
  detailLabel: { fontSize: 11, fontWeight: '700', color: '#c7d7e6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  detailText: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  warningsCard: { marginBottom: 16 },
  warningsTitle: { fontSize: 16, fontWeight: '700', color: '#e3a7a1', marginBottom: 10 },
  warningRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  warningBullet: { fontSize: 14, marginRight: 8, marginTop: 1 },
  warningText: { fontSize: 13, color: '#2D2D2D', lineHeight: 19, flex: 1 },
  summaryCard: { marginBottom: 16 },
  summaryText: { fontSize: 14, color: '#6B7280', lineHeight: 21 },
});

export default AnalysisCard;
