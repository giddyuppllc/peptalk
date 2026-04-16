import { DashboardSegment, SegmentId, Gender, AgeRange } from '../types';

export const DASHBOARD_SEGMENTS: DashboardSegment[] = [
  // ── MALE 18-29: "SEND IT" ────────────────────────────────────────────────
  // Gym, tan, laundry. Sexy fun, life is just beginning.
  {
    id: 'male-18-29',
    gender: 'Male',
    ageRange: '18-29',
    label: 'Send It',
    tagline: 'Look good, feel better, send it.',
    focusAreas: [
      'Physique and body composition',
      'Performance and recovery',
      'Confidence and nightlife energy',
      'Sleep quality after hard sessions',
    ],
    heroTitle: 'Send It',
    heroSubtitle: 'Get shredded. Look good. Your era starts now.',
    palette: {
      primary: '#6B2D3E',       // Deep Burgundy
      secondary: '#3D5A3E',     // Forest Green
      accent: '#4A4A4F',        // Charcoal
      background: '#F0EAE0',   // Cloud Dancer
      card: '#F7F3ED',
    },
    imagery: ['neon signs', 'gym mirrors', 'night city', 'beach sunset', 'energy'],
    stackHighlights: ['The Shred', 'Night Mode', 'Beast Protocol'],
    researchHighlights: [
      'Muscle protein synthesis and recovery in young men',
      'Body recomposition and metabolic rate optimization',
      'Sleep architecture and training adaptation studies',
    ],
  },

  // ── FEMALE 18-29: "MAIN CHARACTER" ────────────────────────────────────────
  // That Girl aesthetic. Glow-ups, self-care, morning routines, main character energy.
  {
    id: 'female-18-29',
    gender: 'Female',
    ageRange: '18-29',
    label: 'Main Character',
    tagline: 'Your glow-up is a science.',
    focusAreas: [
      'Skin, hair, and the glow',
      'Body composition and tone',
      'Energy and daily balance',
      'Self-care and recovery rituals',
    ],
    heroTitle: 'Main Character',
    heroSubtitle: 'Glow up, show up, own it.',
    palette: {
      primary: '#f4a6c8',
      secondary: '#2a1f28',
      accent: '#f7d37c',
      background: '#160f14',
      card: '#20161d',
    },
    imagery: ['golden hour', 'matcha', 'yoga mat', 'soft pink neon', 'mirror light'],
    stackHighlights: ['The Glow-Up', 'Clean Girl Protocol', 'That Girl Stack'],
    researchHighlights: [
      'Collagen and skin luminosity pathways in young women',
      'Body recomposition research in active females',
      'Stress resilience and energy balance studies',
    ],
  },

  // ── MALE 30-44: "THE OPERATOR" ───────────────────────────────────────────
  // Strategic, capable, no-BS. Cold plunges at 5am. Optimizing everything.
  {
    id: 'male-30-44',
    gender: 'Male',
    ageRange: '30-44',
    label: 'The Operator',
    tagline: 'Optimize your edge.',
    focusAreas: [
      'Cognitive clarity and focus',
      'Endurance and stress resilience',
      'Data-driven recovery',
      'Longevity protocols',
    ],
    heroTitle: 'The Operator',
    heroSubtitle: 'Smarter, not just harder. Run the numbers on your body.',
    palette: {
      primary: '#6B2D3E',       // Deep Burgundy
      secondary: '#3D5A3E',     // Dark Olive
      accent: '#4A3728',        // Espresso
      background: '#F0EAE0',   // Cloud Dancer
      card: '#F7F3ED',
    },
    imagery: ['cold plunge', 'black coffee', 'minimalist gym', 'smartwatch data', 'dawn light'],
    stackHighlights: ['Operator Protocol', 'The Edge Stack', 'Executive Compound'],
    researchHighlights: [
      'Cognition and focus signaling research in adults',
      'HRV optimization and recovery modulation',
      'Stress pathway adaptation and cortisol management',
    ],
  },

  // ── FEMALE 30-44: "HOME & HEALTH" ────────────────────────────────────────
  // White picket fence. Science for the women who hold it all together.
  {
    id: 'female-30-44',
    gender: 'Female',
    ageRange: '30-44',
    label: 'Home & Health',
    tagline: 'Science for the women who hold it all together.',
    focusAreas: [
      'Hormonal balance education',
      'Family wellness planning',
      'Energy through the daily grind',
      'Skin and recovery routines',
    ],
    heroTitle: 'Home & Health',
    heroSubtitle: "Your family's health starts with yours.",
    palette: {
      primary: '#f2b679',
      secondary: '#2a211c',
      accent: '#9bd7b0',
      background: '#13100d',
      card: '#1d1914',
    },
    imagery: ['warm kitchen light', 'linen textures', 'garden', 'family table', 'soft neutrals'],
    stackHighlights: ['The Balance', 'Family Wellness', 'Daily Harmony'],
    researchHighlights: [
      'Hormonal rhythm education and balance research',
      'Sleep quality and maternal recovery markers',
      'Skin and hair integrity pathways for busy lifestyles',
    ],
  },

  // ── MALE 45-60: "BLACK LABEL" ────────────────────────────────────────────
  // James Bond. Tuxedo, casino, scotch neat. Dangerous confidence meets refined elegance.
  {
    id: 'male-45-60',
    gender: 'Male',
    ageRange: '45-60',
    label: 'Black Label',
    tagline: 'Refined power. Lasting presence.',
    focusAreas: [
      'Vitality and commanding confidence',
      'Appearance and skin health',
      'Sexual health education',
      'Longevity with elegance',
    ],
    heroTitle: 'Black Label',
    heroSubtitle: 'The name is yours. Own it.',
    palette: {
      primary: '#4A3728',       // Deep Espresso
      secondary: '#3D5A3E',     // Forest Green
      accent: '#6B2D3E',        // Burgundy accent
      background: '#F0EAE0',   // Cloud Dancer
      card: '#F7F3ED',
    },
    imagery: ['tuxedo lapel', 'casino felt', 'gold cufflinks', 'amber whiskey', 'dark wood'],
    stackHighlights: ['Prime Protocol', 'Elegant Vitality', 'Longevity Noir'],
    researchHighlights: [
      'Vitality and testosterone optimization research',
      'Skin integrity and appearance in aging men',
      'Cardiovascular longevity pathways under investigation',
    ],
  },

  // ── FEMALE 45-60: "THE RENAISSANCE" ──────────────────────────────────────
  // Wine country sophistication. Second act energy. Still turning heads. Unapologetic radiance.
  {
    id: 'female-45-60',
    gender: 'Female',
    ageRange: '45-60',
    label: 'The Renaissance',
    tagline: 'Your second act is the main event.',
    focusAreas: [
      'Menopausal health education',
      'Skin, hair, and ageless vitality',
      'Energy balance and recovery',
      'Confidence that commands a room',
    ],
    heroTitle: 'The Renaissance',
    heroSubtitle: 'Radiance is a choice. Choose brilliantly.',
    palette: {
      primary: '#d9a7e5',
      secondary: '#231927',
      accent: '#f7c5a8',
      background: '#120d14',
      card: '#1b141e',
    },
    imagery: ['vineyard sunset', 'silk robe', 'Mediterranean terrace', 'candlelight', 'pearl earrings'],
    stackHighlights: ['Radiance Protocol', 'The Renaissance Stack', 'Ageless Luxe'],
    researchHighlights: [
      'Menopause-adjacent hormone education and research',
      'Collagen and skin appearance preservation pathways',
      'Bone density and metabolic health in midlife women',
    ],
  },

  // ── MALE 60+: "LEGACY CODE" ──────────────────────────────────────────────
  // All longevity signaling. The elder statesman still sharper than everyone in the room.
  {
    id: 'male-60+',
    gender: 'Male',
    ageRange: '60+',
    label: 'Legacy Code',
    tagline: "Protect what you've built.",
    focusAreas: [
      'Cognitive support and neuroprotection',
      'Joint and bone health',
      'Cardiovascular resilience',
      'Longevity — the long game',
    ],
    heroTitle: 'Legacy Code',
    heroSubtitle: 'The mind stays sharp. The legacy endures.',
    palette: {
      primary: '#4A4A4F',       // Charcoal / Graphite
      secondary: '#3D5A3E',     // Dark Olive
      accent: '#4A3728',        // Espresso
      background: '#F0EAE0',   // Cloud Dancer
      card: '#F7F3ED',
    },
    imagery: ['leather study', 'chess board', 'warm gold light', 'oak desk', 'reading glasses'],
    stackHighlights: ['The Legacy Stack', 'Cognitive Shield', 'Enduring Strength'],
    researchHighlights: [
      'Neuroprotective peptide research in aging populations',
      'Joint and cartilage repair pathway studies',
      'Cardiovascular health and longevity signaling',
    ],
  },

  // ── FEMALE 60+: "GOLDEN GRACE" ───────────────────────────────────────────
  // Helen Mirren energy. Fiercely independent. Vibrant, active, never fragile.
  {
    id: 'female-60+',
    gender: 'Female',
    ageRange: '60+',
    label: 'Golden Grace',
    tagline: 'Strength within, radiance that endures.',
    focusAreas: [
      'Bone density and osteoporosis prevention',
      'Cognitive clarity and memory',
      'Skin integrity and collagen',
      'Cardiovascular and hormonal balance',
    ],
    heroTitle: 'Golden Grace',
    heroSubtitle: 'Your brightest chapter is now.',
    palette: {
      primary: '#c49ed4',
      secondary: '#211a24',
      accent: '#d4a878',
      background: '#110e13',
      card: '#1a151d',
    },
    imagery: ['morning garden', 'lavender fields', 'warm tea', 'soft gold jewelry', 'watercolor light'],
    stackHighlights: ['Golden Grace Stack', 'Bone & Bloom', 'Cognitive Clarity'],
    researchHighlights: [
      'Bone density and peptide therapy research in women',
      'Post-menopausal cognitive preservation studies',
      'Skin and collagen integrity in aging populations',
    ],
  },
];

export const getSegmentByProfile = (
  gender: Gender | null,
  ageRange: AgeRange | null
): DashboardSegment => {
  const fallback = DASHBOARD_SEGMENTS[0];
  if (!gender || !ageRange) return fallback;

  const id = `${gender.toLowerCase()}-${ageRange}` as SegmentId;
  return (
    DASHBOARD_SEGMENTS.find((segment) => segment.id === id) ?? fallback
  );
};

// ── Two UI Layouts: Male / Female ───────────────────────────────────────────

export interface DashboardLayout {
  id: 'male' | 'female';
  label: string;
  tagline: string;
  heroTitle: string;
  heroSubtitle: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    card: string;
  };
  focusAreas: string[];
}

export const DASHBOARD_LAYOUTS: Record<string, DashboardLayout> = {
  male: {
    id: 'male',
    label: 'Performance',
    tagline: 'Optimize your body and mind.',
    heroTitle: 'Your Health Dashboard',
    heroSubtitle: 'Train hard. Recover smart. Track everything.',
    palette: {
      primary: '#6B2D3E',       // Deep Burgundy
      secondary: '#3D5A3E',     // Forest Green
      accent: '#4A4A4F',        // Charcoal
      background: '#F0EAE0',   // Cloud Dancer
      card: '#F7F3ED',
    },
    focusAreas: [
      'Strength & performance',
      'Body composition',
      'Recovery & sleep',
      'Hormone optimization',
    ],
  },
  female: {
    id: 'female',
    label: 'Vitality',
    tagline: 'Balance, strength, and wellness.',
    heroTitle: 'Your Wellness Dashboard',
    heroSubtitle: 'Strong body. Clear mind. Balanced life.',
    palette: {
      primary: '#e3a7a1',
      secondary: '#1a2535',
      accent: '#b9cbb6',
      background: '#0f1720',
      card: '#1a2535',
    },
    focusAreas: [
      'Hormonal balance & cycle health',
      'Strength & body composition',
      'Skin, hair & vitality',
      'Sleep & stress management',
    ],
  },
};

/**
 * Get the UI layout based on gender only (2 layouts, not 8).
 * Age-specific content still comes from getSegmentByProfile() for messaging.
 */
export const getLayoutByGender = (gender: Gender | null): DashboardLayout => {
  if (!gender) return DASHBOARD_LAYOUTS.male;
  return gender === 'Female' ? DASHBOARD_LAYOUTS.female : DASHBOARD_LAYOUTS.male;
};
