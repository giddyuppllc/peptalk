import React, { useEffect } from 'react';
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
import { getCategoryColor } from '../../src/constants/categories';
import { Disclaimer } from '../../src/components/Disclaimer';
import { trackPeptideView } from '../../src/services/analyticsEvents';
import { getProtocolsByPeptide } from '../../src/data/protocols';
import { getTrialsByPeptideId } from '../../src/data/clinicalTrials';
import { getSafetyProfileByPeptideId } from '../../src/data/safetyProfiles';
import { getCuratedStacksByPeptideId } from '../../src/data/curatedStacks';
import { getVideosByPeptideId } from '../../src/data/videos';
import { getGuidesByPeptideId } from '../../src/data/howToGuides';
import { getInteractionsByPeptideId } from '../../src/data/interactions';

// ── Helper Functions ──────────────────────────────────────────────

function getApprovalColor(status: string): string {
  switch (status) {
    case 'fda_approved': return '#22c55e';
    case 'ema_approved': return '#F8A97A';
    case 'approved_other': return '#06b6d4';
    case 'phase_3': return '#FFBF82';
    case 'phase_2': return '#f97316';
    case 'phase_1': return '#ef4444';
    case 'preclinical': return '#D4A853';
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
    case 'moderate': return '#FFBF82';
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
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Data lookups ────────────────────────────────────────────────
  const safetyProfile = getSafetyProfileByPeptideId(peptide.id);
  const clinicalTrials = getTrialsByPeptideId(peptide.id);
  const protocols = getProtocolsByPeptide(peptide.id);
  const relatedStacks = getCuratedStacksByPeptideId(peptide.id);
  const relatedVideos = getVideosByPeptideId(peptide.id);
  const relatedGuides = getGuidesByPeptideId(peptide.id);

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

        {/* What People Use This For */}
        {peptide.uses && (
          <View style={styles.usesSection}>
            <View style={styles.usesSectionHeader}>
              <Ionicons name="people-outline" size={20} color="#e3a7a1" />
              <Text style={styles.usesSectionTitle}>What People Use This For</Text>
            </View>

            {/* Primary Uses - colored pill badges */}
            <View style={styles.usesPillsRow}>
              {peptide.uses.primaryUses.map((use, i) => (
                <View key={i} style={styles.usesPrimaryPill}>
                  <Text style={styles.usesPrimaryPillText}>{use}</Text>
                </View>
              ))}
            </View>

            {/* Common Goals */}
            {peptide.uses.commonGoals.length > 0 && (
              <View style={styles.usesGoalsSection}>
                <Text style={styles.usesSubtitle}>Common Goals</Text>
                <View style={styles.usesGoalsRow}>
                  {peptide.uses.commonGoals.map((goal, i) => (
                    <View key={i} style={styles.usesGoalTag}>
                      <Text style={styles.usesGoalTagText}>{goal}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* What People Report */}
            <GlassCard style={styles.usesReportCard}>
              <View style={styles.usesReportHeader}>
                <Ionicons name="chatbubbles-outline" size={16} color="#b9cbb6" />
                <Text style={styles.usesReportTitle}>What People Report</Text>
              </View>
              <Text style={styles.usesReportText}>{peptide.uses.whatPeopleReport}</Text>
            </GlassCard>

            {/* Popular With */}
            {peptide.uses.popularWith.length > 0 && (
              <View style={styles.usesPopularSection}>
                <Text style={styles.usesSubtitle}>Popular With</Text>
                <View style={styles.usesPopularRow}>
                  {peptide.uses.popularWith.map((group, i) => (
                    <View key={i} style={styles.usesPopularBadge}>
                      <Ionicons name="person-outline" size={12} color="#c7d7e6" />
                      <Text style={styles.usesPopularBadgeText}>{group}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Pairs Well With */}
            {peptide.uses.pairsWith.length > 0 && (
              <View style={styles.usesPairsSection}>
                <Text style={styles.usesSubtitle}>Pairs Well With</Text>
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
                        <Ionicons name="link-outline" size={14} color="#e3a7a1" />
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
            <Ionicons name="document-text-outline" size={18} color="#c7d7e6" />
            <Text style={styles.sectionTitle}>Research Summary</Text>
          </View>
          <Text style={styles.sectionText}>{peptide.researchSummary}</Text>
        </GlassCard>

        {/* Mechanism of Action */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="git-branch-outline" size={18} color="#b9cbb6" />
            <Text style={styles.sectionTitle}>Mechanism of Action</Text>
          </View>
          <Text style={styles.sectionText}>{peptide.mechanismOfAction}</Text>
        </GlassCard>

        {/* Receptor Targets */}
        {peptide.receptorTargets && peptide.receptorTargets.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="radio-outline" size={18} color="#e3a7a1" />
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
                color="#c7d7e6"
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
            <Ionicons name="shield-outline" size={18} color="#f0d68a" />
            <Text style={styles.sectionTitle}>Stability Notes</Text>
          </View>
          <Text style={styles.sectionText}>{peptide.stabilityNotes}</Text>
        </GlassCard>

        {/* Molecular Data */}
        <GlassCard style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="analytics-outline" size={18} color="#c7d7e6" />
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
              <Ionicons name="flask-outline" size={18} color="#c7d7e6" />
              <Text style={styles.sectionTitle}>Chemical Structure</Text>
            </View>
            <Image source={{ uri: peptide.structureImageUrl }} style={styles.structureImage} resizeMode="contain" />
          </GlassCard>
        )}

        {/* NEW: Additional Information */}
        {(peptide.bioavailability || peptide.routeOfAdministration?.length || peptide.naturalSources || peptide.yearDiscovered || peptide.aminoAcidSequence) && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="information-circle-outline" size={18} color="#c7d7e6" />
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
              <Ionicons name="warning-outline" size={18} color="#f0d68a" />
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
              <Ionicons name="swap-horizontal-outline" size={18} color="#e3a7a1" />
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

        {/* NEW: Safety Profile */}
        {safetyProfile && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="medkit-outline" size={18} color="#e3a7a1" />
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
                    <Text style={[styles.bulletDot, { color: '#FFBF82' }]}>•</Text>
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
              <Ionicons name="flask-outline" size={18} color="#b9cbb6" />
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
              <Ionicons name="clipboard-outline" size={18} color="#b9cbb6" />
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
              </View>
            ))}
          </GlassCard>
        )}

        {/* NEW: Related Stacks */}
        {relatedStacks.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="layers-outline" size={18} color="#c7d7e6" />
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
              <Ionicons name="videocam-outline" size={18} color="#c7d7e6" />
              <Text style={styles.sectionTitle}>Related Videos</Text>
            </View>
            {relatedVideos.map((video) => (
              <TouchableOpacity key={video.id} style={styles.videoCard} onPress={() => router.push(`/learn/videos/${video.slug}`)} activeOpacity={0.7}>
                <Ionicons name="play-circle-outline" size={32} color="#c7d7e6" />
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
              <Ionicons name="book-outline" size={18} color="#b9cbb6" />
              <Text style={styles.sectionTitle}>How-To Guides</Text>
            </View>
            {relatedGuides.map((guide) => (
              <TouchableOpacity key={guide.id} style={styles.guideCard} onPress={() => router.push(`/learn/guides/${guide.slug}`)} activeOpacity={0.7}>
                <Ionicons name="list-outline" size={20} color="#b9cbb6" />
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
            color={isInStack ? '#b9cbb6' : '#2D2D2D'}
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
            <Ionicons name="add-circle-outline" size={18} color="#F8A97A" />
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
            <Ionicons name="chatbubble-outline" size={18} color="#D4A853" />
            <Text style={styles.quickActionText}>Ask Aimee</Text>
          </TouchableOpacity>
        </View>

        {/* PubMed Links */}
        {peptide.pubmedLinks && peptide.pubmedLinks.length > 0 && (
          <GlassCard style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="link-outline" size={18} color="#c7d7e6" />
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
                  color="#c7d7e6"
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
              <Ionicons name="document-outline" size={18} color="#c7d7e6" />
              <Text style={styles.sectionTitle}>DOI Citations</Text>
            </View>
            {peptide.doiLinks.map((doi, index) => (
              <TouchableOpacity key={index} style={styles.pubmedLink} onPress={() => handlePubMedLink(doi.startsWith('http') ? doi : `https://doi.org/${doi}`)} activeOpacity={0.7}>
                <Ionicons name="open-outline" size={14} color="#c7d7e6" />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2D2D2D',
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
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2D2D',
    marginTop: 16,
  },
  notFoundSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
  },
  backButton: {
    backgroundColor: '#e3a7a1',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
    marginTop: 20,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // ── Title ───────────────────────────────────────────────────
  titleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  peptideName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#2D2D2D',
    letterSpacing: -0.5,
    flex: 1,
  },
  abbreviationBadge: {
    backgroundColor: 'rgba(227, 167, 161, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  abbreviationText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e3a7a1',
  },

  // ── Categories ──────────────────────────────────────────────
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  categoryPillText: {
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 12,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  approvalDetails: {
    fontSize: 12,
    color: '#6B7280',
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
    backgroundColor: 'rgba(199, 215, 230, 0.12)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(199, 215, 230, 0.2)',
  },
  brandPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#c7d7e6',
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
    paddingVertical: 5,
    borderRadius: 8,
  },
  evidenceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // ── Sections ────────────────────────────────────────────────
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  sectionText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },

  // ── Pills ───────────────────────────────────────────────────
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  targetPill: {
    backgroundColor: 'rgba(227, 167, 161, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  targetPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e3a7a1',
  },
  pathwayPill: {
    backgroundColor: 'rgba(199, 215, 230, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  pathwayPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#c7d7e6',
  },

  // ── Molecular Data Grid ─────────────────────────────────────
  dataGrid: {
    gap: 12,
  },
  dataItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  dataLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  dataValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D2D2D',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },

  // ── Chemical Structure ──────────────────────────────────────
  structureImage: {
    width: '100%' as any,
    height: 200,
    borderRadius: 8,
  },

  // ── Sequence ────────────────────────────────────────────────
  sequenceContainer: {
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
  },
  sequenceText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6B7280',
    lineHeight: 18,
    marginTop: 4,
  },

  // ── Bullet Lists ────────────────────────────────────────────
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  bulletDot: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
  },
  bulletText: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 20,
    flex: 1,
  },

  // ── Safety Profile ──────────────────────────────────────────
  warningBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  warningText: {
    fontSize: 13,
    color: '#ef4444',
    lineHeight: 20,
    fontWeight: '600',
  },
  safetySubsection: {
    marginBottom: 12,
  },
  safetySubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c7d7e6',
    marginBottom: 6,
  },

  // ── Clinical Trials ─────────────────────────────────────────
  trialCard: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 10,
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
    fontWeight: '700',
    color: '#2D2D2D',
    flex: 1,
    marginRight: 8,
  },
  trialPhaseBadge: {
    backgroundColor: 'rgba(185, 203, 182, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trialPhaseText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b9cbb6',
  },
  trialStatus: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  trialDetail: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },
  trialFindings: {
    fontSize: 12,
    color: '#b9cbb6',
    lineHeight: 18,
    marginTop: 6,
    fontStyle: 'italic',
  },
  trialLink: {
    fontSize: 12,
    color: '#c7d7e6',
    textDecorationLine: 'underline',
    marginTop: 6,
  },

  // ── Protocol Templates ──────────────────────────────────────
  protocolCard: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 10,
    marginBottom: 10,
  },
  protocolName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 6,
  },
  protocolDetails: {
    gap: 2,
  },
  protocolDetail: {
    fontSize: 12,
    color: '#6B7280',
  },
  protocolTiming: {
    fontSize: 12,
    color: '#b9cbb6',
    fontStyle: 'italic',
    marginTop: 2,
  },

  // ── Related Stacks ──────────────────────────────────────────
  relatedStackCard: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 10,
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
    fontWeight: '700',
    color: '#2D2D2D',
  },
  relatedStackCount: {
    fontSize: 11,
    color: '#6B7280',
  },
  relatedStackDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },

  // ── Videos ──────────────────────────────────────────────────
  videoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 10,
    marginBottom: 10,
  },
  videoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D2D',
  },
  videoDuration: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },

  // ── Guides ──────────────────────────────────────────────────
  guideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 10,
    marginBottom: 10,
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D2D',
  },
  guideSummary: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },

  // ── Add to Stack ────────────────────────────────────────────
  addToStackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e3a7a1',
    borderRadius: 14,
    paddingVertical: 16,
    marginVertical: 16,
    gap: 8,
  },
  addToStackButtonActive: {
    backgroundColor: 'rgba(185, 203, 182, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(185, 203, 182, 0.3)',
  },
  addToStackButtonDisabled: {
    backgroundColor: 'rgba(227, 167, 161, 0.3)',
  },
  addToStackText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  addToStackTextActive: {
    color: '#b9cbb6',
  },

  // ── Quick Actions ──────────────────────────────────────────
  quickActionRow: {
    flexDirection: 'row',
    gap: 12,
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
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
  },

  // ── PubMed Links ────────────────────────────────────────────
  pubmedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  pubmedLinkText: {
    fontSize: 12,
    color: '#c7d7e6',
    flex: 1,
    textDecorationLine: 'underline',
  },

  // ── What People Use This For ──────────────────────────────────
  usesSection: {
    marginBottom: 14,
    padding: 16,
    backgroundColor: 'rgba(227, 167, 161, 0.06)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.12)',
  },
  usesSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  usesSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2D2D2D',
    letterSpacing: -0.3,
  },
  usesPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  usesPrimaryPill: {
    backgroundColor: 'rgba(227, 167, 161, 0.18)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.25)',
  },
  usesPrimaryPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e3a7a1',
  },
  usesSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#c7d7e6',
    marginBottom: 8,
  },
  usesGoalsSection: {
    marginBottom: 14,
  },
  usesGoalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  usesGoalTag: {
    backgroundColor: 'rgba(185, 203, 182, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(185, 203, 182, 0.18)',
  },
  usesGoalTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b9cbb6',
  },
  usesReportCard: {
    marginBottom: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
  usesReportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  usesReportTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#b9cbb6',
  },
  usesReportText: {
    fontSize: 13,
    color: '#d1cdc7',
    lineHeight: 21,
  },
  usesPopularSection: {
    marginBottom: 14,
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
    backgroundColor: 'rgba(199, 215, 230, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(199, 215, 230, 0.15)',
  },
  usesPopularBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#c7d7e6',
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
    backgroundColor: 'rgba(227, 167, 161, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(227, 167, 161, 0.18)',
  },
  usesPairChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#e3a7a1',
  },
});
