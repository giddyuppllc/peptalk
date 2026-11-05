/**
 * On-device answers to Aimee's own chip prompts.
 *
 * The chips (Centerpiece, Persistent Chip, FAB) send fixed prompts — "Show me
 * my trend for the last 14 days.", "What should I focus on tomorrow?" — and
 * they are the most common messages PepTalk receives (production chat_messages,
 * 2026-08-07..11-05: 102 × "What should I focus on tomorrow?", 78 × "What's new
 * in my data today?", 47 × the trend prompt). When the model is unreachable the
 * on-device bot keyword-matched them into unrelated replies (nootropic stack
 * suggestions, a profile dump). This answers each from the user's own logged
 * data and links the screen that does the job.
 *
 * Nothing here gives doses or protocols, and nothing is written: it reads the
 * context the chat already builds and offers navigation only.
 */
import type { BotAction, EnhancedBotContext } from '../types';
import { INTENT_PROMPTS, type AimeeIntent } from '../lib/aimeeIntentPrompts';
import { getPeptideById } from '../data/peptides';

export interface AppPromptReply {
  content: string;
  actions: BotAction[];
  quickReplies: string[];
}

const BY_PROMPT = new Map<string, AimeeIntent>(
  (Object.entries(INTENT_PROMPTS) as [AimeeIntent, string][])
    .filter(([, text]) => !!text)
    .map(([intent, text]) => [text.trim().toLowerCase(), intent]),
);

/** The chip intent whose prompt this message is, if any (exact, case-insensitive). */
export function matchAppPrompt(message: string): AimeeIntent | null {
  return BY_PROMPT.get(message.trim().toLowerCase()) ?? null;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

function within(dateStr: string | undefined, days: number): boolean {
  if (!dateStr) return false;
  const cutoff = dayKey(new Date(Date.now() - days * 86_400_000));
  return dateStr.slice(0, 10) >= cutoff;
}

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => typeof n === 'number' && Number.isFinite(n));
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
}

function peptideName(id: string): string {
  return getPeptideById(id)?.name ?? id;
}

function checkInSummary(ctx: EnhancedBotContext, days: number): string[] {
  const recent = (ctx.recentCheckIns ?? []).filter((c) => within(c.date, days));
  if (recent.length === 0) return [`No check-ins in the last ${days} days yet.`];
  const lines = [`**${recent.length} check-in${recent.length === 1 ? '' : 's'}** in the last ${days} days.`];
  const metrics: [string, number | null][] = [
    ['Mood', avg(recent.map((c) => Number(c.mood)))],
    ['Energy', avg(recent.map((c) => Number(c.energy)))],
    ['Sleep', avg(recent.map((c) => Number(c.sleepQuality)))],
    ['Recovery', avg(recent.map((c) => Number(c.recovery)))],
    ['Stress', avg(recent.map((c) => Number(c.stress)))],
  ];
  const shown = metrics.filter(([, v]) => v != null).map(([k, v]) => `${k} ${v}/5`);
  if (shown.length) lines.push(`Averages: ${shown.join(' · ')}`);
  return lines;
}

function doseSummary(ctx: EnhancedBotContext, days: number): string[] {
  const recent = (ctx.recentDoses ?? []).filter((d) => within(d.date, days));
  if (recent.length === 0) return [`No doses logged in the last ${days} days.`];
  const byPeptide = new Map<string, number>();
  for (const d of recent) byPeptide.set(d.peptideId, (byPeptide.get(d.peptideId) ?? 0) + 1);
  const list = [...byPeptide.entries()].map(([id, n]) => `${peptideName(id)} (${n})`).join(', ');
  return [`**${recent.length} dose log${recent.length === 1 ? '' : 's'}** in the last ${days} days: ${list}.`];
}

function activeProtocolLine(ctx: EnhancedBotContext): string | null {
  const active = (ctx.activeProtocols ?? []).filter((p) => (p as { isActive?: boolean }).isActive !== false);
  if (active.length === 0) return null;
  const names = active
    .map((p) => (p as { name?: string; peptideId?: string }).name ?? peptideName((p as { peptideId?: string }).peptideId ?? ''))
    .filter(Boolean)
    .slice(0, 4);
  return names.length ? `Active protocols: ${names.join(', ')}.` : null;
}

const act = (label: string, route: string, icon: string): BotAction => ({ label, route, icon });

export function respondAppPrompt(intent: AimeeIntent, ctx: EnhancedBotContext): AppPromptReply {
  const lines: string[] = [];
  const actions: BotAction[] = [];
  let quickReplies: string[] = ['Show me my trend for the last 14 days.', "What's new in my data today?"];

  switch (intent) {
    case 'show_trend':
    case 'activity_performance':
      lines.push('Here is your last 14 days:', '', ...checkInSummary(ctx, 14), ...doseSummary(ctx, 14));
      actions.push(act('Open my tracker', '/tracker', 'stats-chart-outline'));
      break;
    case 'whats_new':
      lines.push('Today and yesterday:', '', ...checkInSummary(ctx, 2), ...doseSummary(ctx, 2));
      actions.push(act('Daily check-in', '/(tabs)/check-in', 'create-outline'));
      break;
    case 'plan_tomorrow': {
      lines.push('For tomorrow:');
      lines.push('');
      const proto = activeProtocolLine(ctx);
      lines.push(proto ?? 'No active protocols on your calendar.');
      const recentCheck = (ctx.recentCheckIns ?? []).filter((c) => within(c.date, 7));
      const sleep = avg(recentCheck.map((c) => Number(c.sleepQuality)));
      if (sleep != null && sleep < 3) lines.push(`Your sleep has averaged ${sleep}/5 this week, so an earlier night is a good focus.`);
      lines.push('Your calendar shows what is scheduled, and a morning check-in keeps the trend accurate.');
      actions.push(act('Open calendar', '/(tabs)/calendar', 'calendar-outline'));
      quickReplies = ['Show me my trend for the last 14 days.', 'Build me a workout for tonight.'];
      break;
    }
    case 'tracker_overview':
    case 'weekly_summary':
    case 'activity_overview':
      lines.push('Your week so far:', '', ...checkInSummary(ctx, 7), ...doseSummary(ctx, 7));
      actions.push(act('Open my tracker', '/tracker', 'stats-chart-outline'));
      break;
    case 'doses_overview':
    case 'doses_tracker':
      lines.push(...doseSummary(ctx, 7));
      {
        const proto = activeProtocolLine(ctx);
        if (proto) lines.push(proto);
      }
      actions.push(act('Dose tracker', '/doses/tracker', 'list-outline'));
      break;
    case 'doses_side_effects': {
      const effects = (ctx.recentEffects ?? []).length;
      lines.push(
        effects
          ? `You have ${effects} side-effect note${effects === 1 ? '' : 's'} logged recently. The side-effects screen shows them by compound and day.`
          : 'No side effects logged recently. If something comes up, log it so the pattern is visible later.',
      );
      actions.push(act('Side effects', '/doses/side-effects', 'pulse-outline'));
      break;
    }
    case 'doses_calculator':
      lines.push(
        'The calculator does the vial math: pick the compound, enter the vial size and the water you add, and it converts an amount into syringe units. It does not choose an amount for you.',
      );
      actions.push(act('Open calculator', '/doses/calculator', 'calculator-outline'));
      break;
    case 'doses_stack_builder':
      lines.push('The stack builder checks every pair of compounds you add against the interaction data and flags conflicts before anything is scheduled.');
      actions.push(act('Stack builder', '/doses/stack-builder', 'layers-outline'));
      break;
    case 'doses_library':
      lines.push('The library has every compound with its research summary. Open two and use Compare to see them side by side.');
      actions.push(act('Peptide library', '/doses/library', 'library-outline'));
      break;
    case 'nutrition_overview':
    case 'water_check':
      lines.push('Your nutrition screen has today’s totals against your targets, including water.');
      actions.push(act('Nutrition', '/nutrition', 'nutrition-outline'));
      break;
    case 'log_meal':
      lines.push('Search a food, scan it, or say it out loud, and it is added to today.');
      actions.push(act('Log a meal', '/nutrition/food-search', 'add-circle-outline'));
      break;
    case 'plan_meals':
      lines.push('The meal planner builds the day around your protein target.');
      actions.push(act('Meal plan', '/nutrition/meal-plan', 'restaurant-outline'));
      break;
    case 'log_workout':
      lines.push('Log it from your workouts: pick the session, add sets and reps, and it lands on your calendar.');
      actions.push(act('Workouts', '/workouts', 'barbell-outline'));
      break;
    case 'build_workout':
      lines.push('The workout generator builds a session from your goal, equipment and time.');
      actions.push(act('Build a workout', '/workouts/generate', 'flash-outline'));
      break;
    case 'profile_appearance':
      lines.push('Appearance lets you pick the theme; Auto follows the look you chose at onboarding.');
      actions.push(act('Appearance', '/profile/appearance', 'color-palette-outline'));
      break;
    default:
      lines.push('Ask me about your data, a compound, or what to do next.');
  }

  return { content: lines.join('\n'), actions, quickReplies };
}

/**
 * A tap on Aimee's orb sends the screen's observation line itself ("79
 * peptides. Search by name…", "Last logged: retatrutide · 2.5 mg."). That is
 * screen copy, not a question — and it carried dose numbers, so the fallback
 * used to answer it with a dosing reference. Offer the useful next questions
 * instead.
 */
export function respondObservation(observation: string): AppPromptReply {
  const text = observation.trim().replace(/\s+/g, ' ');
  return {
    content: `${text ? `“${text}”\n\n` : ''}Want me to dig into this? Pick a question below, or type your own.`,
    actions: [],
    quickReplies: [
      'Show me my trend for the last 14 days.',
      "What's new in my data today?",
      'What should I focus on tomorrow?',
    ],
  };
}
