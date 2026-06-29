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
      'PepTalk stores your data in your private account on our secure cloud backend (Supabase), encrypted in transit and at rest, with a locally cached copy on your device. We collect only the information you voluntarily provide within the app, including:',
      '\u2022  Profile information (name, age, gender, health goals)\n\u2022  Peptide stacks and protocol configurations\n\u2022  Dose logs and check-in entries\n\u2022  Chat history with the PepTalk bot\n\u2022  Journal entries and notes',
      'We do not collect data in the background, and we never access your contacts or location. PepTalk accesses your camera, photo library, and microphone only when you actively use a feature that needs them — scanning a meal or lab, adding a photo, or sending a voice message to Aimee — and only with your permission. Most data stays on your device; features you choose to use (voice transcription, photo-based food and lab scanning, AI chat, and the community) send the content you share to our secure servers so they can work.',
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
      'All health data\u2014including dose logs, check-in responses, body composition data, and protocol details\u2014is encrypted in transit (TLS) and at rest, and stored in your private account on our secure backend so it syncs across your devices. We never sell this data or share it for advertising. Health data is sent to a third-party AI provider only when you actively use an AI feature (see \u201cAI & Cloud Services\u201d below), and only after you have granted consent.',
      'Health platform integrations: if you choose to connect Apple Health (iOS) or Health Connect (Android), PepTalk reads only the data types you approve in the system permission dialog (such as steps, heart rate, sleep, weight, and body composition) to show trends alongside your protocols and check-ins. This data is read on-device with your explicit grant, is never sold or used for advertising, and you can revoke access at any time in Apple Health / Health Connect or your device settings. PepTalk does not write data back to Health Connect on Android.',
      'PepTalk does not qualify as a covered entity under HIPAA, but we voluntarily adhere to HIPAA-inspired principles: minimum necessary access, encryption at rest, and user control over all data.',
    ],
  },
  {
    title: 'AI & Cloud Services',
    icon: 'cloud-outline',
    paragraphs: [
      'PepTalk\u2019s AI features (the Aimee assistant, voice logging, photo-based food and lab scanning, meal/recipe/workout generation, and lab interpretation) are powered by third-party AI providers. These features are opt-in: the first time you use one, we ask for your consent before any data is sent.',
      'The third-party AI providers we use are:\n\u2022  xAI (Grok) \u2014 processes your chat messages, the health/profile context you choose to share, and images you scan (meals, labs, pantry) to generate responses\n\u2022  OpenAI (Whisper) \u2014 transcribes the voice audio you record for voice logging',
      'What you should know about AI features:\n\u2022  The content you submit (chat text, voice audio, and photos) is sent to the provider to produce a result; photos and audio are sent as-is, not anonymized\n\u2022  We send personal health/profile context only when it is needed to personalize a response, and only with your consent\n\u2022  Providers process this data to return a result and under their terms do not use PepTalk submissions to train their models\n\u2022  Consent is requested once and can be revoked at any time in Profile settings; if you decline or revoke, AI features are disabled but the rest of the app keeps working',
    ],
  },
  {
    title: 'Advertising',
    icon: 'megaphone-outline',
    paragraphs: [
      'PepTalk does not display advertisements. We have no advertising SDKs in the app and we do not partner with ad networks.',
      'Your health data is never used for ad targeting. Period.',
    ],
  },
  {
    title: 'Data Sharing',
    icon: 'lock-closed-outline',
    paragraphs: [
      'We will never sell, share, rent, or monetize your personal data. Period.',
      'Your data is not shared with:\n\u2022  Advertisers or ad networks (beyond anonymous, non-health signals)\n\u2022  Data brokers or analytics companies\n\u2022  Insurance companies, employers, or government agencies\n\u2022  Any third party for marketing purposes',
      'Your data leaves your device in two ways, both in service of features you use: (1) it syncs to your private account on our secure backend (Supabase) so the app works across your devices, and (2) when you use an opt-in AI feature, the relevant content is sent to our AI providers (xAI and OpenAI) to generate a result. In neither case is your data sold, rented, or shared for marketing.',
    ],
  },
  {
    title: 'Your Rights',
    icon: 'person-outline',
    paragraphs: [
      'You have full control over your data at all times. Within PepTalk, you can:',
      '\u2022  View your data \u2014 All stored data is accessible within the app\n\u2022  Export your data \u2014 Request a full export of your information\n\u2022  Delete all data \u2014 Use the "Delete My Data" button in Profile to permanently erase everything\n\u2022  Revoke consent \u2014 Disable cloud AI or any optional data features at any time',
      'Data deletion is immediate and irreversible. Deleting your account removes all of your user-keyed records from our backend along with your authentication record; once deleted, we have no way to recover your information.',
    ],
  },
  {
    title: 'Data Retention',
    icon: 'time-outline',
    paragraphs: [
      'Your data is retained in your private account for as long as you keep the account. When you delete your account (Profile → Delete Account), all of your user-keyed records are deleted from our backend and your authentication record is removed — this is immediate and irreversible.',
      'Uninstalling the app removes the local cached copy from your device; deleting your account removes the synced copy from our backend.',
      'Content sent to our AI providers during a request is processed to return a result and is not retained by PepTalk on our servers after the request completes (a minimal moderation/audit log is kept for Community images to defend against abuse, as described below).',
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
      '•  Images you upload to Community posts, comments, or live chat are stored on Cloudflare R2 (US region) and automatically screened by a third-party AI vision moderation service (OpenAI) before they become visible to other members. The screening sends only the image bytes — no profile information — and PepTalk does not retain the vision provider’s analysis beyond a moderation-log row used to defend against abuse.',
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
      'Email: privacy@peptalk.bio',
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
            PepTalk is built with a privacy-first approach. Your data is
            encrypted in transit and at rest, synced to your private account on
            our secure backend, and never sold or used for advertising. AI
            features that rely on third-party providers are opt-in, and you
            stay in control.
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
