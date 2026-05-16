/**
 * SpotlightTour — interactive first-run walkthrough with real element highlighting.
 *
 * Replaces the old modal-card TutorialOverlay. Instead of covering the
 * screen with a floating card, this component:
 *
 *   1. Reads the current step from useTutorialStore
 *   2. If the step targets a different screen, navigates there via expo-router
 *   3. Reads the measured target position from the tour registry
 *   4. Draws 4 dark "bands" around the target element, leaving the target visible
 *   5. Renders a tooltip card above or below the target with title + body + Next/Skip
 *
 * Design rationale:
 *   - 4-band dimming is simpler and more reliable than SVG masks across
 *     iOS/Android and doesn't require adding react-native-svg as a tour dep
 *   - Target measurement races are handled by a 500ms grace window: if the
 *     target isn't registered yet when a step fires, the tour shows a
 *     full-screen dim and polls until the rect appears
 *   - Tier-aware steps are filtered up-front in TOUR_SCRIPTS[variant]
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTutorialStore, type TargetRect, type TourVariant } from '../../store/useTutorialStore';
import { useTier } from '../../hooks/useFeatureGate';
import { TOUR_SCRIPTS, type TourStep } from '../../config/tourSteps';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const HIGHLIGHT_PADDING = 10;
const TOOLTIP_GAP = 14;

export function SpotlightTour() {
  const router = useRouter();
  const pathname = usePathname();
  const tier = useTier();

  const tourActive = useTutorialStore((s) => s.tourActive);
  const currentStep = useTutorialStore((s) => s.currentStep);
  const activeTour = useTutorialStore((s) => s.activeTour);
  const targetRects = useTutorialStore((s) => s.targetRects);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const completeTour = useTutorialStore((s) => s.completeTour);
  const skipTour = useTutorialStore((s) => s.skipTour);

  // Filter steps by tier — skip any step requiring a tier the user doesn't have
  const steps: TourStep[] = useMemo(() => {
    const raw = TOUR_SCRIPTS[activeTour] ?? TOUR_SCRIPTS.intro;
    return raw.filter((s) => {
      if (s.requiredTier === 'pro' && tier !== 'pro') return false;
      if (s.requiredTier === 'plus' && tier === 'free') return false;
      return true;
    });
  }, [activeTour, tier]);

  const step = steps[currentStep];
  const isLast = currentStep >= steps.length - 1;

  // When currentStep changes, navigate to the step's screen if we're not there yet
  const navigatingRef = useRef(false);
  useEffect(() => {
    if (!tourActive || !step) return;
    if (step.screen && step.screen !== pathname && !navigatingRef.current) {
      navigatingRef.current = true;
      // Delay slightly so the previous render settles
      const timer = setTimeout(() => {
        router.push(step.screen as any);
        navigatingRef.current = false;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [tourActive, currentStep, step, pathname, router]);

  // The measured rect for the current target (may be undefined during a navigation race)
  const rect: TargetRect | undefined = step?.targetKey ? targetRects[step.targetKey] : undefined;

  // Fallback: if the step has no target (welcome step), just show a centered card
  const hasTarget = !!step?.targetKey && !!rect;

  if (!tourActive || !step) return null;

  // GUARD — when the spotlight has a targetKey but the rect hasn't been
  // measured yet (the 200ms after the step navigates to a new screen and
  // before useTourTarget runs its measure), the layout fell back to
  // CenteredLayout which still rendered an absoluteFill View capturing
  // every tap behind a near-invisible dim. That's the freeze symptom
  // TestFlight users reported. Render NOTHING during the unmeasured
  // window — the user can interact with the screen normally and the
  // tour appears as soon as the rect lands.
  if (step.targetKey && !rect) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(150)}
        style={StyleSheet.absoluteFill}
        // box-none lets touches pass through this wrapper. Each layout
        // below controls its own touch capture explicitly so the tooltip
        // is interactive but the dim isn't a screen-wide tap trap.
        pointerEvents="box-none"
      >
        {hasTarget ? (
          <SpotlightLayout rect={rect!} step={step} stepIndex={currentStep} totalSteps={steps.length} onNext={isLast ? completeTour : nextStep} onSkip={skipTour} isLast={isLast} />
        ) : (
          <CenteredLayout step={step} stepIndex={currentStep} totalSteps={steps.length} onNext={isLast ? completeTour : nextStep} onSkip={skipTour} isLast={isLast} />
        )}
      </Animated.View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Spotlight layout — target rect with 4 dark bands + tooltip
// ═══════════════════════════════════════════════════════════════════════════

interface LayoutProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  isLast: boolean;
}

interface SpotlightLayoutProps extends LayoutProps {
  rect: TargetRect;
}

function SpotlightLayout({ rect, step, stepIndex, totalSteps, onNext, onSkip, isLast }: SpotlightLayoutProps) {
  // Expand the rect by padding for a softer highlight area
  const highlightX = Math.max(0, rect.x - HIGHLIGHT_PADDING);
  const highlightY = Math.max(0, rect.y - HIGHLIGHT_PADDING);
  const highlightW = rect.width + HIGHLIGHT_PADDING * 2;
  const highlightH = rect.height + HIGHLIGHT_PADDING * 2;

  // Decide tooltip position — below target unless target is in bottom half
  const tooltipAbove = rect.y + rect.height / 2 > SCREEN_H / 2;
  const tooltipY = tooltipAbove
    ? Math.max(60, highlightY - TOOLTIP_GAP - 210) // 210 ~= tooltip height estimate
    : highlightY + highlightH + TOOLTIP_GAP;

  return (
    // box-none — the wrapping View itself doesn't eat touches. Each
    // dim band sets pointerEvents="none" already; the tooltip is the
    // only interactive surface. Without this, the absoluteFill View
    // intercepted every tap on the screen — invisible tap trap.
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* 4 dark bands forming a "hole" around the target */}
      {/* Top band */}
      <View style={[styles.dimBand, { top: 0, left: 0, right: 0, height: highlightY }]} pointerEvents="none" />
      {/* Bottom band */}
      <View
        style={[styles.dimBand, { top: highlightY + highlightH, left: 0, right: 0, bottom: 0 }]}
        pointerEvents="none"
      />
      {/* Left band */}
      <View
        style={[
          styles.dimBand,
          { top: highlightY, left: 0, width: highlightX, height: highlightH },
        ]}
        pointerEvents="none"
      />
      {/* Right band */}
      <View
        style={[
          styles.dimBand,
          {
            top: highlightY,
            left: highlightX + highlightW,
            right: 0,
            height: highlightH,
          },
        ]}
        pointerEvents="none"
      />

      {/* Glowing border around target */}
      <View
        style={[
          styles.highlightBorder,
          {
            top: highlightY,
            left: highlightX,
            width: highlightW,
            height: highlightH,
          },
        ]}
        pointerEvents="none"
      />

      {/* Tooltip card */}
      <Animated.View
        key={`step-${stepIndex}`}
        entering={FadeIn.duration(250).delay(100)}
        style={[styles.tooltip, { top: tooltipY }]}
      >
        <TooltipCard
          step={step}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          onNext={onNext}
          onSkip={onSkip}
          isLast={isLast}
        />
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Centered layout — no target, card floats in the middle
// ═══════════════════════════════════════════════════════════════════════════

function CenteredLayout({ step, stepIndex, totalSteps, onNext, onSkip, isLast }: LayoutProps) {
  return (
    // box-none — same fix as SpotlightLayout. The tooltip needs taps,
    // the dim layer is pointerEvents=none, and the wrapping View must
    // not silently eat everything else.
    <View style={[StyleSheet.absoluteFill, styles.centered]} pointerEvents="box-none">
      <View style={styles.fullDim} pointerEvents="none" />
      <Animated.View key={`step-${stepIndex}`} entering={FadeIn.duration(250)}>
        <TooltipCard
          step={step}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
          onNext={onNext}
          onSkip={onSkip}
          isLast={isLast}
        />
      </Animated.View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared tooltip card
// ═══════════════════════════════════════════════════════════════════════════

interface TooltipCardProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
  isLast: boolean;
}

function TooltipCard({ step, stepIndex, totalSteps, onNext, onSkip, isLast }: TooltipCardProps) {
  return (
    <View style={styles.card}>
      {/* Top row: step counter + skip */}
      <View style={styles.topRow}>
        <Text style={styles.stepCounter}>
          {stepIndex + 1} of {totalSteps}
        </Text>
        <TouchableOpacity onPress={onSkip} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Icon + title */}
      <View style={styles.titleRow}>
        <LinearGradient colors={['#E89672', '#F2D8D5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconCircle}>
          <Ionicons name={step.icon as any} size={18} color="#fff" />
        </LinearGradient>
        <Text style={styles.title} numberOfLines={2}>
          {step.title}
        </Text>
      </View>

      <Text style={styles.body}>{step.body}</Text>

      {/* Progress dots + Next */}
      <View style={styles.bottomRow}>
        <View style={styles.dots}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === stepIndex ? '#E89672' : 'rgba(0,0,0,0.15)',
                  width: i === stepIndex ? 18 : 5,
                },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity onPress={onNext} activeOpacity={0.85}>
          <LinearGradient
            colors={['#E89672', '#F2D8D5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextBtn}
          >
            <Text style={styles.nextText}>{isLast ? "Let's go" : 'Next'}</Text>
            <Ionicons name="arrow-forward" size={14} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fullDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 20, 30, 0.78)',
  },
  dimBand: {
    position: 'absolute',
    backgroundColor: 'rgba(20, 20, 30, 0.72)',
  },
  highlightBorder: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E89672',
    shadowColor: '#E89672',
    shadowOpacity: 0.6,
    shadowRadius: 12,
  },
  tooltip: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  stepCounter: {
    fontSize: 10,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  skipText: {
    fontSize: 12,
    fontFamily: 'DMSans-SemiBold',
    color: '#6B7280',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontFamily: 'Playfair-Black',
    color: '#2D2D2D',
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  body: {
    fontSize: 13,
    fontFamily: 'DMSans-Regular',
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  nextText: {
    fontSize: 13,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
    letterSpacing: 0.3,
  },
});

export default SpotlightTour;
