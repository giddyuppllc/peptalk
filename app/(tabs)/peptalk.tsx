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
import { PepTalkCharacter } from '../../src/components/PepTalkCharacter';
import { AnimatedPress } from '../../src/components/AnimatedPress';
import { ChatHistoryDrawer } from '../../src/components/ChatHistoryDrawer';
import { CoachMark } from '../../src/components/tutorial/CoachMark';
import { tapMedium } from '../../src/utils/haptics';
import { useChatStore } from '../../src/store/useChatStore';
import { useCheckinStore } from '../../src/store/useCheckinStore';
import { useOnboardingStore } from '../../src/store/useOnboardingStore';
import { useStackStore } from '../../src/store/useStackStore';
import { useDoseLogStore } from '../../src/store/useDoseLogStore';
import { useHealthProfileStore } from '../../src/store/useHealthProfileStore';
import { generateLocalBotResponse } from '../../src/services/peptalkBot';
import { generateAIResponse, isAIAvailable } from '../../src/services/llmService';
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

  const [inputText, setInputText] = React.useState('');
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  // "Keep it simple" — when on, Aimee replies in plain language with short
  // paragraphs and no headers/bullets. Tester request from Jamie.
  const [simpleMode, setSimpleMode] = React.useState(false);
  const prefillHandled = useRef(false);
  const messageHandled = useRef(false);
  const flatListRef = useRef<FlatList>(null);

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
        withTimeout(
          generateAIResponse(prefillMessage, context),
          AIMEE_RESPONSE_TIMEOUT_MS,
          'aimee prefill response',
        )
          .then((aiResponse) => {
            if (aiResponse) {
              handleBotResponse(aiResponse);
              setTyping(false);
            } else {
              setTimeout(localFallback, 400 + Math.random() * 600);
            }
          })
          .catch((err) => {
            if (__DEV__) console.warn('[aimee] prefill AI failed/timed out:', err);
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
      // Try Grok AI first, fall back to local bot. Wrapped so a throw
      // OR a hang from generateAIResponse (network failure, edge fn stall,
      // malformed JSON) doesn't strand the typing indicator forever.
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
        // fall through to local fallback
      }
    }

    // Local fallback (no API key, no consent, API failure, timeout, thrown error)
    setTimeout(() => {
      try {
        const botResponse = generateLocalBotResponse(text, context);
        handleBotResponse(botResponse);
      } catch (err) {
        if (__DEV__) console.warn('[aimee] local fallback threw:', err);
        // Last-resort: a hand-written apology message so the user is never
        // left staring at a frozen typing indicator.
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
  }, [inputText, addMessage, handleBotResponse, setTyping, buildContext, useAI]);

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
    [addMessage, setTyping, buildContext, useAI, handleBotResponse],
  );

  // Get quick replies from the last bot message
  const lastBotMessage = [...messages].reverse().find((m) => m.role === 'bot');
  const quickReplies = lastBotMessage?.quickReplies || [];
  const botActions = lastBotMessage?.actions || [];
  const lastBotHasJournal = !!lastBotMessage?.journalEntry;

  const renderMessage = useCallback(
    ({ item }: { item: ChatMessage }) => <ChatBubble message={item} />,
    [],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyAvatarRing, { borderColor: `${accent.deep}30` }]}>
          <LinearGradient
            colors={[`${accent.deep}18`, `${accent.pastel}10`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyAvatarInner}
          >
            <PepTalkCharacter size={88} variant="full" animated />
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
          {(() => {
            const goals = profile.healthGoals ?? [];
            const defaultChips = [
              'Tell me about BPC-157',
              'What helps with sleep?',
              'Suggest a recovery stack',
            ];
            if (goals.length === 0) return defaultChips;

            const goalChips = goals
              .slice(0, 2)
              .map(
                (g: GoalType) =>
                  `Peptides for ${getGoalLabel(g).toLowerCase()}`,
              );
            return [...goalChips, 'Based on my health data'];
          })().map((prompt) => (
            <AnimatedPress
              key={prompt}
              style={styles.starterChip}
              onPress={() => handleQuickReply(prompt)}
              scaleTo={0.97}
            >
              <View style={[styles.starterChipCard, { backgroundColor: t.surface, borderColor: t.cardBorder }]}>
                <View style={[styles.starterChipIconWrap, { backgroundColor: `${accent.deep}15` }]}>
                  <Ionicons
                    name="sparkles-outline"
                    size={14}
                    color={accent.deep}
                  />
                </View>
                <Text style={[styles.starterChipText, { color: t.text }]}>{prompt}</Text>
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
          >
            <Ionicons name="menu" size={20} color={t.text} />
          </TouchableOpacity>

          <View style={styles.headerLeft}>
            <View style={[styles.headerAvatar, { borderColor: `${accent.deep}40` }]}>
              <LinearGradient
                colors={[`${accent.deep}20`, `${accent.pastel}12`]}
                style={styles.headerAvatarInner}
              >
                <PepTalkCharacter size={28} variant="mini" />
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

        {/* ── Action Buttons ────────────────────────────────── */}
        {botActions.length > 0 && !isTyping && showPills && (
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
