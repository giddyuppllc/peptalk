/**
 * Profile → "Delete My Data": clear every user-data store on THIS device.
 *
 * Device-local only, as the confirmation dialog says. Server-side deletion is
 * Delete Account (useAuthStore.deleteAccount → the delete-user edge function),
 * which this must never stand in for.
 *
 * None of these resets may write to the server. Most are plain `set` calls;
 * the health profile is the one store whose cloud sync is a subscription on
 * every change, so its resetProfile suppresses that sync itself — otherwise
 * this wipe upserted an empty profile over the user's server copy.
 *
 * Lives outside the screen so the "no server write" guarantee can be tested
 * against the real stores (src/store/__tests__/clearDeviceData.test.ts).
 */
import { useOnboardingStore } from './useOnboardingStore';
import { useHealthProfileStore } from './useHealthProfileStore';
import { useDoseLogStore } from './useDoseLogStore';
import { useCheckinStore } from './useCheckinStore';
import { useJournalStore } from './useJournalStore';
import { useMealStore } from './useMealStore';
import { useWorkoutStore } from './useWorkoutStore';
import { useChatStore } from './useChatStore';
import { useCycleStore } from './useCycleStore';
import { usePantryStore } from './usePantryStore';
import { useStackStore } from './useStackStore';
import { useBodyMapStore } from './useBodyMapStore';
import { useAllergyStore } from './useAllergyStore';
import { useLabResultsStore } from './useLabResultsStore';
import { useIntegrationsStore } from './useIntegrationsStore';

export function clearDeviceData(): void {
  useOnboardingStore.getState().reset();
  useHealthProfileStore.getState().resetProfile();
  useDoseLogStore.getState().clearAll();
  useCheckinStore.getState().clearAll();
  useJournalStore.getState().clearAll();
  useMealStore.getState().clearAll();
  useWorkoutStore.getState().clearAll();
  useChatStore.getState().resetForLogout(); // no clearAll; wipes all threads + queued syncs
  useCycleStore.getState().clearAll();
  usePantryStore.getState().clearAll();
  useStackStore.getState().clearAll();
  useBodyMapStore.getState().clearAll();
  useAllergyStore.getState().clearAll();
  useLabResultsStore.getState().clearAll();
  useIntegrationsStore.getState().clearAll();
}
