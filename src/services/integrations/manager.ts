/**
 * Integration manager — single entry point for UI to list adapters,
 * connect / disconnect, and trigger syncs.
 */

import type { BiomarkerAdapter } from './types';
import { healthKitAdapter } from './healthKitAdapter';
import { healthConnectAdapter } from './healthConnectAdapter';
import { ouraAdapter } from './ouraAdapter';
import { whoopAdapter } from './whoopAdapter';
import type { BiomarkerSource } from '../../types/cycle';

export const ADAPTERS: BiomarkerAdapter[] = [
  healthKitAdapter,
  healthConnectAdapter,
  ouraAdapter,
  whoopAdapter,
];

export function getAdapter(source: BiomarkerSource): BiomarkerAdapter | undefined {
  return ADAPTERS.find((a) => a.source === source);
}

export function availableAdapters(): BiomarkerAdapter[] {
  return ADAPTERS.filter((a) => a.available());
}
