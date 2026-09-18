/**
 * App Review 5.1.2 — without aiDataConsent, no health data goes to the AI
 * provider. Enforced on the client (buildServerContext) AND on the server (both
 * prompt builders, and the stream function's data-reading tools), so a stale or
 * tampered client cannot override it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  PERSONAL_CONTEXT_FIELDS as CLIENT_FIELDS,
  applyAiDataConsent as clientApply,
} from '../aiDataConsent';
import {
  PERSONAL_CONTEXT_FIELDS as SERVER_FIELDS,
  applyAiDataConsent as serverApply,
  toolsAllowedForConsent,
  toolRequiresAiDataConsent,
} from '../../../supabase/functions/_shared/aimeeConsent';

const ROOT = path.join(__dirname, '..', '..', '..');

const FULL = {
  tier: 'pro',
  hasConsent: true,
  simpleMode: false,
  currentRoute: '/peptalk',
  activeProtocolSummary: 'BPC-157',
  recentDosesSummary: '3 doses in the last 14 days',
  healthAlertsSummary: '1 active health alert',
  healthProfileSummary: 'female, age 34, weight 150 lb, pregnant',
  biometricsSummary: 'Last 7 days: avg HRV 40ms',
  labResultsSummary: 'LDL 160',
  workoutSummary: '3 sessions',
  nutritionSummary: '~1800 cal/day',
  bodyTrendSummary: 'Weight -2.0 lb',
  selfStatedGoal: 'lose weight',
  workoutDaysPerWeek: 4,
};

describe.each([
  ['client', clientApply],
  ['server', serverApply],
])('%s applyAiDataConsent', (_label, apply) => {
  it('passes everything through with consent', () => {
    expect(apply(FULL)).toEqual(FULL);
  });

  it.each([false, undefined, 'true', 1])('strips every personal field when hasConsent is %p', (flag) => {
    const out = apply({ ...FULL, hasConsent: flag as any }) as Record<string, unknown>;
    for (const f of CLIENT_FIELDS) expect(out).not.toHaveProperty(f);
    expect(out.hasConsent).toBe(false);
    expect(out.tier).toBe('pro');
    expect(out.currentRoute).toBe('/peptalk');
    expect(JSON.stringify(out)).not.toMatch(/pregnant|LDL|HRV|BPC|lose weight|1800/);
  });

  it('does not mutate its input', () => {
    const input = { ...FULL, hasConsent: false };
    apply(input);
    expect(input.labResultsSummary).toBe('LDL 160');
  });
});

describe('client and server strip the same fields', () => {
  it('lists match exactly', () => {
    expect([...CLIENT_FIELDS].sort()).toEqual([...SERVER_FIELDS].sort());
  });

  it.each([
    'src/services/llmService.ts',
    'supabase/functions/aimee-chat/_prompt.ts',
    'supabase/functions/aimee-chat-stream/_prompt.ts',
  ])('%s declares no personal context field the lists miss', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const iface = src.match(/interface AimeeServerContext \{([\s\S]*?)\n\}/);
    expect(iface).not.toBeNull();
    const fields = [...iface![1].matchAll(/^\s*(\w+)\??:/gm)].map((m) => m[1]);
    const nonPersonal = new Set(['tier', 'hasConsent', 'simpleMode', 'currentRoute']);
    const unlisted = fields.filter((f) => !nonPersonal.has(f) && !(SERVER_FIELDS as readonly string[]).includes(f));
    expect(unlisted).toEqual([]);
  });
});

describe('server tools that read stored health records', () => {
  const tools = ['suggest_workout', 'summarize_pattern', 'get_user_metrics', 'log_water'].map((name) => ({
    type: 'function',
    function: { name },
  }));

  it('are withheld without consent', () => {
    expect(toolsAllowedForConsent(tools, false).map((t) => t.function.name)).toEqual(['suggest_workout', 'log_water']);
  });

  it('are offered with consent', () => {
    expect(toolsAllowedForConsent(tools, true)).toHaveLength(4);
  });

  it('every consent-gated tool exists in AIMEE_TOOLS (a rename would silently un-gate it)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/aimee-chat-stream/_tools.ts'), 'utf8');
    for (const name of ['summarize_pattern', 'get_user_metrics']) {
      expect(toolRequiresAiDataConsent(name)).toBe(true);
      expect(src).toContain(`name: '${name}'`);
    }
  });
});

describe('the builders are wired to the consent filter', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each(['supabase/functions/aimee-chat/_prompt.ts', 'supabase/functions/aimee-chat-stream/_prompt.ts'])(
    '%s filters the context before assembling any user block',
    (rel) => {
      const code = strip(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      const fn = code.slice(code.indexOf('export function buildAimeeSystemPrompt('));
      expect(fn).toMatch(/^export function buildAimeeSystemPrompt\(rawContext: AimeeServerContext\): string \{\s*const context = applyAiDataConsent\(rawContext\);/);
      // rawContext is used exactly once — nothing reads the unfiltered object.
      expect(fn.slice(0, fn.indexOf('\n}\n') > 0 ? fn.indexOf('\n}\n') : undefined).split('rawContext').length - 1).toBe(2);
    },
  );

  it('aimee-chat-stream withholds and refuses health-reading tools without consent', () => {
    const code = strip(fs.readFileSync(path.join(ROOT, 'supabase/functions/aimee-chat-stream/index.ts'), 'utf8'));
    expect(code).toMatch(/tools: args\.canUseTools \? toolsAllowedForConsent\(AIMEE_TOOLS, args\.hasConsent\) : \[\]/);
    expect(code).toMatch(/hasConsent: safeContext\.hasConsent === true/);
    expect(code).toMatch(/safeContext\.hasConsent !== true && toolRequiresAiDataConsent\(tc\.name\)/);
    expect(code).not.toMatch(/tools: args\.canUseTools \? AIMEE_TOOLS : \[\]/);
  });
});

describe('client buildServerContext', () => {
  const mockConsent = { value: false };

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../services/privacyGuard', () => ({
      sanitizeForLLM: () => ({ hasConsent: mockConsent.value, systemContext: '' }),
    }));
    jest.doMock('../../services/supabase', () => ({ supabase: {} }));
    jest.doMock('../../services/telemetry', () => ({ captureException: () => {} }));
    jest.doMock('../../utils/ensureAiConsent', () => ({ ensureAiConsent: async () => true }));
  });

  const ctx: any = {
    simpleMode: false,
    activeProtocols: [{ name: 'BPC-157' }],
    recentDoses: [{ peptideName: 'BPC-157', date: '2026-09-14' }],
    healthAlerts: [{ level: 'warn', title: 'x' }],
    healthProfile: {
      biologicalSex: 'female',
      age: 34,
      pregnant: true,
      bodyMetrics: { weightLbs: 150, heightInches: 65 },
    },
  };

  it('sends no health data without consent', () => {
    mockConsent.value = false;
    const { buildServerContext } = require('../../services/llmService');
    const out = buildServerContext(ctx);
    expect(out).toEqual({ hasConsent: false, simpleMode: false });
  });

  it('sends the summaries with consent', () => {
    mockConsent.value = true;
    const { buildServerContext } = require('../../services/llmService');
    const out = buildServerContext(ctx);
    expect(out.hasConsent).toBe(true);
    expect(out.activeProtocolSummary).toBe('BPC-157');
    expect(out.healthProfileSummary).toMatch(/pregnant/);
    expect(out.recentDosesSummary).toMatch(/1 doses/);
  });
});
