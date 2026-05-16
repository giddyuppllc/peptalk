// Test-profile theming map — populate with real tester emails if you want
// gender/age-range/goals overrides on the Home + Profile screens for QA.
// Empty map = every real user falls through to their onboarding-store data
// via the `?? fallback` pattern at every callsite.

import type { Gender, AgeRange, GoalType, PeptideCategory, Ethnicity } from '../types';

export interface TestProfile {
  gender: Gender;
  ageRange: AgeRange;
  ethnicity?: Ethnicity;
  goals: GoalType[];
  interests: PeptideCategory[];
}

export const TEST_PROFILES: Record<string, TestProfile> = {};

export function getTestProfile(email?: string | null): TestProfile | null {
  if (!email) return null;
  return TEST_PROFILES[email.toLowerCase()] ?? null;
}
