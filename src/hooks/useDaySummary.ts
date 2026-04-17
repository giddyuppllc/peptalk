/**
 * useDaySummary — aggregates all tracked data for a given date into a single snapshot.
 *
 * Reads from: useMealStore, useWorkoutStore, useDoseLogStore, useCheckinStore, useJournalStore.
 * Returns a unified DaySummary object that's flat and serializable (Supabase-ready).
 *
 * Usage:
 *   const summary = useDaySummary('2026-04-15');
 */

import { useMemo } from 'react';
import { useMealStore } from '../store/useMealStore';
import { useWorkoutStore } from '../store/useWorkoutStore';
import { useDoseLogStore } from '../store/useDoseLogStore';
import { useCheckinStore } from '../store/useCheckinStore';
import { useJournalStore } from '../store/useJournalStore';
import type { MealEntry } from '../types/fitness';

export interface DaySummaryMeal {
  id: string;
  mealType: string;
  foods: { name: string; calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number }[];
  totalCalories: number;
}

export interface DaySummaryWorkout {
  id: string;
  programName?: string;
  exerciseCount: number;
  duration?: number;
  completedAt?: string;
}

export interface DaySummaryDose {
  id: string;
  peptideId: string;
  dose: number;
  unit: string;
  route?: string;
  time?: string;
}

export interface DaySummaryCheckIn {
  mood?: number;
  energy?: number;
  sleep?: number;
  weight?: number;
  notes?: string;
  emotions?: string[];
  sideEffects?: string[];
}

export interface DaySummaryJournal {
  id: string;
  title: string;
  category: string;
  content: string;
}

export interface DaySummary {
  date: string;
  meals: DaySummaryMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  waterOz: number;
  workouts: DaySummaryWorkout[];
  doses: DaySummaryDose[];
  checkIn: DaySummaryCheckIn | null;
  journalEntries: DaySummaryJournal[];
  /** Quick boolean flags for the calendar UI */
  hasData: boolean;
  hasMeals: boolean;
  hasWorkout: boolean;
  hasDose: boolean;
  hasCheckIn: boolean;
}

export function useDaySummary(dateKey: string): DaySummary {
  const getMealsByDate = useMealStore((s) => s.getMealsByDate);
  const getWater = useMealStore((s) => s.getWater);
  const getLogsByDate = useWorkoutStore((s) => s.getLogsByDate);
  const getDosesByDate = useDoseLogStore((s) => s.getDosesByDate);
  const checkInEntries = useCheckinStore((s) => s.entries);
  const journalEntries = useJournalStore((s) => s.entries);

  return useMemo(() => {
    // Meals
    const rawMeals = getMealsByDate(dateKey);
    const meals: DaySummaryMeal[] = rawMeals.map((m: MealEntry) => ({
      id: m.id,
      mealType: m.mealType,
      foods: m.foods.map((f) => ({
        name: f.foodName,
        calories: f.calories,
        proteinGrams: f.proteinGrams,
        carbsGrams: f.carbsGrams,
        fatGrams: f.fatGrams,
      })),
      totalCalories: m.foods.reduce((sum, f) => sum + f.calories, 0),
    }));
    const totalCalories = meals.reduce((s, m) => s + m.totalCalories, 0);
    const totalProtein = rawMeals.reduce((s, m) => s + m.foods.reduce((fs, f) => fs + f.proteinGrams, 0), 0);
    const totalCarbs = rawMeals.reduce((s, m) => s + m.foods.reduce((fs, f) => fs + f.carbsGrams, 0), 0);
    const totalFat = rawMeals.reduce((s, m) => s + m.foods.reduce((fs, f) => fs + f.fatGrams, 0), 0);

    // Water
    const waterOz = getWater(dateKey);

    // Workouts
    const rawWorkouts = getLogsByDate(dateKey);
    const workouts: DaySummaryWorkout[] = rawWorkouts.map((w) => ({
      id: w.id,
      programName: w.workoutName,
      exerciseCount: w.sets?.length ?? 0,
      duration: w.durationMinutes,
      completedAt: w.completedAt,
    }));

    // Doses
    const rawDoses = getDosesByDate(dateKey);
    const doses: DaySummaryDose[] = rawDoses.map((d) => ({
      id: d.id,
      peptideId: d.peptideId,
      dose: d.amount,
      unit: d.unit,
      route: d.route,
      time: d.time,
    }));

    // Check-in
    const checkInEntry = checkInEntries.find((e) => e.date === dateKey);
    const checkIn: DaySummaryCheckIn | null = checkInEntry
      ? {
          mood: checkInEntry.mood,
          energy: checkInEntry.energy,
          sleep: checkInEntry.sleepQuality,
          weight: checkInEntry.weightLbs,
          notes: checkInEntry.notes,
          emotions: checkInEntry.emotionTags,
          sideEffects: checkInEntry.sideEffectTags,
        }
      : null;

    // Journal
    const dayJournal = journalEntries.filter((e) => e.date === dateKey);
    const journalSummary: DaySummaryJournal[] = dayJournal.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      content: e.content,
    }));

    const hasMeals = meals.length > 0;
    const hasWorkout = workouts.length > 0;
    const hasDose = doses.length > 0;
    const hasCheckIn = checkIn !== null;

    return {
      date: dateKey,
      meals,
      totalCalories,
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10,
      waterOz,
      workouts,
      doses,
      checkIn,
      journalEntries: journalSummary,
      hasData: hasMeals || hasWorkout || hasDose || hasCheckIn || journalSummary.length > 0 || waterOz > 0,
      hasMeals,
      hasWorkout,
      hasDose,
      hasCheckIn,
    };
  }, [dateKey, getMealsByDate, getWater, getLogsByDate, getDosesByDate, checkInEntries, journalEntries]);
}
