/**
 * Planner Service — AI-powered health plan generation for PepTalk.
 *
 * Takes user goals, profile, and current programs, then generates
 * a structured HealthPlan via the Grok AI service or falls back
 * to a template-based plan.
 */

import type { GoalType, HealthPlan, HealthPlanItem , HealthProfile } from '../types';
import { generateHealthPlan, isAIAvailable } from './llmService';
import { usePlanStore } from '../store/usePlanStore';
import { getGoalLabel } from '../constants/goals';

// ---------------------------------------------------------------------------
// Template schedules for offline plan generation
// ---------------------------------------------------------------------------

interface PlanTemplate {
  goals: GoalType[];
  items: Omit<HealthPlanItem, 'id' | 'completed'>[];
}

const TEMPLATES: Record<string, PlanTemplate> = {
  weight_loss: {
    goals: ['weight_loss'],
    items: [
      // Mon/Wed/Fri — Cardio + strength
      { dayOfWeek: 1, time: '07:00', type: 'workout', title: 'Cardio + Upper Body', description: '30 min HIIT cardio followed by upper body strength circuit' },
      { dayOfWeek: 3, time: '07:00', type: 'workout', title: 'Cardio + Lower Body', description: '30 min HIIT cardio followed by lower body strength circuit' },
      { dayOfWeek: 5, time: '07:00', type: 'workout', title: 'Full Body Circuit', description: 'Full body metabolic conditioning workout' },
      // Tue/Thu — Light activity
      { dayOfWeek: 2, time: '07:00', type: 'workout', title: 'Active Recovery', description: '30-45 min walk, yoga, or light stretching' },
      { dayOfWeek: 4, time: '07:00', type: 'workout', title: 'Active Recovery', description: '30-45 min walk, yoga, or light stretching' },
      // Daily meals
      { dayOfWeek: 1, time: '08:00', type: 'meal', title: 'High Protein Breakfast', description: 'Aim for 30-40g protein, keep carbs moderate' },
      { dayOfWeek: 1, time: '12:00', type: 'meal', title: 'Balanced Lunch', description: 'Lean protein, vegetables, complex carbs' },
      { dayOfWeek: 1, time: '18:00', type: 'meal', title: 'Light Dinner', description: 'Protein + vegetables, minimize starchy carbs at night' },
      // Semaglutide if applicable
      { dayOfWeek: 0, time: '09:00', type: 'protocol', title: 'Weekly Protocol Review', description: 'Review dose timing, log any side effects, check progress' },
    ],
  },

  muscle_gain: {
    goals: ['muscle_gain'],
    items: [
      // Push/Pull/Legs
      { dayOfWeek: 1, time: '06:30', type: 'workout', title: 'Push Day (Chest/Shoulders/Triceps)', description: 'Bench press, OHP, dips, lateral raises, tricep work' },
      { dayOfWeek: 2, time: '06:30', type: 'workout', title: 'Pull Day (Back/Biceps)', description: 'Deadlift, rows, pull-ups, curls, face pulls' },
      { dayOfWeek: 3, time: '06:30', type: 'workout', title: 'Leg Day', description: 'Squats, leg press, RDLs, leg curls, calf raises' },
      { dayOfWeek: 4, time: '10:00', type: 'workout', title: 'Rest / Active Recovery', description: 'Light stretching, foam rolling, walk' },
      { dayOfWeek: 5, time: '06:30', type: 'workout', title: 'Upper Body Hypertrophy', description: 'Higher rep ranges, isolation focus, supersets' },
      { dayOfWeek: 6, time: '06:30', type: 'workout', title: 'Lower Body Hypertrophy', description: 'Higher rep ranges, unilateral work, glute focus' },
      // Nutrition
      { dayOfWeek: 1, time: '07:30', type: 'meal', title: 'Post-Workout Meal', description: 'High protein + carbs within 60 min of training' },
      { dayOfWeek: 1, time: '21:00', type: 'meal', title: 'Pre-Sleep Protein', description: 'Casein shake or cottage cheese for overnight recovery' },
      // GH peptides
      { dayOfWeek: 1, time: '22:00', type: 'protocol', title: 'Evening Protocol (if applicable)', description: 'GH peptides best taken fasted before bed' },
    ],
  },

  recovery: {
    goals: ['recovery'],
    items: [
      { dayOfWeek: 1, time: '07:00', type: 'workout', title: 'Light Mobility Work', description: '20 min stretching, foam rolling, joint circles' },
      { dayOfWeek: 2, time: '07:00', type: 'protocol', title: 'BPC-157 / TB-500 Dose', description: 'Administer on empty stomach, wait 20 min before eating' },
      { dayOfWeek: 3, time: '07:00', type: 'workout', title: 'Gentle Yoga / Walking', description: '30 min low-impact movement for circulation' },
      { dayOfWeek: 4, time: '07:00', type: 'protocol', title: 'BPC-157 / TB-500 Dose', description: 'Consistent timing supports tissue repair' },
      { dayOfWeek: 5, time: '07:00', type: 'workout', title: 'Light Mobility Work', description: '20 min stretching, foam rolling' },
      { dayOfWeek: 6, time: '07:00', type: 'protocol', title: 'BPC-157 / TB-500 Dose', description: 'Continue daily or EOD protocol' },
      { dayOfWeek: 0, time: '09:00', type: 'checkin', title: 'Weekly Recovery Assessment', description: 'Rate pain levels, range of motion, and overall recovery progress' },
    ],
  },

  general_wellness: {
    goals: ['general_wellness'],
    items: [
      { dayOfWeek: 1, time: '07:00', type: 'checkin', title: 'Morning Check-In', description: 'Log mood, energy, sleep, and any symptoms' },
      { dayOfWeek: 1, time: '07:30', type: 'workout', title: 'Movement Session', description: '30-45 min of preferred exercise' },
      { dayOfWeek: 3, time: '07:30', type: 'workout', title: 'Movement Session', description: '30-45 min of preferred exercise' },
      { dayOfWeek: 5, time: '07:30', type: 'workout', title: 'Movement Session', description: '30-45 min of preferred exercise' },
      { dayOfWeek: 0, time: '18:00', type: 'custom', title: 'Weekly Reflection', description: 'Journal about your week, progress, and goals for next week' },
    ],
  },
};

// Add daily check-ins to any template
function addDailyCheckIns(items: Omit<HealthPlanItem, 'id' | 'completed'>[]): Omit<HealthPlanItem, 'id' | 'completed'>[] {
  const hasCheckin = (day: number) => items.some(i => i.dayOfWeek === day && i.type === 'checkin');
  const result = [...items];
  for (let d = 0; d < 7; d++) {
    if (!hasCheckin(d)) {
      result.push({
        dayOfWeek: d,
        time: '07:00',
        type: 'checkin',
        title: 'Morning Check-In',
        description: 'Log mood, energy, and sleep quality',
      });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a health plan using AI or templates.
 * Returns the created plan.
 */
export async function createHealthPlan(params: {
  goals: GoalType[];
  healthProfile: HealthProfile | null;
  currentPrograms: string[];
  durationWeeks?: number;
}): Promise<HealthPlan> {
  const { goals, healthProfile, currentPrograms, durationWeeks = 4 } = params;
  const store = usePlanStore.getState();
  const duration = `${durationWeeks} weeks`;

  // Build profile summary for AI
  const profileParts: string[] = [];
  if (healthProfile) {
    if (healthProfile.biologicalSex) profileParts.push(healthProfile.biologicalSex);
    if (healthProfile.dateOfBirth) {
      const age = Math.floor((Date.now() - new Date(healthProfile.dateOfBirth).getTime()) / 31557600000);
      profileParts.push(`age ${age}`);
    }
    if (healthProfile.bodyMetrics.weightLbs) profileParts.push(`${healthProfile.bodyMetrics.weightLbs} lbs`);
    if (healthProfile.lifestyle.activityLevel) profileParts.push(`activity: ${healthProfile.lifestyle.activityLevel}`);
    if (healthProfile.medical.conditions.length > 0) {
      profileParts.push(`conditions: ${healthProfile.medical.conditions.join(', ')}`);
    }
  }

  const goalLabels = goals.map(g => getGoalLabel(g));
  const planName = `${goalLabels.slice(0, 2).join(' & ')} Plan`;

  // Try AI generation first
  if (isAIAvailable()) {
    try {
      const aiText = await generateHealthPlan({
        goals: goalLabels,
        profile: profileParts.join(', ') || 'Not provided',
        currentPrograms,
        duration,
      });

      if (aiText) {
        return store.createPlanFromAI({
          name: planName,
          goals,
          durationWeeks,
          rawPlanText: aiText,
        });
      }
    } catch {
      // Fall through to template
    }
  }

  // Fallback: template-based plan
  const primaryGoal = goals[0] ?? 'general_wellness';
  const template = TEMPLATES[primaryGoal] ?? TEMPLATES.general_wellness;
  const schedule = addDailyCheckIns(template.items);

  return store.createPlan({
    name: planName,
    goals,
    durationWeeks,
    schedule,
    aiGenerated: false,
  });
}

/**
 * Get a quick summary of the active plan for display.
 */
export function getPlanSummary(): string | null {
  const { activePlan } = usePlanStore.getState();
  if (!activePlan) return null;

  const totalItems = activePlan.schedule.length;
  const completed = activePlan.schedule.filter(i => i.completed).length;
  const workouts = activePlan.schedule.filter(i => i.type === 'workout').length;
  const meals = activePlan.schedule.filter(i => i.type === 'meal').length;
  const protocols = activePlan.schedule.filter(i => i.type === 'protocol').length;

  const parts = [`**${activePlan.name}**`];
  parts.push(`${completed}/${totalItems} items completed this week`);

  const breakdown: string[] = [];
  if (workouts > 0) breakdown.push(`${workouts} workouts`);
  if (meals > 0) breakdown.push(`${meals} meals`);
  if (protocols > 0) breakdown.push(`${protocols} protocol items`);
  if (breakdown.length > 0) parts.push(`Schedule: ${breakdown.join(', ')}`);

  return parts.join('\n');
}
