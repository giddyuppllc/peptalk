/**
 * The app's navigable destinations — one list, used by the nav sheet AND by the
 * reachability check.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * PepTalk hides its tab bar (`app/(tabs)/_layout.tsx` sets
 * `tabBarStyle: { display: 'none' }`) because the four Home cards are the
 * navigation. That is a real design choice, but it left the app with no visible
 * way to reach anything the cards do not point at, and roughly 130 route files
 * behind four doors.
 *
 * App Review found it before we did: build 1.9.8 was rejected under 2.3 because
 * the reviewer could not find the dose calculator described in our own App Store
 * description. It was there — Home → Doses → Calculator — but a reviewer looking
 * for tabs sees nothing, and `/calculators` (a second, richer hub) had no
 * inbound link from any screen at all.
 *
 * `scripts/verify-route-reachability.ts` did not catch that, and says so in its
 * own header: it counts any path-shaped string as a link, so a route mentioned
 * in Aimee's navigation allowlist reads as reachable while no human can get
 * there. This list is the fix — a destination a person can actually tap, which
 * the checker can compare against the routes on disk.
 *
 * ── Rules ─────────────────────────────────────────────────────────────────
 * - Doses first. It is what Apple went looking for, and what most users open.
 * - Groups, not a flat list. If everything is one tap away nothing is findable.
 * - Every href must resolve to a real file under app/. The reachability check
 *   fails the build otherwise.
 */

import type { Ionicons } from '@expo/vector-icons';
import React from 'react';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface NavDestination {
  label: string;
  icon: IoniconName;
  href: string;
  /** One line, shown under the label. Keep it concrete. */
  hint?: string;
}

export interface NavGroup {
  title: string;
  items: NavDestination[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Doses',
    items: [
      {
        label: 'Dose Calculator',
        icon: 'calculator-outline',
        href: '/doses/calculator',
        hint: 'Reconstitute, draw, doses per vial',
      },
      {
        label: 'Quick Dose Guide',
        icon: 'flash-outline',
        href: '/calculators/quick-dose',
        hint: 'Common protocols at a glance',
      },
      {
        label: 'Stack Builder',
        icon: 'layers-outline',
        href: '/doses/stack-builder',
        hint: 'Multi-peptide planner',
      },
      {
        label: 'Dose Tracker',
        icon: 'list-outline',
        href: '/doses/tracker',
        hint: 'What you took, and when',
      },
      {
        label: 'Peptide Library',
        icon: 'library-outline',
        href: '/doses/library',
        hint: 'Summaries and dose ranges',
      },
    ],
  },
  {
    title: 'Train & Eat',
    items: [
      { label: 'Train', icon: 'barbell-outline', href: '/(tabs)/train', hint: 'Workouts and nutrition' },
      { label: 'Workouts', icon: 'fitness-outline', href: '/workouts' },
      { label: 'Nutrition', icon: 'restaurant-outline', href: '/nutrition' },
    ],
  },
  {
    title: 'Health',
    items: [
      { label: 'Daily Check-in', icon: 'checkmark-circle-outline', href: '/(tabs)/check-in' },
      { label: 'Calendar', icon: 'calendar-outline', href: '/(tabs)/calendar' },
      { label: 'Activity', icon: 'walk-outline', href: '/activity' },
      { label: 'Sleep', icon: 'moon-outline', href: '/tracker/sleep' },
      { label: 'Body Composition', icon: 'body-outline', href: '/body-composition' },
      { label: 'Lab Results', icon: 'flask-outline', href: '/labs' },
      { label: 'Health Report', icon: 'document-text-outline', href: '/health-report' },
      { label: 'Insights', icon: 'sparkles-outline', href: '/insights' },
    ],
  },
  {
    title: 'Learn & Community',
    items: [
      { label: 'Learn', icon: 'school-outline', href: '/learn' },
      { label: 'Peptides', icon: 'medical-outline', href: '/(tabs)/my-stacks' },
      { label: 'Community', icon: 'people-outline', href: '/(tabs)/community' },
      { label: 'Journal', icon: 'book-outline', href: '/journal' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Profile', icon: 'person-circle-outline', href: '/(tabs)/profile' },
      { label: 'Subscription', icon: 'card-outline', href: '/subscription' },
      { label: 'Apple Health & Integrations', icon: 'heart-outline', href: '/settings/integrations' },
      { label: 'Notifications', icon: 'notifications-outline', href: '/settings/notifications' },
    ],
  },
];

/** Every destination, flattened. Used by the reachability check. */
export const ALL_NAV_DESTINATIONS: NavDestination[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Routes the nav sheet must NOT appear on: pre-auth, and anything modal or
 * full-screen where a floating control would sit on top of the content it is
 * covering.
 */
export const NAV_HIDDEN_PREFIXES = [
  '/onboarding',
  '/auth',
  '/subscription', // a paywall with an escape hatch floating over it converts worse
  '/workouts/player',
  '/admin',
  '/+not-found',
];

export function navHiddenOn(pathname: string): boolean {
  return NAV_HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
