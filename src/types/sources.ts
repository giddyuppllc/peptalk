/**
 * Citations & references — schema for the Resources page.
 *
 * We don't surface citations inline on every peptide page (would clutter
 * the UI). Instead, every claim is traceable through this catalog: each
 * Source entry tags which peptides and topics it substantiates, and the
 * Resources page is the single discoverable surface where users (or
 * reviewers) can verify what backs our content.
 *
 * Naming convention: source ids use kebab-case (e.g. "wilding-2021-step1")
 * so they're stable identifiers we can reference from prose docs later
 * without renumbering when the catalog grows.
 */

export type SourceType =
  | 'peer_reviewed'    // indexed journal article
  | 'clinical_trial'   // ClinicalTrials.gov entry
  | 'review_article'   // systematic review / meta-analysis
  | 'regulatory'       // FDA / EMA label or guidance
  | 'lab_technical';   // technical data sheet (last resort)

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  peer_reviewed:  'Peer-reviewed',
  clinical_trial: 'Clinical trial',
  review_article: 'Review article',
  regulatory:     'Regulatory',
  lab_technical:  'Lab technical',
};

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  authors?: string[];
  year: number;
  journal?: string;
  pubmedId?: string;     // e.g. "PMID: 12345678"
  doi?: string;
  url?: string;
  trialId?: string;      // NCT number for ClinicalTrials.gov entries
  /** Last time a human verified this source still says what we claim. */
  lastReviewed: string;  // YYYY-MM-DD
  /** Short quote / page reference pinning the specific claim. */
  quote?: string;
  /** Peptide IDs this source substantiates claims for. */
  peptideIds?: string[];
  /** Topics this source covers (nutrition, timing, safety, etc.). */
  topics?: string[];
}

export type SourceTopic =
  | 'efficacy'
  | 'safety'
  | 'dosing'
  | 'timing'
  | 'nutrition'
  | 'interactions'
  | 'mechanism'
  | 'pharmacokinetics'
  | 'long_term_outcomes';

export const SOURCE_TOPIC_LABELS: Record<SourceTopic, string> = {
  efficacy:           'Efficacy',
  safety:             'Safety',
  dosing:             'Dosing',
  timing:             'Timing',
  nutrition:          'Nutrition',
  interactions:       'Interactions',
  mechanism:          'Mechanism',
  pharmacokinetics:   'Pharmacokinetics',
  long_term_outcomes: 'Long-term outcomes',
};
