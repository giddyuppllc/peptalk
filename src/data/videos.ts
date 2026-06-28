import { VideoContent, VideoCategory } from '../types';

/**
 * Video content for the Learn & Watch section.
 * Videos are hosted externally (YouTube, Vimeo) — only metadata is stored here.
 *
 * Entries with `videoUrl` containing the `PLACEHOLDER_*` token are
 * pre-release stubs (script + thumbnail + metadata are ready, the
 * filming is in progress). They're marked `comingSoon: true` so the
 * Learn index shows a badge and the detail screen surfaces a friendly
 * "Coming soon" message rather than dropping the user into a broken
 * YouTube link. Once a video ships, set `comingSoon: false` (or remove
 * the field) and replace the URL.
 */
export const VIDEOS: VideoContent[] = [
  {
    id: 'how-to-reconstitute-peptides',
    title: 'How to Reconstitute Peptides: Step-by-Step Guide',
    slug: 'how-to-reconstitute-peptides',
    category: 'how_to',
    description: 'A complete visual walkthrough of peptide reconstitution using bacteriostatic water. Covers calculating dilution ratios, proper injection technique into the vial, and storage after mixing.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_RECON',
    duration: '12:34',
    tags: ['reconstitution', 'bac water', 'mixing', 'beginner', 'how-to'],
    relatedPeptideIds: ['bpc-157', 'tb-500', 'ipamorelin', 'cjc-1295'],
    featured: true,
    comingSoon: true,
    publishedAt: '2025-02-10',
  },
  {
    id: 'subcutaneous-injection-technique',
    title: 'Subcutaneous Injection Technique for Peptides',
    slug: 'subcutaneous-injection-technique',
    category: 'how_to',
    description: 'Learn proper subcutaneous injection technique including site selection, skin pinching, needle angle, and post-injection care. Covers common mistakes and how to minimize discomfort.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_SUBQ',
    duration: '9:47',
    tags: ['injection', 'subcutaneous', 'technique', 'beginner', 'safety'],
    relatedPeptideIds: ['semaglutide', 'bpc-157', 'tirzepatide'],
    featured: false,
    comingSoon: true,
    publishedAt: '2025-02-18',
  },
  {
    id: 'what-are-peptides-explained',
    title: 'What Are Peptides? A Beginner\'s Guide',
    slug: 'what-are-peptides-explained',
    category: 'education',
    description: 'An accessible introduction to peptides — what they are, how they differ from proteins and steroids, and why they are generating so much interest in health and longevity research.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_INTRO',
    duration: '15:22',
    tags: ['peptides', 'beginner', 'introduction', 'amino acids', 'education'],
    relatedPeptideIds: ['bpc-157', 'semaglutide', 'ghk-cu', 'epithalon'],
    featured: true,
    comingSoon: true,
    publishedAt: '2025-01-20',
  },
  {
    id: 'glp1-agonists-explained',
    title: 'GLP-1 Receptor Agonists Explained: Semaglutide & Tirzepatide',
    slug: 'glp1-agonists-explained',
    category: 'education',
    description: 'Deep dive into how GLP-1 receptor agonists work for weight management and metabolic health. Covers the mechanism of action, differences between semaglutide and tirzepatide, and what the research shows.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_GLP1',
    duration: '18:05',
    tags: ['GLP-1', 'semaglutide', 'tirzepatide', 'weight loss', 'metabolic health'],
    relatedPeptideIds: ['semaglutide', 'tirzepatide'],
    featured: true,
    comingSoon: true,
    publishedAt: '2025-03-01',
  },
  {
    id: 'gh-secretagogues-overview',
    title: 'Growth Hormone Secretagogues: CJC-1295, Ipamorelin & More',
    slug: 'gh-secretagogues-overview',
    category: 'education',
    description: 'Understanding growth hormone releasing peptides and secretagogues. How they stimulate natural GH production, key differences between GHRH analogs and ghrelin mimetics, and what stacking looks like.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_GHS',
    duration: '14:18',
    tags: ['growth hormone', 'CJC-1295', 'ipamorelin', 'GHRP', 'secretagogues'],
    relatedPeptideIds: ['cjc-1295', 'ipamorelin'],
    comingSoon: true,
    publishedAt: '2025-02-05',
  },
  {
    id: 'peptide-clinical-trials-2025',
    title: 'Peptide Clinical Trials: What\'s Happening in 2025',
    slug: 'peptide-clinical-trials-2025',
    category: 'research',
    description: 'A review of the most significant ongoing clinical trials involving peptide therapeutics. Covers GLP-1 dual agonists, tissue repair peptides, immune modulators, and longevity-focused compounds.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_TRIALS',
    duration: '20:41',
    tags: ['clinical trials', 'research', 'FDA', 'therapeutics', '2025'],
    relatedPeptideIds: ['semaglutide', 'tirzepatide', 'thymosin-alpha-1', 'bpc-157'],
    comingSoon: true,
    publishedAt: '2025-03-05',
  },
  {
    id: 'peptide-lab-testing-guide',
    title: 'How to Read a Peptide Lab Test: HPLC & Mass Spec Explained',
    slug: 'peptide-lab-testing-guide',
    category: 'research',
    description: 'Learn how to interpret HPLC chromatograms, mass spectrometry results, and Certificates of Analysis. Understand what purity percentages mean and how to spot red flags in lab reports.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1576086213369-97a306d36557?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_LABTEST',
    duration: '16:53',
    tags: ['lab testing', 'HPLC', 'mass spectrometry', 'COA', 'purity'],
    relatedPeptideIds: ['bpc-157', 'tb-500', 'semaglutide'],
    comingSoon: true,
    publishedAt: '2025-01-28',
  },
  {
    id: 'weight-loss-journey-glp1',
    title: 'My GLP-1 Peptide Journey: 6 Months of Progress',
    slug: 'weight-loss-journey-glp1',
    category: 'success_stories',
    description: 'A personal account of using GLP-1 receptor agonists over six months for weight management. Covers dosing timeline, side effects experienced, lifestyle changes made, and measurable outcomes.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_WLOSS',
    duration: '22:10',
    tags: ['weight loss', 'GLP-1', 'success story', 'journey', 'personal experience'],
    relatedPeptideIds: ['semaglutide', 'tirzepatide'],
    comingSoon: true,
    publishedAt: '2025-02-22',
  },
  {
    id: 'recovery-story-bpc157-tb500',
    title: 'Injury Recovery with BPC-157 & TB-500: One Athlete\'s Story',
    slug: 'recovery-story-bpc157-tb500',
    category: 'success_stories',
    description: 'An athlete shares their experience using tissue repair peptides during recovery from a sports injury. Discusses protocol, timeline, complementary therapies, and return-to-activity milestones.',
    thumbnailUrl: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&q=80',
    videoUrl: 'https://youtube.com/watch?v=PLACEHOLDER_RECOVERY',
    duration: '17:36',
    tags: ['recovery', 'BPC-157', 'TB-500', 'injury', 'athlete', 'healing'],
    relatedPeptideIds: ['bpc-157', 'tb-500', 'ghk-cu'],
    comingSoon: true,
    publishedAt: '2025-01-15',
  },
];

/**
 * A video is "real" (playable) only when it's not flagged `comingSoon`
 * AND its `videoUrl` carries no `PLACEHOLDER_*` stub token. Every list/
 * gallery/deep-link surface filters on this so the app never advertises
 * an empty video feature (App Review 2.1). When real videos land, the
 * predicate flips automatically and the UI re-lights — no code changes.
 */
export const isRealVideo = (v: VideoContent): boolean =>
  v.comingSoon !== true && !/PLACEHOLDER/i.test(v.videoUrl);

/** Only the playable videos — use this anywhere a list is rendered. */
export const getRealVideos = (): VideoContent[] => VIDEOS.filter(isRealVideo);

/** True when at least one real (playable) video exists. */
export const hasRealVideos = (): boolean => VIDEOS.some(isRealVideo);

export const getVideoById = (id: string): VideoContent | undefined =>
  VIDEOS.find((v) => v.id === id);

export const getVideoBySlug = (slug: string): VideoContent | undefined =>
  VIDEOS.find((v) => v.slug === slug);

export const getVideosByCategory = (category: VideoCategory): VideoContent[] =>
  VIDEOS.filter((v) => isRealVideo(v) && v.category === category);

export const getVideosByPeptideId = (peptideId: string): VideoContent[] =>
  VIDEOS.filter((v) => isRealVideo(v) && v.relatedPeptideIds?.includes(peptideId));

export const getFeaturedVideos = (): VideoContent[] =>
  VIDEOS.filter((v) => isRealVideo(v) && v.featured);
