/**
 * Consultation Booking — Schedule a 1-on-1 with Jamie Esposito ($500/session)
 * Available to Plus and Pro subscribers only.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassCard } from '../src/components/GlassCard';
import { AnimatedPress } from '../src/components/AnimatedPress';
import { Colors, FontSizes, Spacing, BorderRadius } from '../src/constants/theme';
import { useAuthStore } from '../src/store/useAuthStore';
import { useSubscriptionStore } from '../src/store/useSubscriptionStore';

const CONSULT_PRICE = '$500';
const CONSULT_DURATION = '60 minutes';

const TOPICS = [
  { id: 'peptide', label: 'Peptide Protocol Review', icon: 'flask-outline' },
  { id: 'nutrition', label: 'Nutrition & Meal Planning', icon: 'nutrition-outline' },
  { id: 'fitness', label: 'Workout Programming', icon: 'barbell-outline' },
  { id: 'bloodwork', label: 'Blood Work Analysis', icon: 'analytics-outline' },
  { id: 'weight', label: 'Weight Management', icon: 'scale-outline' },
  { id: 'general', label: 'General Health', icon: 'heart-outline' },
];

export default function ConsultScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const tier = useSubscriptionStore((s) => s.tier);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  if (tier === 'free') {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPress onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
          </AnimatedPress>
          <Text style={styles.headerTitle}>Book a Consult</Text>
        </View>
        <View style={styles.locked}>
          <Ionicons name="lock-closed" size={48} color={Colors.darkTextSecondary} />
          <Text style={styles.lockedTitle}>Subscriber Feature</Text>
          <Text style={styles.lockedText}>
            Consultation booking is available to PepTalk+ and Pro members.
          </Text>
          <AnimatedPress onPress={() => router.push('/subscription')}>
            <LinearGradient
              colors={['#E89672', '#E89672']}
              style={styles.upgradeBtn}
            >
              <Text style={styles.upgradeBtnText}>View Plans</Text>
            </LinearGradient>
          </AnimatedPress>
        </View>
      </SafeAreaView>
    );
  }

  const handleSubmit = () => {
    if (!selectedTopic) {
      Alert.alert('Select a Topic', 'Please choose what you want to discuss.');
      return;
    }
    // TODO: Send to Supabase / email / booking system
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.successWrap}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={64} color={Colors.success} />
          </View>
          <Text style={styles.successTitle}>Request Submitted</Text>
          <Text style={styles.successText}>
            Jamie will review your consultation request and reach out to schedule
            a time. You'll receive an email at {user?.email} with next steps.
          </Text>
          <AnimatedPress onPress={() => router.back()} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Done</Text>
          </AnimatedPress>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPress onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.darkText} />
        </AnimatedPress>
        <Text style={styles.headerTitle}>Book a Consult</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Jamie card */}
        <GlassCard variant="elevated" style={styles.jamieCard}>
          <View style={styles.jamieRow}>
            <View style={styles.jamieAvatar}>
              <Ionicons name="person" size={28} color={Colors.pepTeal} />
            </View>
            <View style={styles.jamieInfo}>
              <Text style={styles.jamieName}>Jamie Esposito</Text>
              <Text style={styles.jamieRole}>Certified Nutritionist & Trainer</Text>
            </View>
          </View>
          <View style={styles.consultMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={Colors.darkTextSecondary} />
              <Text style={styles.metaText}>{CONSULT_DURATION}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="videocam-outline" size={16} color={Colors.darkTextSecondary} />
              <Text style={styles.metaText}>Video call</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="card-outline" size={16} color={Colors.darkTextSecondary} />
              <Text style={styles.metaText}>{CONSULT_PRICE}</Text>
            </View>
          </View>
        </GlassCard>

        {/* Topic selection */}
        <Text style={styles.sectionTitle}>What do you want to discuss?</Text>
        <View style={styles.topicGrid}>
          {TOPICS.map((topic) => {
            const active = selectedTopic === topic.id;
            return (
              <AnimatedPress
                key={topic.id}
                onPress={() => setSelectedTopic(topic.id)}
                style={[styles.topicCard, active && styles.topicCardActive]}
              >
                <Ionicons
                  name={topic.icon as any}
                  size={24}
                  color={active ? Colors.pepTeal : Colors.darkTextSecondary}
                />
                <Text style={[styles.topicLabel, active && styles.topicLabelActive]}>
                  {topic.label}
                </Text>
              </AnimatedPress>
            );
          })}
        </View>

        {/* Notes */}
        <Text style={styles.sectionTitle}>Additional notes (optional)</Text>
        <GlassCard style={styles.notesCard}>
          <TextInput
            style={styles.notesInput}
            placeholder="Describe your goals, current protocols, or specific questions..."
            placeholderTextColor={Colors.darkTextSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </GlassCard>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Consultations are conducted via video call. After submitting, Jamie will
          contact you within 48 hours to schedule. Payment is processed at the time
          of booking confirmation.
        </Text>

        {/* Submit */}
        <AnimatedPress onPress={handleSubmit}>
          <LinearGradient
            colors={['#F4E9A7', '#ef4444']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.submitBtn}
          >
            <Text style={styles.submitBtnText}>Request Consultation — {CONSULT_PRICE}</Text>
          </LinearGradient>
        </AnimatedPress>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.darkBg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 32, fontWeight: '900', letterSpacing: -0.5, color: '#2D2D2D' },
  scroll: { paddingHorizontal: Spacing.lg },

  // Jamie
  jamieCard: { marginBottom: Spacing.lg },
  jamieRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  jamieAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(6,182,212,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md,
  },
  jamieInfo: { flex: 1 },
  jamieName: { fontSize: FontSizes.lg, fontWeight: '700', color: Colors.darkText },
  jamieRole: { fontSize: FontSizes.sm, color: Colors.darkTextSecondary, marginTop: 2 },
  consultMeta: { flexDirection: 'row', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary },

  // Topics
  sectionTitle: {
    fontSize: FontSizes.sm, fontWeight: '600', color: Colors.darkTextSecondary,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: Spacing.sm,
  },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  topicCard: {
    width: '48%', flexGrow: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: BorderRadius.md, borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    padding: Spacing.md, alignItems: 'center', gap: Spacing.xs,
  },
  topicCardActive: {
    borderColor: Colors.pepTeal, backgroundColor: 'rgba(6,182,212,0.1)',
  },
  topicLabel: { fontSize: FontSizes.xs, color: Colors.darkTextSecondary, textAlign: 'center', fontWeight: '500' },
  topicLabelActive: { color: Colors.pepTeal },

  // Notes
  notesCard: { marginBottom: Spacing.md },
  notesInput: { fontSize: FontSizes.md, color: Colors.darkText, minHeight: 80 },

  // Disclaimer
  disclaimer: {
    fontSize: FontSizes.xs, color: 'rgba(0,0,0,0.20)',
    lineHeight: 16, textAlign: 'center', marginBottom: Spacing.lg,
  },

  // Submit
  submitBtn: {
    height: 52, borderRadius: BorderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },

  // Locked
  locked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  lockedTitle: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.darkText },
  lockedText: { fontSize: FontSizes.md, color: Colors.darkTextSecondary, textAlign: 'center' },
  upgradeBtn: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.sm },
  upgradeBtnText: { color: '#fff', fontSize: FontSizes.md, fontWeight: '700' },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.md },
  successIcon: { marginBottom: Spacing.sm },
  successTitle: { fontSize: FontSizes.xxl, fontWeight: '800', color: Colors.darkText },
  successText: { fontSize: FontSizes.md, color: Colors.darkTextSecondary, textAlign: 'center', lineHeight: 22 },
  doneBtn: { backgroundColor: 'rgba(0,0,0,0.08)', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, marginTop: Spacing.md },
  doneBtnText: { color: Colors.darkText, fontSize: FontSizes.md, fontWeight: '600' },
});
