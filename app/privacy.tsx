import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontSizes, Spacing, BorderRadius } from '../src/constants/theme';

// ── Section Data ──────────────────────────────────────────────────

interface PolicySection {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  paragraphs: string[];
}

const POLICY_SECTIONS: PolicySection[] = [
  {
    title: 'Educational Purpose & Disclaimer',
    icon: 'school-outline',
    paragraphs: [
      'PepTalk is an educational and informational tool only. It is not a medical device, does not provide medical advice, and is not intended to diagnose, treat, cure, or prevent any disease or health condition.',
      'The information presented in this app — including peptide data, dosing references, protocol templates, safety profiles, and chatbot responses — is compiled from publicly available research sources and is provided strictly for educational purposes.',
      'PepTalk does not sell, distribute, supply, or facilitate the purchase of any peptides, supplements, pharmaceuticals, or controlled substances. Any dosing information shown reflects published research protocols and is not a prescription or recommendation.',
      'You acknowledge that any actions you take based on information in PepTalk are your own responsibility. Always consult a licensed healthcare provider before making any health-related decisions.',
    ],
  },
  {
    title: 'Information We Collect',
    icon: 'folder-open-outline',
    paragraphs: [
      'PepTalk stores all user data locally on your device using encrypted storage (expo-secure-store). We collect only the information you voluntarily provide within the app, including:',
      '\u2022  Profile information (name, age, gender, health goals)\n\u2022  Peptide stacks and protocol configurations\n\u2022  Dose logs and check-in entries\n\u2022  Chat history with the PepTalk bot\n\u2022  Journal entries and notes',
      'This data never leaves your device unless you explicitly opt into cloud-based AI features. We do not collect data in the background, and we do not access your contacts, photos, microphone, or location.',
    ],
  },
  {
    title: 'How We Use Your Data',
    icon: 'settings-outline',
    paragraphs: [
      'Your data is used exclusively to power the features within this app:',
      '\u2022  Personalizing your dashboard and recommendations\n\u2022  Providing context to the PepTalk bot for relevant responses\n\u2022  Tracking your dose schedule and protocol progress\n\u2022  Generating safety alerts for peptide interactions\n\u2022  Powering check-in analytics and trend visualizations',
      'We do not use your health data for any purpose other than delivering the PepTalk experience to you. Your data is yours.',
    ],
  },
  {
    title: 'Health Data Protection',
    icon: 'shield-checkmark-outline',
    paragraphs: [
      'We take the protection of your health-related information extremely seriously.',
      'All health data\u2014including dose logs, check-in responses, body composition data, and protocol details\u2014is encrypted using expo-secure-store and stored exclusively on your device. This data is never transmitted to our servers or any third party without your explicit, informed consent.',
      'PepTalk does not qualify as a covered entity under HIPAA, but we voluntarily adhere to HIPAA-inspired principles: minimum necessary access, encryption at rest, and user control over all data.',
    ],
  },
  {
    title: 'AI & Cloud Services',
    icon: 'cloud-outline',
    paragraphs: [
      'PepTalk includes an optional integration with Grok AI to provide enhanced conversational responses. This feature is entirely opt-in.',
      'If you enable cloud AI:\n\u2022  Only de-identified, contextual data is sent (never your name, email, or identifiable details)\n\u2022  Conversation data sent to the AI is not stored by PepTalk on any server\n\u2022  You can revoke cloud AI consent at any time from your Profile settings\n\u2022  The local PepTalk bot remains fully functional without cloud AI',
      'You will always be clearly informed before any data leaves your device, and you must grant explicit consent each time.',
    ],
  },
  {
    title: 'Advertising',
    icon: 'megaphone-outline',
    paragraphs: [
      'PepTalk may display advertisements in the future through Google AdMob or similar platforms. If and when ads are introduced:',
      '\u2022  No Protected Health Information (PHI) will ever be shared with ad networks\n\u2022  Health-sensitive ad categories will be blocked at the network level\n\u2022  Ads will be contextual or based on anonymous, non-health demographics\n\u2022  You will never see ads based on your peptide usage, dose logs, or health conditions',
      'We believe you should never have to worry that your health data is being used to target you with advertising.',
    ],
  },
  {
    title: 'Data Sharing',
    icon: 'lock-closed-outline',
    paragraphs: [
      'We will never sell, share, rent, or monetize your personal data. Period.',
      'Your data is not shared with:\n\u2022  Advertisers or ad networks (beyond anonymous, non-health signals)\n\u2022  Data brokers or analytics companies\n\u2022  Insurance companies, employers, or government agencies\n\u2022  Any third party for marketing purposes',
      'The only scenario in which data leaves your device is if you explicitly opt into cloud AI features, and even then, only de-identified contextual data is transmitted.',
    ],
  },
  {
    title: 'Your Rights',
    icon: 'person-outline',
    paragraphs: [
      'You have full control over your data at all times. Within PepTalk, you can:',
      '\u2022  View your data \u2014 All stored data is accessible within the app\n\u2022  Export your data \u2014 Request a full export of your information\n\u2022  Delete all data \u2014 Use the "Delete My Data" button in Profile to permanently erase everything\n\u2022  Revoke consent \u2014 Disable cloud AI or any optional data features at any time',
      'Data deletion is immediate and irreversible. Once deleted, we have no way to recover your information because it was never stored on our servers.',
    ],
  },
  {
    title: 'Data Retention',
    icon: 'time-outline',
    paragraphs: [
      'Since all data is stored locally on your device, your data persists only as long as you choose to keep it.',
      'There are no server-side retention schedules or backup policies to worry about. When you delete data through the app or uninstall PepTalk, your data is gone.',
      'If you use cloud AI features, conversational data sent during a session is processed in real time and is not retained by PepTalk after the session ends.',
    ],
  },
  {
    title: "Children's Privacy",
    icon: 'warning-outline',
    paragraphs: [
      'PepTalk is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from minors.',
      'Peptide research and supplementation topics within this app are intended for adult audiences. If you believe a minor has provided data through PepTalk, please contact us and we will assist in removing that information.',
    ],
  },
  {
    title: 'Community / User-Generated Content',
    icon: 'people-outline',
    paragraphs: [
      'PepTalk’s Community feature lets members post, comment, and react. By using Community, you agree:',
      '•  No objectionable content. Posts and comments containing harassment, hate speech, sexually explicit material, illegal activity, or content that could endanger others’ safety are not allowed and will be removed.',
      '•  No specific dose recommendations to other users. Talk about your own protocol — prescribing or directing dosing for someone else is not permitted and may be removed under the "unsafe medical advice" reason.',
      '•  You may flag any post or comment via the Report action. Reports are reviewed within 24 hours; content may be removed automatically when 3 or more distinct members report the same target.',
      '•  You may block any user, hiding their content globally from your feed. Blocked-user management is available in Settings → Blocked users.',
      '•  PepTalk reserves the right to remove content, suspend accounts, or limit Community access at our discretion when guidelines are violated.',
      '•  Anonymous posting hides your handle from other members but does NOT hide your identity from PepTalk admins for moderation purposes.',
      '•  Images you upload to Community posts, comments, or live chat are stored on Cloudflare R2 (US region) and automatically screened by a third-party AI vision moderation service (xAI Grok Vision) before they become visible to other members. The screening sends only the image bytes — no profile information — and PepTalk does not retain the vision provider’s analysis beyond a moderation-log row used to defend against abuse.',
      'For abuse reports outside the in-app flow, contact edward@giddyupp.com.',
    ],
  },
  {
    title: 'Changes to This Policy',
    icon: 'document-text-outline',
    paragraphs: [
      'We may update this Privacy Policy from time to time to reflect changes in our practices, features, or legal requirements.',
      'When we make material changes, you will be notified through an in-app notification before the changes take effect. We encourage you to review this policy periodically.',
      'Your continued use of PepTalk after changes are posted constitutes acceptance of the updated policy.',
    ],
  },
  {
    title: 'Contact Us',
    icon: 'mail-outline',
    paragraphs: [
      'If you have questions, concerns, or requests regarding this Privacy Policy or your data, please reach out to us:',
      'Email: privacy@peptalkapp.com',
      'We aim to respond to all privacy-related inquiries within 48 hours.',
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={Colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro */}
        <View style={styles.introCard}>
          <Ionicons name="shield-checkmark" size={32} color={Colors.rose} />
          <Text style={styles.introTitle}>Your Privacy Matters</Text>
          <Text style={styles.introText}>
            PepTalk is built with a privacy-first approach. Your health data
            stays on your device, encrypted and under your control. We never
            sell your data, and we never will.
          </Text>
        </View>

        {/* Sections */}
        {POLICY_SECTIONS.map((section, index) => (
          <View key={index} style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionIconWrap}>
                <Ionicons
                  name={section.icon}
                  size={18}
                  color={Colors.rose}
                />
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.sectionBody}>
              {section.paragraphs.map((paragraph, pIndex) => (
                <Text key={pIndex} style={styles.sectionText}>
                  {paragraph}
                </Text>
              ))}
            </View>
          </View>
        ))}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.divider} />
          <Text style={styles.lastUpdated}>Last Updated: February 23, 2026</Text>
          <Text style={styles.footerNote}>
            PepTalk is a peptide research and education tool. It is not a
            medical device and does not provide medical advice, diagnosis, or
            treatment.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxl,
  },

  // ── Header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.darkCardBorder,
  },
  headerBack: {
    padding: Spacing.xs,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.darkText,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 30, // balances the back button for centered title
  },

  // ── Intro Card ────────────────────────────────────────────────
  introCard: {
    backgroundColor: Colors.darkCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `rgba(227, 167, 161, 0.15)`,
    padding: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
    alignItems: 'center',
  },
  introTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.darkText,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    letterSpacing: -0.3,
  },
  introText: {
    fontSize: FontSizes.md,
    color: Colors.darkTextSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },

  // ── Section ───────────────────────────────────────────────────
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + 2,
    marginBottom: Spacing.sm + 4,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.sm + 2,
    backgroundColor: 'rgba(227, 167, 161, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
    color: Colors.rose,
    flex: 1,
  },
  sectionBody: {
    backgroundColor: Colors.darkCard,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.darkCardBorder,
    padding: Spacing.md,
  },
  sectionText: {
    fontSize: FontSizes.sm + 1,
    color: Colors.darkTextSecondary,
    lineHeight: 21,
    marginBottom: Spacing.sm + 4,
  },

  // ── Footer ────────────────────────────────────────────────────
  footer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: Colors.darkCardBorder,
    marginBottom: Spacing.md,
  },
  lastUpdated: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.rose,
    marginBottom: Spacing.sm,
  },
  footerNote: {
    fontSize: FontSizes.xs + 1,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: Spacing.lg,
  },
});
