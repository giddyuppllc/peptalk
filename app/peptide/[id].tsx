import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
  StyleSheet,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPeptideById } from '../../src/data/peptides';
import { useStackStore } from '../../src/store/useStackStore';
import { GlassCard } from '../../src/components/GlassCard';
import { TitrationScheduleCard } from '../../src/components/TitrationScheduleCard';
import { getCategoryColor } from '../../src/constants/categories';
import { Disclaimer } from '../../src/components/Disclaimer';
import { trackPeptideView } from '../../src/services/analyticsEvents';
import { getProtocolsByPeptide } from '../../src/data/protocols';
import { getTrialsByPeptideId } from '../../src/data/clinicalTrials';
import { getSafetyProfileByPeptideId } from '../../src/data/safetyProfiles';
import { getCuratedStacksByPeptideId } from '../../src/data/curatedStacks';
import { getPeptideNutrition } from '../../src/data/peptideNutrition';
import { getVideosByPeptideId } from '../../src/data/videos';
import { getGuidesByPeptideId } from '../../src/data/howToGuides';
import { getInteractionsByPeptideId } from '../../src/data/interactions';

// ── Helper Functions ──────────────────────────────────────────────

function getApprovalColor(status: string): string {
  switch (status) {
    case 'fda_approved': return '#22c55e';
    case 'ema_approved': return '#7ABED0';
    case 'approved_other': return '#06b6d4';
    case 'phase_3': return '#CADEE5';
    case 'phase_2': return '#f97316';
    case 'phase_1': return '#ef4444';
    case 'preclinical': return '#BADDCB';
    default: return '#6b7280';
  }
}

function getApprovalLabel(status: string): string {
  switch (status) {
    case 'fda_approved': return 'FDA Approved';
    case 'ema_approved': return 'EMA Approved';
    case 'approved_other': return 'Approved (Other)';
    case 'phase_3': return 'Phase 3';
    case 'phase_2': return 'Phase 2';
    case 'phase_1': return 'Phase 1';
    case 'preclinical': return 'Preclinical';
    default: return 'Research Only';
  }
}

function getEvidenceColor(grade: string): string {
  switch (grade) {
    case 'established': return '#22c55e';
    case 'moderate': return '#CADEE5';
    case 'preliminary': return '#f97316';
    default: return '#6b7280';
  }
}

function getEvidenceIcon(grade: string): string {
  switch (grade) {
    case 'established': return 'checkmark-circle';
    case 'moderate': return 'ellipse-outline';
    case 'preliminary': return 'help-circle-outline';
    default: return 'help-circle-outline';
  }
}

export default function PeptideDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { currentStack, addToStack } = useStackStore();

  const peptide = getPeptideById(id ?? '');

  useEffect(() => {
    if (!peptide) return;
    trackPeptideView(peptide.id, peptide.name);
  }, [peptide]);

  if (!peptide) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.notFound}>
          <Ionicons name="alert-circle-outline" size={48} color="#6B7280" />
          <Text style={styles.notFoundTitle}>Peptide Not Found</Text>
          <Text style={styles.notFoundSubtitle}>
            The requested peptide could not be found in the database.
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/(tabs)/my-stacks'); }}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Data lookups (memoized — these scan large in-memory tables and were
  //    blocking the JS thread on every render, causing the MOTSC freeze) ──
  const safetyProfile = useMemo(() => getSafetyProfileByPeptideId(peptide.id), [peptide.id]);
  const clinicalTrials = useMemo(() => getTrialsByPeptideId(peptide.id), [peptide.id]);
  const protocols = useMemo(() => getProtocolsByPeptide(peptide.id), [peptide.id]);
  const relatedStacks = useMemo(() => getCuratedStacksByPeptideId(peptide.id), [peptide.id]);
  const nutritionGuidance = useMemo(() => getPeptideNutrition(peptide.id), [peptide.id]);
  const relatedVideos = useMemo(() => getVideosByPeptideId(peptide.id), [peptide.id]);
  const relatedGuides = useMemo(() => getGuidesByPeptideId(peptide.id), [peptide.id]);

  const isInStack = currentStack.includes(peptide.id);
  const stackFull = currentStack.length >= 5;

  const handleAddToStack = () => {
    if (isInStack) {
      Alert.alert('Already Added', `${peptide.name} is already in your stack.`);
      return;
    }
    if (stackFull) {
      Alert.alert(
        'Stack Full',
        'Your stack has reached the maximum of 5 peptides. Remove one before adding another.'
      );
      return;
    }
    addToStack(peptide.id);
    Alert.alert('Added', `${peptide.name} has been added to your stack.`);
  };

  const handlePubMedLink = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open the link.');
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Spacer for transparent header */}
        <View style={styles.headerSpacer} />

        {/* Name and Abbreviation */}
        <View style={styles.titleSection}>
          <Text style={styles.peptideName}>{peptide.name}</Text>
          {peptide.abbreviation && (
            <View style={styles.abbreviationBadge}>
              <Text style={styles.abbreviationText}>
                {peptide.abbreviation}
              </Text>
            </View>
          )}
        </View>

        {/* Category Tags */}
        <View style={styles.categoriesRow}>
          {peptide.categories.map((cat) => (
            <View
              key={cat}
              style={[
                styles.categoryPill,
                { backgroundColor: `${getCategoryColor(cat)}20` },
              ]}
            >
              <Text
                style={[
                  styles.categoryPillText,
                  { color: getCategoryColor(cat) },
                ]}
              >
                {cat}
              </Text>
            </View>
          ))}
        </View>

        {/* NEW: Approval Status Badge */}
        {peptide.approvalStatus && (
          <View style={styles.approvalRow}>
            <View style={[styles.approvalBadge, { backgroundColor: getApprovalColor(peptide.approvalStatus) }]}>
              <Text style={styles.approvalBadgeText}>{getApprovalLabel(peptide.approvalStatus)}</Text>
            </View>
            {peptide.approvalDetails && (
              <Text style={styles.approvalDetails}>{peptide.approvalDetails}</Text>
            )}
          </View>
        )}

        {/* NEW: Brand Names */}
        {peptide.commonBrandNames && peptide.commonBrandNames.length > 0 && (
          <View style={styles.brandRow}>
            {peptide.commonBrandNames.map((name, i) => (
              <View key={i} style={styles.brandPill}>
                <Text style={styles.brandPillText}>{name}</Text>
              </View>
            ))}
          </View>
        )}

        {/* NEW: Evidence Grade */}
        {peptide.evidenceGrade && (
          <View style={styles.evidenceRow}>
            <View style={[styles.evidenceBadge, { backgroundColor: getEvidenceColor(peptide.evidenceGrade) }]}>
              <Ionicons name={getEvidenceIcon(peptide.evidenceGrade) as any} size={14} color="#2D2D2D" />
              <Text style={styles.evidenceBadgeText}>{peptide.evidenceGrade.charAt(0).toUpperCase() + peptide.evidenceGrade.slice(1)} Evidence</Text>
            </View>
          </View>
        )}

        {/* Educational disclaimer banner */}
        <View style={styles.eduDisclaimerBanner}>
          <View style={styles.eduDisclaimerIcon}>
            <Ionicons name="shield-checkmark" size={16} color="#7ABED0" />
          </View>
          <Text style={styles.eduDisclaimerText}>
            Educational research information only.{'\n'}
            <Text style={styles.eduDisclaimerSub}>
              Not medical advice. Consult a licensed healthcare provider before any decisions.
            </Text>
          </Text>
        </View>

        {/* Research Context */}
        {peptide.uses && (
          <View style={styles.usesSection}>
            <View style={styles.usesSectionHeader}>
              <Ionicons name="library-outline" size={20} color="#7ABED0" />
              <Text style={styles.usesSectionTitle}>Research Context</Text>
            </View>

            {/* Research Focus Areas — colored pill badges */}
            <Text style={styles.usesSubtitle}>Research Focus Areas</Text>
            <View style={styles.usesPillsRow}>
              {peptide.uses.primaryUses.map((use, i) => (
                <View key={i} style={styles.usesPrimaryPill}>
                  <Text style={styles.usesPrimaryPillText}>{use}</Text>
                </View>
              ))}
            </View>

            {/* Studied For */}
            {peptide.uses.commonGoals.length > 0 && (
              <View style={styles.usesGoalsSection}>
                <Text style={styles.usesSubtitle}>Studied For</Text>
                <View style={styles.usesGoalsRow}>
                  {peptide.uses.commonGoals.map((goal, i) => (
                    <View key={i} style={styles.usesGoalTag}>
                      <Text style={styles.usesGoalTagText}>{goal}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Community Observations */}
            <GlassCard style={styles.usesReportCard}>
              <View style={styles.usesReportHeader}>
                <Ionicons name="chatbubbles-outline" size={16} color="#7ABED0" />
                <Text style={styles.usesReportTitle}>Community Observations</Text>
              </View>
              <Text style={styles.usesReportText}>{peptide.uses.whatPeopleReport}</Text>
              <Text style={styles.usesReportDisclaimer}>
                Anecdotal reports from community discussion — not clinical outcomes.
              </Text>
            </GlassCard>

            {/* Research Populations */}
            {peptide.uses.popularWith.length > 0 && (
              <View style={styles.usesPopularSection}>
                <Text style={styles.usesSubtitle}>Research Populations</Text>
                <View style={styles.usesPopularRow}>
                  {peptide.uses.popularWith.map((group, i) => (
                    <View key={i} style={styles.usesPopularBadge}>
                      <Ionicons name="person-outline" size={12} color="#7ABED0" />
                      <Text style={styles.usesPopularBadgeText}>{group}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Frequently Co-Researched With */}
            {peptide.uses.pairsWith.length > 0 && (
              <View style={styles.usesPairsSection}>
                <Text style={styles.usesSubtitle}>Frequently Co-Researched With</Text>
                <View style={styles.usesPairsRow}>
                  {peptide.uses.pairsWith.map((pairId) => {
                    const pairPeptide = getPeptideById(pairId);
                    if (!pairPeptide) return null;
                    return (
                      <TouchableOpacity
                        key={pairId}
                        style={styles.usesPairChip}
                        onPress={() => router.push(`/peptide/${pairId}` as any)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="link-outline" size={14} color="#7ABED0" />
                        <Text style={styles.usesPairChipText}>{pairPeptide.name}</Text>
                        <Ionicons name="chevron-forward" size={12} color="#6B7280" />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Research Summary */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={18} color="#7ABED0" />
            <Text style={styles.sectionTitle}>Research Summary</Text>
          </View>
          <Text style={styles.sectionText}>{peptide.researchSummary}</Text>
        </GlassCard>

        {/* Mechanism of Action */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="git-branch-outline" size={18} color="#7ABED0" />
            <Text style={styles.sectionTitle}>Mechanism of Action</Text>
          </View>
          <Text style={styles.sectionText}>{peptide.mechanismOfAction}</Text>
        </GlassCard>

        {/* Receptor Targets */}
        {peptide.receptorTargets && peptide.receptorTargets.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="radio-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Receptor Targets</Text>
            </View>
            <View style={styles.pillsRow}>
              {peptide.receptorTargets.map((target, index) => (
                <View key={index} style={styles.targetPill}>
                  <Text style={styles.targetPillText}>{target}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Signaling Pathways */}
        {peptide.signalingPathways && peptide.signalingPathways.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name="git-network-outline"
                size={18}
                color="#7ABED0"
              />
              <Text style={styles.sectionTitle}>Signaling Pathways</Text>
            </View>
            <View style={styles.pillsRow}>
              {peptide.signalingPathways.map((pathway, index) => (
                <View key={index} style={styles.pathwayPill}>
                  <Text style={styles.pathwayPillText}>{pathway}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
        )}

        {/* Stability Notes */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="shield-outline" size={18} color="#7ABED0" />
            <Text style={styles.sectionTitle}>Stability Notes</Text>
          </View>
          <Text style={styles.sectionText}>{peptide.stabilityNotes}</Text>
        </GlassCard>

        {/* Molecular Data */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="analytics-outline" size={18} color="#7ABED0" />
            <Text style={styles.sectionTitle}>Molecular Data</Text>
          </View>
          <View style={styles.dataGrid}>
            {peptide.molecularWeight && (
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Molecular Weight</Text>
                <Text style={styles.dataValue}>{peptide.molecularWeight}</Text>
              </View>
            )}
            {peptide.sequenceLength && (
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Sequence Length</Text>
                <Text style={styles.dataValue}>
                  {peptide.sequenceLength} amino acids
                </Text>
              </View>
            )}
            {peptide.halfLife && (
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Half-Life</Text>
                <Text style={styles.dataValue}>{peptide.halfLife}</Text>
              </View>
            )}
            {peptide.storageTemp && (
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Storage Temperature</Text>
                <Text style={styles.dataValue}>{peptide.storageTemp}</Text>
              </View>
            )}
            {peptide.reconstitution && (
              <View style={styles.dataItem}>
                <Text style={styles.dataLabel}>Reconstitution</Text>
                <Text style={styles.dataValue}>{peptide.reconstitution}</Text>
              </View>
            )}
          </View>
        </GlassCard>

        {/* NEW: Chemical Structure Image */}
        {peptide.structureImageUrl && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flask-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Chemical Structure</Text>
            </View>
            <Image source={{ uri: peptide.structureImageUrl }} style={styles.structureImage} resizeMode="contain" />
          </GlassCard>
        )}

        {/* NEW: Additional Information */}
        {(peptide.bioavailability || peptide.routeOfAdministration?.length || peptide.naturalSources || peptide.yearDiscovered || peptide.aminoAcidSequence) && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Additional Information</Text>
            </View>
            <View style={styles.dataGrid}>
              {peptide.yearDiscovered && (
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Year Discovered</Text>
                  <Text style={styles.dataValue}>{peptide.yearDiscovered}</Text>
                </View>
              )}
              {peptide.bioavailability && (
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Bioavailability</Text>
                  <Text style={styles.dataValue}>{peptide.bioavailability}</Text>
                </View>
              )}
              {peptide.routeOfAdministration && peptide.routeOfAdministration.length > 0 && (
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Route(s)</Text>
                  <Text style={styles.dataValue}>{peptide.routeOfAdministration.join(', ')}</Text>
                </View>
              )}
              {peptide.naturalSources && (
                <View style={styles.dataItem}>
                  <Text style={styles.dataLabel}>Natural Source</Text>
                  <Text style={styles.dataValue}>{peptide.naturalSources}</Text>
                </View>
              )}
            </View>
            {peptide.aminoAcidSequence && (
              <View style={styles.sequenceContainer}>
                <Text style={styles.dataLabel}>Amino Acid Sequence</Text>
                <Text style={styles.sequenceText}>{peptide.aminoAcidSequence}</Text>
              </View>
            )}
          </GlassCard>
        )}

        {/* NEW: Adverse Effects */}
        {peptide.adverseEffects && peptide.adverseEffects.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="warning-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Known Adverse Effects</Text>
            </View>
            {peptide.adverseEffects.map((effect, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{effect}</Text>
              </View>
            ))}
          </GlassCard>
        )}

        {/* NEW: Drug Interactions */}
        {peptide.drugInteractions && peptide.drugInteractions.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="swap-horizontal-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Drug Interactions</Text>
            </View>
            {peptide.drugInteractions.map((interaction, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{interaction}</Text>
              </View>
            ))}
          </GlassCard>
        )}

        {/* Nutrition guidance for this peptide */}
        {nutritionGuidance && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="nutrition-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Nutrition on this peptide</Text>
            </View>
            <Text style={styles.nutritionSummary}>{nutritionGuidance.summary}</Text>
            {nutritionGuidance.proteinGPerLbRange && (
              <View style={styles.nutritionRow}>
                <Ionicons name="fitness-outline" size={14} color="#6B7280" />
                <Text style={styles.nutritionRowText}>
                  Protein target:{' '}
                  <Text style={styles.nutritionBold}>
                    {nutritionGuidance.proteinGPerLbRange[0]}–
                    {nutritionGuidance.proteinGPerLbRange[1]} g per lb bodyweight
                  </Text>
                </Text>
              </View>
            )}
            {nutritionGuidance.hydrationMultiplier &&
              nutritionGuidance.hydrationMultiplier > 1 && (
                <View style={styles.nutritionRow}>
                  <Ionicons name="water-outline" size={14} color="#6B7280" />
                  <Text style={styles.nutritionRowText}>
                    Hydration: bump{' '}
                    <Text style={styles.nutritionBold}>
                      {Math.round((nutritionGuidance.hydrationMultiplier - 1) * 100)}%
                    </Text>{' '}
                    above baseline
                  </Text>
                </View>
              )}
            {nutritionGuidance.foodsEmphasize && nutritionGuidance.foodsEmphasize.length > 0 && (
              <View style={styles.nutritionBlock}>
                <Text style={styles.nutritionBlockLabel}>Emphasize</Text>
                <Text style={styles.nutritionBlockText}>
                  {nutritionGuidance.foodsEmphasize.join(' · ')}
                </Text>
              </View>
            )}
            {nutritionGuidance.foodsAvoid && nutritionGuidance.foodsAvoid.length > 0 && (
              <View style={styles.nutritionBlock}>
                <Text style={styles.nutritionBlockLabel}>Limit</Text>
                <Text style={styles.nutritionBlockText}>
                  {nutritionGuidance.foodsAvoid.join(' · ')}
                </Text>
              </View>
            )}
            {nutritionGuidance.microEmphasis && nutritionGuidance.microEmphasis.length > 0 && (
              <View style={styles.nutritionBlock}>
                <Text style={styles.nutritionBlockLabel}>Micronutrients</Text>
                <Text style={styles.nutritionBlockText}>
                  {nutritionGuidance.microEmphasis.join(' · ')}
                </Text>
              </View>
            )}
          </GlassCard>
        )}

        {/* NEW: Safety Profile */}
        {safetyProfile && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medkit-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Safety Profile</Text>
            </View>
            {safetyProfile.blackBoxWarnings && safetyProfile.blackBoxWarnings.length > 0 && (
              <View style={styles.warningBox}>
                <Ionicons name="alert-circle" size={16} color="#ef4444" />
                <View style={{ flex: 1 }}>
                  {safetyProfile.blackBoxWarnings.map((w, i) => (
                    <Text key={i} style={styles.warningText}>{w}</Text>
                  ))}
                </View>
              </View>
            )}
            {safetyProfile.contraindications.length > 0 && (
              <View style={styles.safetySubsection}>
                <Text style={styles.safetySubtitle}>Contraindications</Text>
                {safetyProfile.contraindications.map((c, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: '#ef4444' }]}>•</Text>
                    <Text style={styles.bulletText}>{c}</Text>
                  </View>
                ))}
              </View>
            )}
            {safetyProfile.seriousAdverseEffects.length > 0 && (
              <View style={styles.safetySubsection}>
                <Text style={styles.safetySubtitle}>Serious Adverse Effects</Text>
                {safetyProfile.seriousAdverseEffects.map((e, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bulletDot, { color: '#CADEE5' }]}>•</Text>
                    <Text style={styles.bulletText}>{e}</Text>
                  </View>
                ))}
              </View>
            )}
            {safetyProfile.commonSideEffects.length > 0 && (
              <View style={styles.safetySubsection}>
                <Text style={styles.safetySubtitle}>Common Side Effects</Text>
                {safetyProfile.commonSideEffects.map((e, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{e}</Text>
                  </View>
                ))}
              </View>
            )}
            {safetyProfile.monitoringRequired && safetyProfile.monitoringRequired.length > 0 && (
              <View style={styles.safetySubsection}>
                <Text style={styles.safetySubtitle}>Monitoring Required</Text>
                {safetyProfile.monitoringRequired.map((m, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{m}</Text>
                  </View>
                ))}
              </View>
            )}
            {safetyProfile.pregnancyCategory && (
              <View style={styles.safetySubsection}>
                <Text style={styles.safetySubtitle}>Pregnancy Category</Text>
                <Text style={styles.sectionText}>{safetyProfile.pregnancyCategory}</Text>
              </View>
            )}
            <View style={{ marginTop: 12 }}>
              <Disclaimer variant="safety" />
            </View>
          </GlassCard>
        )}

        {/* NEW: Clinical Trials */}
        {clinicalTrials.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="flask-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Clinical Trials</Text>
            </View>
            {clinicalTrials.map((trial, i) => (
              <View key={i} style={styles.trialCard}>
                <View style={styles.trialHeader}>
                  <Text style={styles.trialName}>{trial.name}</Text>
                  <View style={styles.trialPhaseBadge}>
                    <Text style={styles.trialPhaseText}>{trial.phase}</Text>
                  </View>
                </View>
                <Text style={styles.trialStatus}>{trial.status}</Text>
                {trial.enrollment && (
                  <Text style={styles.trialDetail}>Enrollment: {trial.enrollment.toLocaleString()}</Text>
                )}
                {trial.primaryEndpoint && (
                  <Text style={styles.trialDetail}>Primary endpoint: {trial.primaryEndpoint}</Text>
                )}
                {trial.keyFindings && (
                  <Text style={styles.trialFindings}>{trial.keyFindings}</Text>
                )}
                {trial.nctId && (
                  <TouchableOpacity onPress={() => handlePubMedLink(`https://clinicaltrials.gov/study/${trial.nctId}`)}>
                    <Text style={styles.trialLink}>{trial.nctId}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </GlassCard>
        )}

        {/* NEW: Protocol Templates */}
        {protocols.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="clipboard-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Protocol Templates</Text>
            </View>
            <Disclaimer variant="dosing" />
            {protocols.map((proto) => (
              <View key={proto.id} style={styles.protocolCard}>
                <Text style={styles.protocolName}>{proto.name}</Text>
                <View style={styles.protocolDetails}>
                  <Text style={styles.protocolDetail}>
                    {proto.typicalDose.min}-{proto.typicalDose.max} {proto.typicalDose.unit} • {proto.route}
                  </Text>
                  <Text style={styles.protocolDetail}>
                    {proto.frequencyLabel} • {proto.durationWeeks.min}-{proto.durationWeeks.max} weeks
                  </Text>
                  {proto.timing && (
                    <Text style={styles.protocolTiming}>{proto.timing}</Text>
                  )}
                </View>
                {/* Render structured week-by-week ladder when populated. */}
                <TitrationScheduleCard protocol={proto} />
              </View>
            ))}
          </GlassCard>
        )}

        {/* NEW: Related Stacks */}
        {relatedStacks.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="layers-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Featured In Stacks</Text>
            </View>
            {relatedStacks.map((stack) => (
              <TouchableOpacity key={stack.id} style={styles.relatedStackCard} onPress={() => {
                const { loadStack } = useStackStore.getState();
                loadStack(stack);
                router.push('/(tabs)/stack-builder');
              }} activeOpacity={0.7}>
                <View style={styles.relatedStackHeader}>
                  <Text style={styles.relatedStackName}>{stack.name}</Text>
                  <Text style={styles.relatedStackCount}>{stack.peptideIds.length} peptides</Text>
                </View>
                {stack.description && (
                  <Text style={styles.relatedStackDesc} numberOfLines={2}>{stack.description}</Text>
                )}
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        {/* NEW: Related Videos */}
        {relatedVideos.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="videocam-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>Related Videos</Text>
            </View>
            {relatedVideos.map((video) => (
              <TouchableOpacity key={video.id} style={styles.videoCard} onPress={() => router.push(`/learn/videos/${video.slug}`)} activeOpacity={0.7}>
                <Ionicons name="play-circle-outline" size={32} color="#7ABED0" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.videoTitle}>{video.title}</Text>
                  {video.duration && <Text style={styles.videoDuration}>{video.duration}</Text>}
                </View>
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        {/* NEW: Related How-To Guides */}
        {relatedGuides.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="book-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>How-To Guides</Text>
            </View>
            {relatedGuides.map((guide) => (
              <TouchableOpacity key={guide.id} style={styles.guideCard} onPress={() => router.push(`/learn/guides/${guide.slug}`)} activeOpacity={0.7}>
                <Ionicons name="list-outline" size={20} color="#7ABED0" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.guideTitle}>{guide.title}</Text>
                  <Text style={styles.guideSummary} numberOfLines={1}>{guide.summary}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#6B7280" />
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        {/* Add to Stack Button */}
        <TouchableOpacity
          style={[
            styles.addToStackButton,
            isInStack && styles.addToStackButtonActive,
            stackFull && !isInStack && styles.addToStackButtonDisabled,
          ]}
          onPress={handleAddToStack}
          disabled={isInStack}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isInStack ? 'checkmark-circle' : 'add-circle-outline'}
            size={20}
            color={isInStack ? '#7ABED0' : '#fff'}
          />
          <Text
            style={[
              styles.addToStackText,
              isInStack && styles.addToStackTextActive,
            ]}
          >
            {isInStack ? 'In Your Stack' : 'Add to Stack'}
          </Text>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() => router.push('/(tabs)/calendar')}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={18} color="#7ABED0" />
            <Text style={styles.quickActionText}>Log Dose</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickActionBtn}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/peptalk',
                params: { prefill: `Tell me about ${peptide.name} dosing` },
              } as any)
            }
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-outline" size={18} color="#BADDCB" />
            <Text style={styles.quickActionText}>Ask Aimee</Text>
          </TouchableOpacity>
        </View>

        {/* PubMed Links */}
        {peptide.pubmedLinks && peptide.pubmedLinks.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="link-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>PubMed References</Text>
            </View>
            {peptide.pubmedLinks.map((link, index) => (
              <TouchableOpacity
                key={index}
                style={styles.pubmedLink}
                onPress={() => handlePubMedLink(link)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="open-outline"
                  size={14}
                  color="#7ABED0"
                />
                <Text style={styles.pubmedLinkText} numberOfLines={1}>
                  {link}
                </Text>
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        {/* NEW: DOI Citations */}
        {peptide.doiLinks && peptide.doiLinks.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-outline" size={18} color="#7ABED0" />
              <Text style={styles.sectionTitle}>DOI Citations</Text>
            </View>
            {peptide.doiLinks.map((doi, index) => (
              <TouchableOpacity key={index} style={styles.pubmedLink} onPress={() => handlePubMedLink(doi.startsWith('http') ? doi : `https://doi.org/${doi}`)} activeOpacity={0.7}>
                <Ionicons name="open-outline" size={14} color="#7ABED0" />
                <Text style={styles.pubmedLinkText} numberOfLines={1}>{doi}</Text>
              </TouchableOpacity>
            ))}
          </GlassCard>
        )}

        {/* Disclaimer */}
        <Disclaimer />
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Light-theme restyle — matches the rest of the app (white bg, peach accents,
// Playfair titles, DM Sans body). Replaces the legacy dark palette.
// ═══════════════════════════════════════════════════════════════════════════

const PEACH = '#7ABED0';
const PEACH_SOFT = '#F5DAD6';
const TEXT = '#2D2D2D';
const TEXT_SECONDARY = '#6B7280';
const TEXT_MUTED = '#9CA3AF';
const BG = '#EDE6D6'; // Cloud Dancer
const SURFACE = '#FAF5EF';
const CARD_BORDER = 'rgba(0,0,0,0.06)';
const DIVIDER = 'rgba(0,0,0,0.06)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerSpacer: {
    height: 48,
  },

  // ── Not Found ───────────────────────────────────────────────
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  notFoundTitle: {
    fontSize: 20,
    fontFamily: 'Playfair-Black',
    color: TEXT,
    marginTop: 16,
    letterSpacing: -0.3,
  },
  notFoundSubtitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 6,
  },
  backButton: {
    backgroundColor: PEACH,
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 20,
  },
  backButtonText: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // ── Title ───────────────────────────────────────────────────
  titleSection: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 12,
    marginTop: 4,
  },
  peptideName: {
    fontSize: 36,
    fontFamily: 'Playfair-Black',
    color: TEXT,
    letterSpacing: -0.8,
    flex: 1,
    lineHeight: 40,
  },
  abbreviationBadge: {
    backgroundColor: `${PEACH}1A`,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 4,
  },
  abbreviationText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    color: PEACH,
    letterSpacing: 0.4,
  },

  // ── Categories ──────────────────────────────────────────────
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  categoryPillText: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.3,
  },

  // ── Approval Badge ──────────────────────────────────────────
  approvalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  approvalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  approvalBadgeText: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  approvalDetails: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    flex: 1,
  },

  // ── Brand Names ──────────────────────────────────────────────
  brandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  brandPill: {
    backgroundColor: SURFACE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  brandPillText: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT_SECONDARY,
  },

  // ── Evidence Grade ──────────────────────────────────────────
  evidenceRow: {
    marginBottom: 16,
  },
  evidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  evidenceBadgeText: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // ── Sections ────────────────────────────────────────────────
  section: {
    marginBottom: 14,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Playfair-Black',
    color: TEXT,
    letterSpacing: -0.3,
  },
  // Peptide nutrition section
  nutritionSummary: {
    fontSize: 14,
    lineHeight: 21,
    color: TEXT,
    marginBottom: 12,
    fontFamily: 'DMSans-Regular',
  },
  nutritionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  nutritionRowText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    fontFamily: 'DMSans-Regular',
  },
  nutritionBold: {
    color: TEXT,
    fontFamily: 'DMSans-Bold',
  },
  nutritionBlock: {
    marginTop: 10,
  },
  nutritionBlockLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  nutritionBlockText: {
    fontSize: 13,
    color: TEXT,
    fontFamily: 'DMSans-Regular',
    lineHeight: 18,
  },
  sectionText: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    lineHeight: 21,
  },

  // ── Pills ───────────────────────────────────────────────────
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetPill: {
    backgroundColor: `${PEACH}15`,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${PEACH}30`,
  },
  targetPillText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: PEACH,
  },
  pathwayPill: {
    backgroundColor: `${PEACH_SOFT}15`,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${PEACH_SOFT}30`,
  },
  pathwayPillText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: '#D88A8A',
  },

  // ── Molecular Data Grid ─────────────────────────────────────
  dataGrid: {
    gap: 0,
  },
  dataItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  dataLabel: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    color: TEXT_SECONDARY,
  },
  dataValue: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT,
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },

  // ── Chemical Structure ──────────────────────────────────────
  structureImage: {
    width: '100%' as any,
    height: 200,
    borderRadius: 12,
    backgroundColor: SURFACE,
  },

  // ── Sequence ────────────────────────────────────────────────
  sequenceContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: BG,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  sequenceText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: TEXT_SECONDARY,
    lineHeight: 18,
    marginTop: 4,
  },

  // ── Bullet Lists ────────────────────────────────────────────
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
  },
  bulletDot: {
    fontSize: 14,
    color: PEACH,
    lineHeight: 21,
  },
  bulletText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    lineHeight: 21,
    flex: 1,
  },

  // ── Safety Profile ──────────────────────────────────────────
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  warningText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    color: '#B91C1C',
    lineHeight: 19,
  },
  safetySubsection: {
    marginBottom: 14,
  },
  safetySubtitle: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
    letterSpacing: 0.3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },

  // ── Clinical Trials ─────────────────────────────────────────
  trialCard: {
    padding: 14,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
  },
  trialHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  trialName: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
    flex: 1,
    marginRight: 8,
  },
  trialPhaseBadge: {
    backgroundColor: `${PEACH}18`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trialPhaseText: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    color: PEACH,
    letterSpacing: 0.3,
  },
  trialStatus: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    marginBottom: 4,
  },
  trialDetail: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    marginBottom: 2,
  },
  trialFindings: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: TEXT,
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  trialLink: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: PEACH,
    marginTop: 6,
  },

  // ── Protocol Templates ──────────────────────────────────────
  protocolCard: {
    padding: 14,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
  },
  protocolName: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
    marginBottom: 6,
  },
  protocolDetails: {
    gap: 2,
  },
  protocolDetail: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
  },
  protocolTiming: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: PEACH,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // ── Related Stacks ──────────────────────────────────────────
  relatedStackCard: {
    padding: 14,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
  },
  relatedStackHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  relatedStackName: {
    fontSize: 14,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
  },
  relatedStackCount: {
    fontSize: 11,
    fontFamily: 'DMSans-Medium',
    color: TEXT_SECONDARY,
  },
  relatedStackDesc: {
    fontSize: 12,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },

  // ── Videos ──────────────────────────────────────────────────
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
  },
  videoTitle: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT,
  },
  videoDuration: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  // ── Guides ──────────────────────────────────────────────────
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: BG,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    marginBottom: 10,
  },
  guideTitle: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT,
  },
  guideSummary: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  // ── Add to Stack ────────────────────────────────────────────
  addToStackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PEACH,
    borderRadius: 999,
    paddingVertical: 16,
    marginVertical: 16,
    gap: 8,
    shadowColor: PEACH,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  addToStackButtonActive: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: `${PEACH}40`,
    shadowOpacity: 0,
  },
  addToStackButtonDisabled: {
    backgroundColor: `${PEACH}60`,
    shadowOpacity: 0,
  },
  addToStackText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
  addToStackTextActive: {
    color: PEACH,
  },

  // ── Quick Actions ──────────────────────────────────────────
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  quickActionText: {
    fontSize: 13,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT,
  },

  // ── PubMed Links ────────────────────────────────────────────
  pubmedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: DIVIDER,
  },
  pubmedLinkText: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
    color: PEACH,
    flex: 1,
  },

  // ── Research Context (uses section) ─────────────────────────
  usesSection: {
    marginBottom: 14,
    padding: 18,
    backgroundColor: `${PEACH}08`,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${PEACH}25`,
  },
  usesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  usesSectionTitle: {
    fontSize: 19,
    fontFamily: 'Playfair-Black',
    color: TEXT,
    letterSpacing: -0.4,
  },
  usesPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  usesPrimaryPill: {
    backgroundColor: PEACH,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: PEACH,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  usesPrimaryPillText: {
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.2,
  },
  usesSubtitle: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 4,
  },
  usesGoalsSection: {
    marginBottom: 16,
  },
  usesGoalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  usesGoalTag: {
    backgroundColor: BG,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: `${PEACH}30`,
  },
  usesGoalTagText: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT,
  },
  usesReportCard: {
    marginBottom: 14,
    backgroundColor: BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    padding: 14,
  },
  usesReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  usesReportTitle: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
  },
  usesReportText: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  usesReportDisclaimer: {
    fontSize: 10,
    fontFamily: 'DMSans-Regular',
    color: TEXT_MUTED,
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 14,
  },
  eduDisclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 18,
    borderRadius: 14,
    backgroundColor: `${PEACH}0F`,
    borderWidth: 1,
    borderColor: `${PEACH}30`,
  },
  eduDisclaimerIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: `${PEACH}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eduDisclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'DMSans-Bold',
    color: TEXT,
    lineHeight: 17,
  },
  eduDisclaimerSub: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    color: TEXT_SECONDARY,
  },
  usesPopularSection: {
    marginBottom: 16,
  },
  usesPopularRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  usesPopularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BG,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  usesPopularBadgeText: {
    fontSize: 11,
    fontFamily: 'DMSans-SemiBold',
    color: TEXT,
  },
  usesPairsSection: {
    marginBottom: 0,
  },
  usesPairsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  usesPairChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BG,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: `${PEACH}40`,
  },
  usesPairChipText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: PEACH,
  },
});
