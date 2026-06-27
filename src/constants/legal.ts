/**
 * Legal disclaimers and compliance verbiage for PepTalk.
 *
 * These constants are used throughout the app to ensure consistent,
 * legally protective language. Every user-facing surface that involves
 * health data, peptide information, dosing, or protocols should
 * reference these strings.
 *
 * IMPORTANT: Do not modify without legal review.
 */

// ---------------------------------------------------------------------------
// Core Disclaimers
// ---------------------------------------------------------------------------

/** Shown at app entry, onboarding, and in the About section */
export const MASTER_DISCLAIMER =
  'PepTalk is an educational and informational tool only. It is not a medical device, ' +
  'does not provide medical advice, and is not intended to diagnose, treat, cure, or ' +
  'prevent any disease or health condition. The information presented in this app is ' +
  'compiled from publicly available research sources and is provided for educational ' +
  'purposes only. Always consult a licensed healthcare provider before making any ' +
  'health-related decisions.';

/** Shorter version for inline use (cards, footers) */
export const SHORT_DISCLAIMER =
  'For educational purposes only. Not medical advice. ' +
  'Consult your healthcare provider before making health decisions.';

/** Ultra-short version for UI elements with limited space */
export const MINI_DISCLAIMER = 'Educational only — not medical advice.';

// ---------------------------------------------------------------------------
// Feature-Specific Disclaimers
// ---------------------------------------------------------------------------

/** Shown on peptide detail pages, especially near dosing info */
export const PEPTIDE_INFO_DISCLAIMER =
  'Peptide information is sourced from published research literature and publicly ' +
  'available clinical data. Dosing ranges shown reflect research protocols documented ' +
  'in peer-reviewed studies and are not prescriptions or recommendations. Individual ' +
  'responses vary. Never self-administer any substance without the supervision of a ' +
  'qualified healthcare provider.';

/** Shown on protocol/dosing screens and wellness journal */
export const DOSING_DISCLAIMER =
  'The dosing information displayed is derived from published research protocols and ' +
  'is provided strictly for educational reference. PepTalk does not recommend, endorse, ' +
  'or prescribe any specific substance or regimen. The wellness journal is a personal ' +
  'record-keeping tool — entries you make reflect your own decisions. Consult your ' +
  'physician or licensed healthcare provider for all health decisions.';

/** Shown in the wellness journal before first entry */
export const DOSE_LOG_GATE_DISCLAIMER =
  'Before using the Wellness Journal, please understand:\n\n' +
  '• This is a personal journal for your own private records\n' +
  '• PepTalk does not prescribe, recommend, or endorse any substance\n' +
  '• What you record is entirely your own choice and responsibility\n' +
  '• Always follow your healthcare provider\'s guidance\n' +
  '• PepTalk is not liable for any health outcomes\n\n' +
  'By continuing, you acknowledge this is a self-directed personal journal ' +
  'and that you accept full responsibility for your health decisions.';

/** Shown in the stack builder */
export const STACK_DISCLAIMER =
  'Stack combinations shown are based on published research and community-reported ' +
  'protocols. PepTalk does not endorse, recommend, or guarantee the safety or efficacy ' +
  'of any peptide combination. Combining substances carries inherent risks. ' +
  'Always consult a qualified healthcare provider before combining any compounds.';

/** Shown in the PepTalk bot chat */
export const BOT_DISCLAIMER =
  'PepTalk\'s responses are generated from an educational knowledge base and do not ' +
  'constitute medical advice, diagnosis, or treatment recommendations. The bot is an ' +
  'informational assistant, not a healthcare provider. For medical concerns, contact ' +
  'a licensed physician.';

/** Shown on safety profiles / interaction data */
export const SAFETY_DISCLAIMER =
  'Safety and interaction data is compiled from published research and known pharmacological ' +
  'profiles. This information may be incomplete and should not replace professional medical ' +
  'assessment. Report any adverse effects to your healthcare provider immediately.';

/** Shown near health data / check-in features */
export const HEALTH_DATA_DISCLAIMER =
  'Health tracking features in PepTalk are personal journaling tools. They are not ' +
  'medical monitoring devices and should not replace regular medical check-ups or ' +
  'professional health assessments. If you experience concerning symptoms, contact ' +
  'your healthcare provider.';

/** Shown in the nutritionist request flow */
export const TELEMEDICINE_DISCLAIMER =
  'PepTalk facilitates connections with healthcare professionals but does not itself ' +
  'provide medical services. Any consultations arranged through PepTalk are between ' +
  'you and the independent healthcare provider. PepTalk is not responsible for the ' +
  'advice, treatment, or services provided by third-party professionals.';

// ---------------------------------------------------------------------------
// Privacy & Data
// ---------------------------------------------------------------------------

export const DATA_PRIVACY_SUMMARY =
  'Your data is encrypted in transit and at rest and synced to your private account ' +
  'on our secure backend. PepTalk never sells or shares your personal health ' +
  'information for advertising. AI features are opt-in: when you use one, the relevant ' +
  'content is sent to our AI providers (xAI and OpenAI) to generate a result. You can ' +
  'delete your account and all associated data at any time from your Profile settings.';

export const ANONYMOUS_ANALYTICS_DISCLOSURE =
  'If you opt in, PepTalk collects anonymous usage patterns (e.g., which features ' +
  'are used, screen navigation) to improve the app experience. This data cannot be ' +
  'traced back to you and never includes health information, personal details, or ' +
  'chat content.';

// ---------------------------------------------------------------------------
// Terms of Service Summary (key clauses)
// ---------------------------------------------------------------------------

export const TOS_SECTIONS = [
  {
    title: 'Educational Purpose',
    icon: 'school-outline' as const,
    content:
      'PepTalk is an educational and informational platform. All content — including ' +
      'peptide data, dosing references, protocol templates, safety profiles, and bot ' +
      'responses — is provided for educational purposes only and does not constitute ' +
      'medical advice, diagnosis, or treatment recommendations.',
  },
  {
    title: 'No Medical Advice',
    icon: 'medical-outline' as const,
    content:
      'PepTalk is not a medical device, healthcare provider, or substitute for ' +
      'professional medical care. Nothing in this app should be interpreted as a ' +
      'prescription, recommendation to use any substance, or guidance to alter any ' +
      'medical treatment. Always seek the advice of a qualified healthcare provider ' +
      'with any questions regarding a medical condition.',
  },
  {
    title: 'User Responsibility',
    icon: 'person-circle-outline' as const,
    content:
      'You acknowledge that any actions you take based on information in PepTalk are ' +
      'your own responsibility. You agree not to rely on this app as a substitute for ' +
      'professional medical advice. The dose tracker and journal features are personal ' +
      'record-keeping tools — entries reflect your own actions and decisions.',
  },
  {
    title: 'No Sales or Distribution',
    icon: 'storefront-outline' as const,
    content:
      'PepTalk does not sell, distribute, supply, or facilitate the purchase of any ' +
      'peptides, supplements, pharmaceuticals, or controlled substances. PepTalk is ' +
      'an information and tracking tool only.',
  },
  {
    title: 'Limitation of Liability',
    icon: 'shield-outline' as const,
    content:
      'To the fullest extent permitted by applicable law, PepTalk and its developers, ' +
      'owners, and affiliates shall not be liable for any direct, indirect, incidental, ' +
      'consequential, or punitive damages arising from your use of this app, including ' +
      'but not limited to health outcomes, adverse reactions, or reliance on information ' +
      'provided within the app.',
  },
  {
    title: 'Assumption of Risk',
    icon: 'alert-circle-outline' as const,
    content:
      'By using PepTalk, you acknowledge that peptide research is an evolving field and ' +
      'that information may be incomplete, outdated, or subject to new findings. You assume ' +
      'all risks associated with the use of information provided in this app. PepTalk makes ' +
      'no warranties regarding the accuracy, completeness, or timeliness of any content.',
  },
  {
    title: 'Data Privacy',
    icon: 'lock-closed-outline' as const,
    content:
      'Your data is encrypted in transit and at rest and synced to your private account on ' +
      'our secure backend. PepTalk does not sell or share your personal health information ' +
      'for advertising. Opt-in AI features send the content you submit to our AI providers ' +
      '(xAI and OpenAI) to generate a result. See our Privacy Policy for full details.',
  },
  {
    title: 'Changes to Terms',
    icon: 'document-text-outline' as const,
    content:
      'We reserve the right to update these Terms of Service at any time. Continued use ' +
      'of the app after changes constitutes acceptance of the revised terms. We will notify ' +
      'you of significant changes through the app.',
  },
] as const;

// ---------------------------------------------------------------------------
// Bot suffix (appended to certain bot responses)
// ---------------------------------------------------------------------------

/** Appended to bot responses that involve dosing, safety, or medical topics */
export const BOT_MEDICAL_SUFFIX =
  '\n\n_This is educational information only — not medical advice. Consult your healthcare provider._';

/** Appended to bot responses about general peptide info */
export const BOT_INFO_SUFFIX =
  '\n\n_For educational purposes only. Always consult a qualified healthcare provider._';
