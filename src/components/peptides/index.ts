/**
 * Peptides UI component barrel — Phase 4 of the redesign.
 *
 * The Peptides tab landing (Phase 4) consumes all three; Phase 2
 * (Home dashboard) re-uses `AdherenceDial` as a hero widget so it
 * needs to be importable independently of the larger module.
 */

export { AdherenceDial } from './AdherenceDial';
export type { AdherenceDialProps } from './AdherenceDial';

export { CycleProgressBar } from './CycleProgressBar';
export type { CycleProgressBarProps } from './CycleProgressBar';

export { DoseStrip } from './DoseStrip';
export type { DoseStripProps, DoseStripEntry } from './DoseStrip';
