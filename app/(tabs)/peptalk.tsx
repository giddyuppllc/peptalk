import React, { useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { ChatBubble, TypingIndicator } from '../../src/components/ChatBubble';
import { AimeePendingActionCard } from '../../src/components/AimeePendingActionCard';
import { AimeeToolResultCard } from '../../src/components/AimeeToolResultCard';
import { getAimeeNudges } from '../../src/services/aimeeNudges';
import { PepTalkCharacter } from '../../src/components/PepTalkCharacter';
import { AimeeDnaIcon } from '../../src/components/AimeeDnaIcon';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { ChatHistoryDrawer } from '../../src/components/ChatHistoryDrawer';
import { CoachMark } from '../../src/components/tutorial/CoachMark';
import { tapMedium } from '../../src/utils/haptics';
import { useChatStore } from '../../src/store/useChatStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useStackStore } from '../../src/store/useStackStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useMealStore } from '../../src/store/useMealStore';
import { useWorkoutStore } from '../../src/store/useWorkoutStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { PEPTIDES } from '../../src/data/peptides';
import { generateLocalBotResponse } from '../../src/services/peptalkBot';
import {
  generateAIResponse,
  generateAIResponseStream,
  isAIAvailable,
} from '../../src/services/llmService';
import { canSendToCloud } from '../../src/services/privacyGuard';
import { generateCorrelationInsights, buildCorrelationSummaryForBot } from '../../src/services/watchCorrelationService';
import { getPeptideById } from '../../src/data/peptides';
import { useJournalStore } from '../../src/store/useJournalStore';
import { ChatMessage, EnhancedBotContext, GoalType } from '../../src/types';
import { getGoalLabel } from '../../src/constants/goals';
import {
  Colors,
  Fonts,
  FontSizes,
  Spacing,
  BorderRadius,
  Gradients,
} from '../../src/constants/theme';
import { useTheme } from '../../src/hooks/useTheme';
import { useSectionAccent } from '../../src/hooks/useSectionAccent';
import { useTourTarget } from '../../src/hooks/useTourTarget';

/** How long to wait for Aimee's response before giving up and falling back
 *  to the local bot. Longer than the LLM's own timeout so we don't race
 *  it, short enough that a truly hung network doesn't leave the typing
 *  indicator spinning forever. */
const AIMEE_RESPONSE_TIMEOUT_MS = 35_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Allowlist guard for navigation paths supplied by the Aimee edge fn
 * (navigate / open_dosing_calculator client_actions). Even though the
 * server already maps known screen names through SCREEN_TO_PATH, this
 * second check refuses any unexpected path so a prompt-injection
 * escape can't land users on /admin/* or any /dev-* route. Allow:
 *   - / (root tab group)
 *   - /(tabs)/<one of the visible tabs>
 *   - /calculators/<screen>
 *   - /peptide/<id>
 *   - /subscription
 *   - /auth (sign-in / sign-up)
 */
function isAllowedNavigationPath(path: string): boolean {
  if (typeof path !== 'string' || path.length > 200) return false;
  if (path.startsWith('//') || path.includes('..')) return false;
  // No /admin/, no /dev-, no internal-only routes.
  if (/^\/?(admin|dev-)/.test(path)) return false;
  const allowed = [
    /^\/?$/,
    /^\/?\(tabs\)\/?$/,
    /^\/?\(tabs\)\/(home|my-stacks|peptalk|nutrition|workouts|community|check-in|calendar|profile|stack-builder)(\?|\/|$)/,
    /^\/?calculators(\/[\w-]+)?(\?.*)?$/,
    /^\/?peptide\/[\w-]+(\?.*)?$/,
    /^\/?subscription(\?.*)?$/,
    /^\/?auth(\?.*)?$/,
    /^\/?learn(\/.*)?$/,
    /^\/?nutrition(\/[\w-]+)*(\?.*)?$/,
    /^\/?workouts(\/[\w-]+)*(\?.*)?$/,
  ];
  return allowed.some((rx) => rx.test(path));
}

/* ─── Journal Toast Component ────────────────────────────────────── */

const JournalToast: React.FC = () => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      300,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) }),
    );
  }, [opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const t = useTheme();
  const accent = useSectionAccent();
  return (
    <Animated.View style={[styles.journalToast, animStyle]}>
      <LinearGradient
        colors={[`${accent.deep}20`, `${accent.pastel}12`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.journalToastBg}
      >
        <Ionicons name="journal-outline" size={14} color={accent.deep} />
        <Text style={[styles.journalToastText, { color: accent.deep }]}>Saved to journal</Text>
      </LinearGradient>
    </Animated.View>
  );
};

/* ─── Main Screen ────────────────────────────────────────────────── */

export default function PepTalkScreen() {
  const t = useTheme();
  const accent = useSectionAccent();
  const router = useRouter();
  const aimeeInputRef = useTourTarget('aimee_chat_input');
  const { prefill, message: prefillMessage } = useLocalSearchParams<{
    prefill?: string;
    message?: string;
  }>();
  // Split selectors — destructuring the full store subscribes to every change,
  // causing the chat screen to re-render on any store update. At ~200 messages
  // this turns into O(n) wasted work per keystroke. Select each slice we need.
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const profile = useOnboardingStore((s) => s.profile);
  const checkIns = useCheckinStore((s) => s.entries);
  const currentStack = useStackStore((s) => s.currentStack);
  const savedStacks = useStackStore((s) => s.savedStacks);
  const doses = useDoseLogStore((s) => s.doses);
  const protocols = useDoseLogStore((s) => s.protocols);
  const alerts = useDoseLogStore((s) => s.alerts);
  const healthProfile = useHealthProfileStore((s) => s.profile);
  const addJournalEntry = useJournalStore((s) => s.addEntry);
  // Aimee write-actions land in these local stores; sync-up to Supabase
  // is handled inside each store's existing add* method via syncRecord.
  const logDoseAction = useDoseLogStore((s) => s.logDose);
  const addMealAction = useMealStore((s) => s.addMeal);
  const addPlannedWorkoutAction = useWorkoutStore((s) => s.addPlannedLog);

  const [inputText, setInputText] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // "Keep it simple" — when on, Aimee replies in plain language with short
  // paragraphs and no headers/bullets. Tester request from Jamie.
  const [simpleMode, setSimpleMode] = React.useState(false);
  const prefillHandled = useRef(false);
  const messageHandled = useRef(false);
  const flatListRef = useRef<FlatList>(null);
  // Abort controller for the in-flight Aimee SSE stream. When the chat
  // screen unmounts (user navigates away mid-response), we abort the
  // fetch so late client_action events don't fire router.push / store
  // writes on a dead component.
  const streamAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  // Pills only show on empty state — once any message exists, hide forever
  const showPills = messages.length === 0;

  // Handle prefill from topic screens ("Ask PepTalk" button)
  useEffect(() => {
    if (prefill && !prefillHandled.current) {
      prefillHandled.current = true;
      setInputText(prefill);
    }
  }, [prefill]);

  // Build enhanced context for the bot (includes dose data)
  const buildContext = useCallback((): EnhancedBotContext => {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoff = fourteenDaysAgo.toISOString().slice(0, 10);

    const activeProtos = (protocols ?? []).filter((p) => p.isActive);

    // Generate peptide ↔ Watch biometric correlations
    const insights = generateCorrelationInsights(
      activeProtos,
      checkIns ?? [],
      (id) => getPeptideById(id)?.name ?? id,
    );
    const correlationSummary = buildCorrelationSummaryForBot(insights);

    const ctx: EnhancedBotContext & { _correlationSummary?: string } = {
      userProfile: profile,
      recentCheckIns: (checkIns ?? []).slice(0, 14),
      currentStack,
      savedStackNames: (savedStacks ?? [])
        .filter((s) => !s.isCurated)
        .map((s) => s.name),
      conversationHistory: (messages ?? []).slice(-10),
      recentDoses: (doses ?? []).filter((d) => d.date >= cutoff),
      activeProtocols: activeProtos,
      recentEffects: [],
      healthAlerts: (alerts ?? []).filter((a) => !a.dismissed),
      healthProfile: healthProfile.setupComplete ? healthProfile : null,
      simpleMode,
      _correlationSummary: correlationSummary,
    };

    return ctx;
  }, [
    profile,
    checkIns,
    currentStack,
    savedStacks,
    messages,
    doses,
    protocols,
    alerts,
    healthProfile,
    simpleMode,
  ]);

  // Determine if we should use AI or local bot
  const useAI = isAIAvailable() && canSendToCloud();

  // Auto-save journal entries from bot responses
  const handleBotResponse = useCallback(
    (response: ChatMessage) => {
      addMessage(response);
      if (response.journalEntry) {
        addJournalEntry({
          category: response.journalEntry.category,
          title: response.journalEntry.title,
          content: response.journalEntry.content,
          tags: response.journalEntry.tags,
          relatedPeptideIds: response.journalEntry.relatedPeptideIds,
          mood: response.journalEntry.mood,
        });
      }
    },
    [addMessage, addJournalEntry],
  );

  // ────────────────────────────────────────────────────────────────────
  // Aimee client_action appliers — invoked from the SSE stream when the
  // edge fn emits a {type:'client_action', action:{type, payload}}
  // event. Each one delegates to the matching local Zustand store so
  // the new row appears immediately in the dose/meal/workout UI; each
  // store handles the Supabase sync internally (syncRecord upsert).
  // ────────────────────────────────────────────────────────────────────

  const applyLogDoseAction = useCallback(
    (payload: Record<string, unknown>) => {
      const peptideName = typeof payload.peptideName === 'string' ? payload.peptideName : '';
      const rawPid = typeof payload.peptideId === 'string' ? payload.peptideId : '';
      // Resolve to a canonical peptide id from src/data/peptides so the
      // store's dose alerts (which key off peptideId) work properly.
      // Fall back to the raw id or the name slug.
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const canonical =
        PEPTIDES.find((p) => p.id === rawPid)?.id ??
        PEPTIDES.find((p) => norm(p.name) === norm(peptideName))?.id ??
        (rawPid || norm(peptideName));

      const amount = Number(payload.amount);
      const unit = typeof payload.unit === 'string' ? payload.unit.toLowerCase() : 'mcg';
      const route = typeof payload.route === 'string' ? payload.route : 'subcutaneous';
      if (!canonical || !Number.isFinite(amount) || amount <= 0) return;
      // Magnitude clamps — Grok could hallucinate `amount: 999999` and the
      // edge function passes it through verbatim. Mirror the manual-log
      // dialog caps (calendar.tsx ~line 422). Prevents poisoned dose log
      // rows that then feed back into Aimee's context.
      if (
        (unit === 'mcg' && amount > 100000) ||
        (unit === 'mg' && amount > 100) ||
        (unit === 'iu' && amount > 10000)
      ) {
        if (__DEV__) console.warn('[aimee] log_dose magnitude implausible, ignoring:', amount, unit);
        return;
      }
      logDoseAction({
        peptideId: canonical,
        amount,
        unit: unit as any,
        route: route as any,
        date: typeof payload.date === 'string' ? payload.date : undefined,
        time: typeof payload.time === 'string' ? payload.time : undefined,
        injectionSite: typeof payload.site === 'string' ? payload.site : undefined,
        notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      });
    },
    [logDoseAction],
  );

  const applyLogMealAction = useCallback(
    (payload: Record<string, unknown>) => {
      const id =
        typeof payload.id === 'string'
          ? payload.id
          : `meal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const date =
        typeof payload.date === 'string'
          ? payload.date
          : new Date().toISOString().slice(0, 10);
      const mealType =
        typeof payload.mealType === 'string' ? payload.mealType : 'snack';
      const timestamp =
        typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString();
      const items = Array.isArray(payload.items) ? payload.items : [];
      const title = typeof payload.title === 'string' ? payload.title : 'Meal';
      const totals = (payload.totals ?? {}) as Record<string, unknown>;

      // Build a quickLog so the meal counts toward macro totals even
      // when the items array doesn't carry full per-food nutrition.
      // Field names MUST match MealEntry.quickLog in src/types/fitness.ts —
      // useMealStore.getDailyTotals reads proteinGrams / carbsGrams /
      // fatGrams. Earlier versions wrote `protein/carbs/fat` which the
      // store silently ignored, zeroing macros for every Aimee-logged
      // meal in the nutrition ring.
      // Clamp every macro: never negative, never larger than a sane meal.
      // Caps mirror the manual quick-log dialog (app/(tabs)/nutrition).
      // Without these, Grok could fabricate `calories: -800` or
      // `calories: 50000` and silently poison the user's daily totals.
      const clamp = (v: unknown, max: number): number => {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(max, n));
      };
      const quickLog = {
        description: title,
        calories: clamp(totals.calories, 5000),
        proteinGrams: clamp(totals.protein, 500),
        carbsGrams: clamp(totals.carbs, 1000),
        fatGrams: clamp(totals.fat, 500),
      };

      addMealAction({
        id,
        date,
        mealType: mealType as any,
        timestamp,
        foods: items as any,
        quickLog,
        notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      } as any);
    },
    [addMealAction],
  );

  const applyScheduleWorkoutAction = useCallback(
    (payload: Record<string, unknown>) => {
      const id =
        typeof payload.id === 'string'
          ? payload.id
          : `wlog-aimee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const startedAt =
        typeof payload.startedAt === 'string' ? payload.startedAt : new Date().toISOString();
      addPlannedWorkoutAction({
        id,
        date: startedAt.slice(0, 10),
        sets: [],
        durationMinutes:
          typeof payload.durationMinutes === 'number' ? payload.durationMinutes : 0,
        startedAt,
        // completedAt deliberately undefined → marks this as a planned
        // workout, not a completed one.
        notes: typeof payload.notes === 'string' ? payload.notes : undefined,
        workoutName:
          typeof payload.workoutName === 'string' ? payload.workoutName : 'Workout',
      });
    },
    [addPlannedWorkoutAction],
  );

  /**
   * Stream an Aimee response from the Grok-backed endpoint.
   *
   * Flow:
   *   1. Insert an empty assistant bubble immediately (so the typing
   *      indicator gives way to a real bubble that fills with text).
   *   2. Iterate SSE events, patching the bubble with each delta.
   *   3. Tool calls and pending actions land on the bubble as structured
   *      `toolResults` / `pendingActions` so the renderer can show cards.
   *
   * Returns `true` on a successful stream (regardless of model output); the
   * caller can use that to decide whether to fall back to the legacy
   * non-streaming path or the local bot.
   */
  const streamAimeeResponse = useCallback(
    async (text: string, context: EnhancedBotContext): Promise<boolean> => {
      const placeholderId = `bot-stream-${Date.now()}`;
      const placeholder: ChatMessage = {
        id: placeholderId,
        role: 'bot',
        content: '',
        timestamp: new Date().toISOString(),
        streaming: true,
      };
      addMessage(placeholder);

      let accumulated = '';
      const toolResults: NonNullable<ChatMessage['toolResults']> = [];
      const pendingActions: NonNullable<ChatMessage['pendingActions']> = [];
      let sawAnyEvent = false;
      let stillStreaming = true;

      // New stream → cancel any prior in-flight one, then create a fresh
      // controller for this run. Storing in a ref so the unmount cleanup
      // can call .abort() without recreating the listener.
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      // Stash on globalThis so useAuthStore.logout() can abort
      // an in-flight stream even when the chat screen isn't
      // mounted (e.g. logout fired from the Profile tab). Without
      // this, late text_delta events would write into the chat
      // store post-logout. P1 from Wave 76.11 logout audit.
      try {
        (globalThis as any).__peptalkActiveAimeeAbort = () => controller.abort();
      } catch { /* ignore */ }

      try {
        for await (const ev of generateAIResponseStream(text, context, {
          signal: controller.signal,
        })) {
          sawAnyEvent = true;
          if (ev.type === 'text_delta' && ev.text) {
            accumulated += ev.text;
            updateMessage(placeholderId, { content: accumulated });
          } else if (ev.type === 'tool_result' && ev.tool && ev.output) {
            const isPending =
              typeof (ev.output as any)?.pending_action_id === 'string' &&
              (ev.output as any)?.requires_confirm === true;
            toolResults.push({
              tool: ev.tool,
              output: ev.output as Record<string, unknown>,
              isPending,
            });
            updateMessage(placeholderId, { toolResults: [...toolResults] });
          } else if (
            ev.type === 'pending_action' &&
            ev.id &&
            ev.tool &&
            ev.preview
          ) {
            pendingActions.push({
              id: ev.id,
              tool: ev.tool,
              preview: ev.preview as Record<string, unknown>,
              status: 'pending',
            });
            updateMessage(placeholderId, {
              pendingActions: [...pendingActions],
            });
          } else if (ev.type === 'client_action' && ev.action) {
            // Aimee asked the client to do something concrete. Three
            // shapes are supported today:
            //   - navigate         → router.push(path)
            //   - log_dose         → useDoseLogStore.logDose(payload)
            //   - log_meal         → useMealStore.addMeal(payload)
            //   - schedule_workout → useWorkoutStore.addPlannedLog(payload)
            // We trigger once per event; the assistant's text continues
            // streaming in the bubble so the user still gets context.
            const action = ev.action as {
              type: string;
              path?: string;
              payload?: Record<string, unknown>;
            };
            try {
              if (action.type === 'navigate' && typeof action.path === 'string') {
                // Client-side allowlist check on the server-supplied
                // path. Even though the server keeps a SCREEN_TO_PATH
                // map, a prompt-injection escape could in theory get
                // Aimee to emit a custom `navigate` action pointing
                // at /admin or /dev — defense in depth. Refuse
                // anything outside (tabs) and /calculators.
                const safe = isAllowedNavigationPath(action.path);
                if (safe) {
                  router.push(action.path as any);
                } else if (__DEV__) {
                  console.warn('[aimee] navigate refused (not allowlisted):', action.path);
                }
              } else if (action.type === 'log_dose' && action.payload) {
                applyLogDoseAction(action.payload);
              } else if (action.type === 'log_meal' && action.payload) {
                applyLogMealAction(action.payload);
              } else if (action.type === 'schedule_workout' && action.payload) {
                applyScheduleWorkoutAction(action.payload);
              }
            } catch (err) {
              if (__DEV__) console.warn('[aimee] client_action failed:', err, action);
            }
          } else if (ev.type === 'done') {
            stillStreaming = false;
            updateMessage(placeholderId, { streaming: false });
          } else if (ev.type === 'error') {
            // Don't surface the placeholder as an error — drop a friendly
            // line so it doesn't render as an empty bubble. The caller
            // fallback path will not run because sawAnyEvent is true.
            if (!accumulated) {
              updateMessage(placeholderId, {
                content:
                  ev.message ?? 'I had trouble responding. Please try again.',
                streaming: false,
              });
            } else {
              updateMessage(placeholderId, { streaming: false });
            }
            stillStreaming = false;
            return true;
          } else if (ev.type === 'denied') {
            const upgrade = ev.upgrade === true;
            updateMessage(placeholderId, {
              content: ev.message ?? 'Aimee requires an upgrade.',
              streaming: false,
              quickReplies: upgrade ? ['View subscription plans'] : undefined,
              navAction: upgrade ? '/subscription' : undefined,
              actions: upgrade
                ? [
                    {
                      label: 'See plans',
                      route: '/subscription',
                      icon: 'sparkles-outline',
                    },
                  ]
                : undefined,
            });
            return true;
          }
        }
      } catch (err) {
        if (__DEV__) console.warn('[aimee] stream iterator threw:', err);
        if (!sawAnyEvent) {
          // Stream threw before yielding ANY event. Drop the empty
          // placeholder bubble so the legacy fallback (generateAIResponse)
          // doesn't append a SECOND bot bubble next to a stale empty one.
          removeMessage(placeholderId);
          return false;
        }
      }

      if (stillStreaming) {
        // Iterator closed without a 'done' event — finalize anyway.
        updateMessage(placeholderId, { streaming: false });
      }
      // If the model didn't emit any text or actions, treat as a failed run
      // so the local fallback runs. Drop the dead placeholder first.
      if (!sawAnyEvent || (accumulated.trim().length === 0 && toolResults.length === 0)) {
        removeMessage(placeholderId);
        return false;
      }
      return true;
    },
    [
      addMessage,
      updateMessage,
      removeMessage,
      router,
      applyLogDoseAction,
      applyLogMealAction,
      applyScheduleWorkoutAction,
    ],
  );

  // Handle pre-filled message: auto-send it if chat is empty
  useEffect(() => {
    if (prefillMessage && !messageHandled.current && messages.length === 0) {
      messageHandled.current = true;
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: prefillMessage,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);
      setTyping(true);
      const context = buildContext();
      const localFallback = () => {
        try {
          const botResponse = generateLocalBotResponse(prefillMessage, context);
          handleBotResponse(botResponse);
        } catch (err) {
          if (__DEV__) console.warn('[aimee] prefill local fallback threw:', err);
        } finally {
          setTyping(false);
        }
      };
      if (useAI) {
        // Prefer streaming Claude path. On failure or empty stream, fall
        // through to the legacy non-streaming endpoint, then local.
        setTyping(false);
        withTimeout(
          streamAimeeResponse(prefillMessage, context),
          AIMEE_RESPONSE_TIMEOUT_MS,
          'aimee prefill stream',
        )
          .then(async (streamed) => {
            if (streamed) return;
            setTyping(true);
            try {
              const aiResponse = await withTimeout(
                generateAIResponse(prefillMessage, context),
                AIMEE_RESPONSE_TIMEOUT_MS,
                'aimee prefill response',
              );
              if (aiResponse) {
                handleBotResponse(aiResponse);
                setTyping(false);
              } else {
                setTimeout(localFallback, 400 + Math.random() * 600);
              }
            } catch (err) {
              if (__DEV__) console.warn('[aimee] prefill legacy failed:', err);
              localFallback();
            }
          })
          .catch((err) => {
            if (__DEV__) console.warn('[aimee] prefill stream failed/timed out:', err);
            localFallback();
          });
      } else {
        setTimeout(localFallback, 400 + Math.random() * 600);
      }
    }
  }, [
    prefillMessage,
    messages.length,
    addMessage,
    setTyping,
    buildContext,
    useAI,
    streamAimeeResponse,
    handleBotResponse,
  ]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, isTyping]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    addMessage(userMsg);
    setInputText('');
    setTyping(true);

    const context = buildContext();

    if (useAI) {
      // 1. Try the streaming Claude-backed endpoint first.
      //
      // The streaming helper returns true when SSE produced at least one
      // event AND something useful (text or tool call) landed on the
      // bubble. The placeholder bubble is inserted by the helper, so
      // setTyping is flipped off before the stream starts to avoid
      // double indicators.
      setTyping(false);
      try {
        const streamed = await withTimeout(
          streamAimeeResponse(text, context),
          AIMEE_RESPONSE_TIMEOUT_MS,
          'aimee stream',
        );
        if (streamed) return;
      } catch (err) {
        if (__DEV__) console.warn('[aimee] stream failed/timed out:', err);
      }

      // 2. Fall back to the legacy non-streaming endpoint (Grok-backed).
      setTyping(true);
      try {
        const aiResponse = await withTimeout(
          generateAIResponse(text, context),
          AIMEE_RESPONSE_TIMEOUT_MS,
          'aimee response',
        );
        if (aiResponse) {
          handleBotResponse(aiResponse);
          setTyping(false);
          return;
        }
      } catch (err) {
        if (__DEV__) console.warn('[aimee] generateAIResponse failed/timed out:', err);
      }
    }

    // 3. Local fallback (no API key, no consent, API failure, timeout, thrown error)
    setTimeout(() => {
      try {
        const botResponse = generateLocalBotResponse(text, context);
        handleBotResponse(botResponse);
      } catch (err) {
        if (__DEV__) console.warn('[aimee] local fallback threw:', err);
        handleBotResponse({
          id: `bot-${Date.now()}`,
          role: 'bot',
          content: "I'm having trouble connecting right now. Please try again in a moment.",
          timestamp: new Date().toISOString(),
        });
      } finally {
        setTyping(false);
      }
    }, 400 + Math.random() * 600);
  }, [
    inputText,
    addMessage,
    handleBotResponse,
    setTyping,
    buildContext,
    useAI,
    streamAimeeResponse,
  ]);

  const handleQuickReply = useCallback(
    async (reply: string) => {
      setInputText(reply);
      setInputText('');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: reply,
        timestamp: new Date().toISOString(),
      };
      addMessage(userMsg);
      setTyping(true);

      const context = buildContext();

      if (useAI) {
        setTyping(false);
        try {
          const streamed = await withTimeout(
            streamAimeeResponse(reply, context),
            AIMEE_RESPONSE_TIMEOUT_MS,
            'aimee quick-reply stream',
          );
          if (streamed) return;
        } catch (err) {
          if (__DEV__) console.warn('[aimee] quick-reply stream failed/timed out:', err);
        }

        setTyping(true);
        try {
          const aiResponse = await withTimeout(
            generateAIResponse(reply, context),
            AIMEE_RESPONSE_TIMEOUT_MS,
            'aimee quick-reply',
          );
          if (aiResponse) {
            handleBotResponse(aiResponse);
            setTyping(false);
            return;
          }
        } catch (err) {
          if (__DEV__) console.warn('[aimee] quick-reply AI failed/timed out:', err);
        }
      }

      // Local fallback
      setTimeout(() => {
        try {
          const botResponse = generateLocalBotResponse(reply, context);
          handleBotResponse(botResponse);
        } catch (err) {
          if (__DEV__) console.warn('[aimee] quick-reply local threw:', err);
          handleBotResponse({
            id: `bot-${Date.now()}`,
            role: 'bot',
            content: "I'm having trouble connecting right now. Please try again in a moment.",
            timestamp: new Date().toISOString(),
          });
        } finally {
          setTyping(false);
        }
      }, 400 + Math.random() * 600);
    },
    [addMessage, setTyping, buildContext, useAI, handleBotResponse, streamAimeeResponse],
  );

  // Get quick replies from the last bot message
  const lastBotMessage = [...messages].reverse().find((m) => m.role === 'bot');
  const quickReplies = lastBotMessage?.quickReplies || [];
  const botActions = lastBotMessage?.actions || [];
  const lastBotHasJournal = !!lastBotMessage?.journalEntry;

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => {
      // Tool results + pending actions live BELOW the bubble so the chat
      // thread reads top-to-bottom: text → cards → next message.
      const hasCards =
        (item.toolResults && item.toolResults.length > 0) ||
        (item.pendingActions && item.pendingActions.length > 0);
      if (!hasCards) {
        return <ChatBubble message={item} />;
      }
      return (
        <View>
          <ChatBubble message={item} />
          <View style={{ marginLeft: 48, marginRight: 16 }}>
            {(item.toolResults ?? [])
              .filter((r) => !r.isPending)
              .map((r, i) => (
                <AimeeToolResultCard key={`tr-${item.id}-${i}`} result={r} />
              ))}
            {(item.pendingActions ?? []).map((a) => (
              <AimeePendingActionCard key={`pa-${a.id}`} action={a} />
            ))}
          </View>
        </View>
      );
    },
    [],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyAvatarRing, { borderColor: '#3E7CB130' }]}>
          <LinearGradient
            colors={['#3E7CB118', '#7FB3D810']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyAvatarInner}
          >
            <AimeeDnaIcon size={88} active />
          </LinearGradient>
        </View>
        <Text style={[styles.emptyTitle, { color: t.text }]}>Hi, I'm Aimee</Text>
        <View style={[styles.emptyAccentBar, { backgroundColor: accent.deep }]} />
        <Text style={[styles.emptySubtitle, { color: t.textSecondary }]}>
          Your personal health companion
        </Text>
        <Text style={[styles.emptyDesc, { color: t.textSecondary }]}>
          Ask me about peptides, check interactions, or get personalized insights from your tracking data.
        </Text>
        <View style={styles.emptyChips}>
          {/* Proactive contextual nudges — replaces 3 generic prompts.
              getAimeeNudges() reads check-in history, active protocols,
              cycle state, lab values, and goals to surface chips that
              reference the user's actual situation. Always falls back
              to a goal/evergreen prompt when no specific context fires. */}
          {getAimeeNudges().map((nudge) => (
            <AnimatedPress
              key={nudge.source + nudge.prompt}
              style={styles.starterChip}
              onPress={() => handleQuickReply(nudge.prompt)}
              scaleTo={0.97}
            >
              <View style={[styles.starterChipCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
                <View style={[styles.starterChipIconWrap, { backgroundColor: `${accent.deep}15` }]}>
                  <Ionicons
                    name={nudge.icon}
                    size={14}
                    color={accent.deep}
                  />
                </View>
                <Text style={[styles.starterChipText, { color: t.text }]}>{nudge.prompt}</Text>
                <Ionicons name="arrow-forward" size={14} color={t.textSecondary} />
              </View>
            </AnimatedPress>
          ))}
        </View>
      </View>
    ),
    [handleQuickReply, t],
  );

  // NOTE: do not wrap this entire tab in <PaywallGate>. Tabs can't pop
  // back, so a free-tier user dismissing the paywall would land on a blank
  // tab and be stuck. The local-bot fallback below already gracefully
  // degrades when the user lacks AI access (useAI flag).
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: t.bg, borderBottomColor: t.cardBorder }]}>
          <TouchableOpacity
            onPress={() => setDrawerOpen(true)}
            style={[styles.iconBtn, { backgroundColor: t.surface }]}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Open chat history"
          >
            <Ionicons name="menu" size={20} color={t.text} />
          </TouchableOpacity>

          <View style={styles.headerLeft}>
            <View style={[styles.headerAvatar, { borderColor: '#3E7CB140' }]}>
              <LinearGradient
                colors={['#3E7CB120', '#7FB3D812']}
                style={styles.headerAvatarInner}
              >
                <AimeeDnaIcon size={28} active />
              </LinearGradient>
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: t.text }]}>Aimee</Text>
              <View style={styles.headerSubRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: useAI ? '#10b981' : t.textSecondary },
                  ]}
                />
                <Text style={[styles.headerSub, { color: t.textSecondary }]}>
                  {useAI ? 'Online' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setSimpleMode((v) => !v)}
            style={[
              styles.iconBtn,
              {
                backgroundColor: simpleMode ? `${accent.deep}22` : t.surface,
                borderWidth: simpleMode ? 1 : 0,
                borderColor: `${accent.deep}55`,
              },
            ]}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={simpleMode ? 'Disable simple mode' : 'Enable simple mode'}
            accessibilityHint="Tap to toggle plain-language replies from Aimee"
          >
            <Ionicons
              name={simpleMode ? 'sparkles' : 'sparkles-outline'}
              size={18}
              color={simpleMode ? accent.deep : t.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => useChatStore.getState().newChat()}
            style={[styles.iconBtn, { backgroundColor: t.surface }]}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Start new chat"
          >
            <Ionicons name="create-outline" size={20} color={t.text} />
          </TouchableOpacity>
        </View>

        {messages.length === 0 && (
          <CoachMark
            id="first_aimee_visit"
            title="Ask anything about peptides, nutrition, or training"
            body="Aimee is not a doctor — she'll share research and redirect medical questions to your provider."
            icon="chatbubbles-outline"
          />
        )}

        {/* ── Messages ───────────────────────────────────────── */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messageList,
            messages.length === 0 && styles.messageListEmpty,
          ]}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="interactive"
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
        />

        {/* ── Journal toast ──────────────────────────────────── */}
        {lastBotHasJournal && !isTyping && messages.length > 0 && (
          <JournalToast />
        )}

        {/* ── Quick Replies ──────────────────────────────────── */}
        {quickReplies.length > 0 && !isTyping && showPills && (
          <View style={styles.quickReplies}>
            {quickReplies.map((reply) => (
              <AnimatedPress
                key={reply}
                style={[styles.quickReplyChip, { borderColor: `${accent.deep}30` }]}
                onPress={() => handleQuickReply(reply)}
                scaleTo={0.95}
              >
                <LinearGradient
                  colors={[`${accent.deep}18`, `${accent.pastel}0A`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.quickReplyGradient}
                >
                  <Text style={[styles.quickReplyText, { color: accent.deep }]}>{reply}</Text>
                </LinearGradient>
              </AnimatedPress>
            ))}
          </View>
        )}

        {/* ── Action Buttons ──
            Render whenever the most-recent bot message exposed actions —
            previously gated on `showPills` (empty chat) which meant
            actions never rendered (lastBotMessage is undefined when there
            are no messages). Now: visible after any bot message that
            ships with actions, hidden while typing. */}
        {botActions.length > 0 && !isTyping && (
          <View style={styles.actionBtns}>
            {botActions.map((action, idx) => (
              <AnimatedPress
                key={`${action.route}-${idx}`}
                style={[styles.actionBtn, { borderColor: `${accent.deep}30` }]}
                onPress={() => {
                  tapMedium();
                  router.push(action.route as any);
                }}
                scaleTo={0.95}
              >
                <LinearGradient
                  colors={[`${accent.deep}22`, `${accent.pastel}10`]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.actionBtnGradient}
                >
                  {action.icon && (
                    <Ionicons
                      name={action.icon as any}
                      size={16}
                      color={accent.deep}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={[styles.actionBtnText, { color: accent.deep }]}>{action.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={`${accent.deep}99`} />
                </LinearGradient>
              </AnimatedPress>
            ))}
          </View>
        )}

        {/* ── Input Bar ──────────────────────────────────────── */}
        <View ref={aimeeInputRef} style={[styles.inputBarWrap, { backgroundColor: t.bg, borderTopColor: t.cardBorder }]}>
          <View style={styles.inputRow}>
            <View style={[styles.inputWrap, { backgroundColor: t.surface, borderColor: `${accent.deep}25` }]}>
              <TextInput
                style={[styles.input, { color: t.text }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask Aimee anything..."
                placeholderTextColor={t.textSecondary}
                multiline
                maxLength={500}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
                returnKeyType="send"
                accessibilityLabel="Message to Aimee"
                accessibilityHint="Type a question about peptides, nutrition, or training. Tap send when ready."
              />
            </View>
            <AnimatedPress
              style={styles.sendBtnWrap}
              onPress={() => {
                tapMedium();
                handleSend();
              }}
              disabled={!inputText.trim()}
              scaleTo={0.88}
              accessibilityRole="button"
              accessibilityLabel="Send message"
              accessibilityState={{ disabled: !inputText.trim() }}
            >
              <LinearGradient
                colors={
                  inputText.trim()
                    ? [accent.deep, accent.darker]
                    : [t.card, t.card]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
                <Ionicons
                  name="send"
                  size={18}
                  color={
                    inputText.trim()
                      ? '#ffffff'
                      : t.textSecondary
                  }
                />
              </LinearGradient>
            </AnimatedPress>
          </View>
        </View>

        {/* ── Disclaimer ─────────────────────────────────────── */}
        <Text style={[styles.disclaimer, { color: t.textSecondary }]}>
          Aimee educates — always consult your doctor for medical decisions.
        </Text>
      </KeyboardAvoidingView>

      <ChatHistoryDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </SafeAreaView>
  );
}

/* ─── Styles ─────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.darkBg,
  },
  container: {
    flex: 1,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: 'hidden',
  },
  headerAvatarInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: 'DMSans-Medium',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Message list ── */
  messageList: {
    paddingVertical: Spacing.md,
  },
  messageListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  /* ── Empty state ── */
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  emptyAvatarRing: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    padding: 6,
  },
  emptyAvatarInner: {
    flex: 1,
    width: '100%',
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 36,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  emptyAccentBar: {
    width: 40,
    height: 3,
    borderRadius: 2,
    marginBottom: 14,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'DMSans-Medium',
    marginBottom: 10,
  },
  emptyDesc: {
    fontSize: 14,
    fontFamily: 'DMSans-Regular',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  emptyChips: {
    gap: 10,
    width: '100%',
  },
  starterChip: {
    width: '100%',
  },
  starterChipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  starterChipIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterChipText: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
    flex: 1,
  },

  /* ── Quick replies ── */
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs + 2,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  quickReplyChip: {
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    borderWidth: 1,
  },
  quickReplyGradient: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
  },
  quickReplyText: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-SemiBold',
  },

  /* ── Action buttons ── */
  actionBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  actionBtn: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
  },
  actionBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    gap: 2,
  },
  actionBtnText: {
    fontSize: FontSizes.sm,
    fontFamily: 'DMSans-SemiBold',
    marginRight: 4,
  },

  /* ── Journal toast ── */
  journalToast: {
    alignItems: 'center',
    paddingBottom: Spacing.xs,
  },
  journalToastBg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
  },
  journalToastText: {
    fontSize: FontSizes.xs,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.3,
  },

  /* ── Input bar ── */
  inputBarWrap: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  inputWrap: {
    flex: 1,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  input: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    color: Colors.darkText,
    fontSize: FontSizes.md,
    maxHeight: 100,
  },
  sendBtnWrap: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Disclaimer ── */
  disclaimer: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    textAlign: 'center',
    paddingBottom: 4,
    opacity: 0.5,
  },
});
