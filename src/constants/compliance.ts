/**
 * Single source of truth for the educational/research-use disclaimer
 * text that any peptide guide / dosing screen surfaces.
 *
 * Edward asked for the framing to be unambiguous: the app organizes
 * research data, it does not prescribe or recommend doses for the
 * user's specific body or condition.
 */

export const RESEARCH_DISCLAIMER = `This database is for educational and research organization purposes only. It does not provide medical advice, diagnosis, treatment, prescribing instructions, or human-use recommendations. Always consult a qualified healthcare provider before any peptide use.`;

export const RESEARCH_DISCLAIMER_SHORT = `Educational reference only — not medical advice. Consult a qualified provider.`;

/**
 * UI label + color hint for the compliance tier badge shown in headers.
 * Keep the labels short (<= 18 chars) so they fit in a chip on phones.
 */
export const COMPLIANCE_TIER_DISPLAY: Record<string, { label: string; color: string; tooltip: string }> = {
  fda_approved: {
    label: 'FDA-Approved',
    color: '#10b981',
    tooltip: 'Approved by the U.S. FDA for at least one human indication.',
  },
  compounded_503a: {
    label: '503A Compounded',
    color: '#3b82f6',
    tooltip: 'Available via 503A compounding pharmacies under specific shortage / patient-specific exceptions.',
  },
  investigational: {
    label: 'Investigational',
    color: '#f59e0b',
    tooltip: 'In active human clinical trials but not yet FDA-approved.',
  },
  research_only: {
    label: 'Research Only (RUO)',
    color: '#ef4444',
    tooltip: 'Not approved for human use. Sold as a research compound only.',
  },
  cosmetic: {
    label: 'Cosmetic',
    color: '#a855f7',
    tooltip: 'Used as a cosmetic ingredient (topical). Not for injectable / human consumption claims.',
  },
  supplement: {
    label: 'Supplement (DSHEA)',
    color: '#8b5cf6',
    tooltip: 'Sold as a dietary supplement under DSHEA. Not a drug.',
  },
  discontinued: {
    label: 'Discontinued',
    color: '#6b7280',
    tooltip: 'Previously available; no longer marketed.',
  },
};

/**
 * Letter grade descriptions for the A-E evidence ladder.
 */
export const EVIDENCE_GRADE_DISPLAY: Record<string, { letter: string; label: string; color: string }> = {
  A: { letter: 'A', label: 'FDA-approved human drug data', color: '#10b981' },
  B: { letter: 'B', label: 'Human clinical studies',         color: '#3b82f6' },
  C: { letter: 'C', label: 'Animal / preclinical',           color: '#f59e0b' },
  D: { letter: 'D', label: 'In-vitro / mechanistic only',    color: '#a855f7' },
  E: { letter: 'E', label: 'Anecdotal / insufficient',       color: '#ef4444' },
  // Legacy mappings — used when older entries haven't been graded yet
  established: { letter: 'A/B', label: 'Established (legacy grade)',   color: '#10b981' },
  moderate:    { letter: 'C',   label: 'Moderate (legacy grade)',      color: '#f59e0b' },
  preliminary: { letter: 'D/E', label: 'Preliminary (legacy grade)',   color: '#ef4444' },
};
