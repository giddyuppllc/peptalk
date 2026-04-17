import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../src/components/GlassCard';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { useNutritionRequestStore } from '../../src/store/useNutritionRequestStore';
import { getGoalLabel } from '../../src/constants/goals';
import { GoalType } from '../../src/types';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NutritionistScreen() {
  const router = useRouter();

  // Stores
  const onboardingProfile = useOnboardingStore((s) => s.profile);
  const healthProfile = useHealthProfileStore((s) => s.profile);
  const { requests, addRequest } = useNutritionRequestStore();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');

  // Latest submitted request
  const latestRequest = useMemo(() => {
    const submitted = requests.filter((r) => r.status === 'submitted' || r.status === 'reviewed');
    return submitted.length > 0 ? submitted[0] : null;
  }, [requests]);

  // Auto-populated data
  const healthGoals = useMemo(
    () => onboardingProfile.healthGoals.map((g: GoalType) => getGoalLabel(g)),
    [onboardingProfile.healthGoals]
  );

  const currentPeptides = useMemo(
    () => healthProfile.currentPeptides ?? [],
    [healthProfile.currentPeptides]
  );

  const medicalConditions = useMemo(
    () => healthProfile.medical?.conditions ?? [],
    [healthProfile.medical?.conditions]
  );

  const dietaryRestrictions = useMemo(() => {
    const restrictions: string[] = [];
    if (healthProfile.nutrition?.dietType && healthProfile.nutrition.dietType !== 'no_restriction') {
      restrictions.push(healthProfile.nutrition.dietType.replace(/_/g, ' '));
    }
    if (healthProfile.nutrition?.foodAllergies?.length) {
      restrictions.push(...healthProfile.nutrition.foodAllergies);
    }
    return restrictions;
  }, [healthProfile.nutrition]);

  // Build health summary
  const healthSummary = useMemo(() => {
    const parts: string[] = [];
    if (onboardingProfile.gender) parts.push(`Gender: ${onboardingProfile.gender}`);
    if (onboardingProfile.ageRange) parts.push(`Age: ${onboardingProfile.ageRange}`);
    if (healthProfile.bodyMetrics?.weightLbs)
      parts.push(`Weight: ${healthProfile.bodyMetrics.weightLbs} lbs`);
    if (healthProfile.bodyMetrics?.heightInches)
      parts.push(`Height: ${healthProfile.bodyMetrics.heightInches} in`);
    if (medicalConditions.length > 0)
      parts.push(`Conditions: ${medicalConditions.join(', ')}`);
    if (healthProfile.medical?.medications?.length)
      parts.push(`Medications: ${healthProfile.medical.medications.join(', ')}`);
    return parts.join(' | ');
  }, [onboardingProfile, healthProfile, medicalConditions]);

  // Validate & submit
  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Required', 'Please enter a valid email address.');
      return;
    }

    addRequest({
      date: new Date().toISOString().split('T')[0],
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      healthSummary,
      goals: healthGoals,
      dietaryRestrictions,
      currentPeptides,
      message: message.trim(),
    });

    Alert.alert(
      'Request Submitted',
      "We'll review your request and get back to you within 48 hours.",
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  // ------- Status badge color -------
  const statusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return '#F4E9A7';
      case 'reviewed':
        return '#22c55e';
      default:
        return '#6B7280';
    }
  };

  // ------- If there's an existing submitted request, show status -------
  if (latestRequest) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#2D2D2D" />
          </Pressable>
          <Text style={styles.headerTitle}>Nutritionist Consultation</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <GlassCard style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <Ionicons name="checkmark-circle" size={28} color="#22c55e" />
              <Text style={styles.statusTitle}>Request on File</Text>
            </View>
            <Text style={styles.statusSubtext}>
              Your consultation request has been received. We will reach out to
              you at the email provided.
            </Text>

            <View style={styles.divider} />

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColor(latestRequest.status) + '22' },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    { color: statusColor(latestRequest.status) },
                  ]}
                >
                  {latestRequest.status.charAt(0).toUpperCase() +
                    latestRequest.status.slice(1)}
                </Text>
              </View>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Submitted</Text>
              <Text style={styles.statusValue}>
                {new Date(latestRequest.createdAt).toLocaleDateString()}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Name</Text>
              <Text style={styles.statusValue}>{latestRequest.name}</Text>
            </View>

            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Email</Text>
              <Text style={styles.statusValue}>{latestRequest.email}</Text>
            </View>

            {latestRequest.goals.length > 0 && (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Goals</Text>
                <Text style={styles.statusValue}>
                  {latestRequest.goals.join(', ')}
                </Text>
              </View>
            )}

            {latestRequest.message ? (
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Message</Text>
                <Text style={styles.statusValue}>{latestRequest.message}</Text>
              </View>
            ) : null}
          </GlassCard>

          <GlassCard style={styles.infoCard}>
            <Ionicons name="time-outline" size={20} color="#e3a7a1" />
            <Text style={styles.infoText}>
              Typical response time is 24-48 hours. You will be contacted via
              email with your personalized nutrition plan.
            </Text>
          </GlassCard>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ------- Form view -------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#2D2D2D" />
        </Pressable>
        <Text style={styles.headerTitle}>Nutritionist Consultation</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info card */}
          <GlassCard variant="accent" style={styles.infoCard}>
            <Ionicons name="nutrition-outline" size={22} color="#e3a7a1" />
            <Text style={styles.infoText}>
              Request a personalized nutrition plan from our certified
              nutritionist. Your health profile and goals will be included to
              create a tailored plan.
            </Text>
          </GlassCard>

          {/* Form */}
          <GlassCard style={styles.formCard}>
            <Text style={styles.sectionTitle}>Your Information</Text>

            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Full name"
              placeholderTextColor="#6b7280"
              autoCapitalize="words"
              returnKeyType="next"
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#6b7280"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.label}>Phone (optional)</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              placeholderTextColor="#6b7280"
              keyboardType="phone-pad"
              returnKeyType="next"
            />

            <Text style={styles.label}>Message / Special Requests</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={message}
              onChangeText={setMessage}
              placeholder="Any specific dietary needs, preferences, or questions..."
              placeholderTextColor="#6b7280"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              returnKeyType="default"
            />
          </GlassCard>

          {/* Auto-populated summary */}
          <GlassCard style={styles.formCard}>
            <Text style={styles.sectionTitle}>Your Health Summary</Text>
            <Text style={styles.sectionSubtitle}>
              This data will be included with your request
            </Text>

            {/* Health Goals */}
            <View style={styles.summaryBlock}>
              <View style={styles.summaryLabelRow}>
                <Ionicons name="flag-outline" size={16} color="#e3a7a1" />
                <Text style={styles.summaryLabel}>Health Goals</Text>
              </View>
              {healthGoals.length > 0 ? (
                <View style={styles.chipRow}>
                  {healthGoals.map((goal) => (
                    <View key={goal} style={styles.chip}>
                      <Text style={styles.chipText}>{goal}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyHint}>
                  No goals set. Update your profile to include them.
                </Text>
              )}
            </View>

            {/* Current Peptides */}
            <View style={styles.summaryBlock}>
              <View style={styles.summaryLabelRow}>
                <Ionicons name="flask-outline" size={16} color="#e3a7a1" />
                <Text style={styles.summaryLabel}>Current Peptides</Text>
              </View>
              {currentPeptides.length > 0 ? (
                <View style={styles.chipRow}>
                  {currentPeptides.map((pid) => (
                    <View key={pid} style={styles.chip}>
                      <Text style={styles.chipText}>{pid}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyHint}>None listed</Text>
              )}
            </View>

            {/* Medical Conditions */}
            <View style={styles.summaryBlock}>
              <View style={styles.summaryLabelRow}>
                <Ionicons name="medkit-outline" size={16} color="#e3a7a1" />
                <Text style={styles.summaryLabel}>Medical Conditions</Text>
              </View>
              {medicalConditions.length > 0 ? (
                <View style={styles.chipRow}>
                  {medicalConditions.map((c) => (
                    <View key={c} style={styles.chip}>
                      <Text style={styles.chipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyHint}>None listed</Text>
              )}
            </View>

            {/* Dietary Restrictions */}
            <View style={styles.summaryBlock}>
              <View style={styles.summaryLabelRow}>
                <Ionicons name="leaf-outline" size={16} color="#e3a7a1" />
                <Text style={styles.summaryLabel}>Dietary Restrictions</Text>
              </View>
              {dietaryRestrictions.length > 0 ? (
                <View style={styles.chipRow}>
                  {dietaryRestrictions.map((r) => (
                    <View key={r} style={styles.chip}>
                      <Text style={styles.chipText}>{r}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyHint}>None listed</Text>
              )}
            </View>
          </GlassCard>

          {/* Submit */}
          <Pressable style={styles.submitBtn} onPress={handleSubmit}>
            <Ionicons name="send" size={18} color="#2D2D2D" />
            <Text style={styles.submitBtnText}>Submit Request</Text>
          </Pressable>

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#EDE6D6',
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

  // Info card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },

  // Form card
  formCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#2D2D2D',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2D2D2D',
  },
  multilineInput: {
    minHeight: 100,
    paddingTop: 12,
  },

  // Summary
  summaryBlock: {
    marginTop: 14,
  },
  summaryLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D2D',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
  emptyHint: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },

  // Submit button
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#e3a7a1',
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D2D2D',
  },

  // Status view
  statusCard: {
    marginBottom: 16,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  statusSubtext: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    width: 90,
  },
  statusValue: {
    flex: 1,
    fontSize: 14,
    color: '#2D2D2D',
    textAlign: 'right',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
