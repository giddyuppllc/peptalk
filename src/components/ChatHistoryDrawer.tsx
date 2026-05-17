import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  ScrollView,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useSectionAccent } from '../hooks/useSectionAccent';
import { useChatStore, Chat } from '../store/useChatStore';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DRAWER_WIDTH = Math.min(SCREEN_WIDTH * 0.82, 340);

interface Props {
  visible: boolean;
  onClose: () => void;
}

function formatRelative(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;

  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const ChatHistoryDrawer: React.FC<Props> = ({ visible, onClose }) => {
  const t = useTheme();
  const accent = useSectionAccent();
  const translateX = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const chats = useChatStore((s) => s.chats);
  const activeChatId = useChatStore((s) => s.activeChatId);
  const newChat = useChatStore((s) => s.newChat);
  const switchChat = useChatStore((s) => s.switchChat);
  const deleteChat = useChatStore((s) => s.deleteChat);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -DRAWER_WIDTH,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateX, backdropOpacity]);

  const handleNewChat = () => {
    newChat();
    onClose();
  };

  const handlePickChat = (id: string) => {
    switchChat(id);
    onClose();
  };

  const handleLongPressChat = (chat: Chat) => {
    Alert.alert(
      chat.title,
      undefined,
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteChat(chat.id),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  // Sort by most recent first
  const sortedChats = [...chats].sort((a, b) => {
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* 2026-05-17 a11y: trap VoiceOver focus inside the modal */}
      <View style={StyleSheet.absoluteFillObject} accessibilityViewIsModal={true}>
        {/* Backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            { opacity: backdropOpacity },
          ]}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={onClose}
          />
        </Animated.View>

        {/* Drawer */}
        <Animated.View
          style={[
            styles.drawer,
            {
              backgroundColor: t.bg,
              borderRightColor: t.cardBorder,
              transform: [{ translateX }],
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
            <Text style={[styles.headerTitle, { color: t.text }]}>Chats</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={t.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* New Chat button */}
          <TouchableOpacity
            style={[styles.newChatBtn, { backgroundColor: accent.deep }]}
            onPress={handleNewChat}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.newChatBtnText}>New Chat</Text>
          </TouchableOpacity>

          {/* Chat list */}
          <Text style={[styles.sectionLabel, { color: t.textSecondary }]}>RECENT</Text>
          <ScrollView
            style={styles.list}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {sortedChats.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={32} color={t.textSecondary} />
                <Text style={[styles.emptyText, { color: t.textSecondary }]}>No chats yet</Text>
              </View>
            ) : (
              sortedChats.map((chat) => {
                const isActive = chat.id === activeChatId;
                const isEmpty = chat.messages.length === 0;
                return (
                  <TouchableOpacity
                    key={chat.id}
                    style={[
                      styles.chatRow,
                      {
                        backgroundColor: isActive ? `${accent.deep}18` : 'transparent',
                        borderColor: isActive ? `${accent.deep}40` : 'transparent',
                      },
                    ]}
                    onPress={() => handlePickChat(chat.id)}
                    onLongPress={() => handleLongPressChat(chat)}
                    activeOpacity={0.7}
                    delayLongPress={350}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.chatTitle,
                          { color: t.text },
                          isActive && { color: accent.deep },
                        ]}
                        numberOfLines={1}
                      >
                        {chat.title}
                      </Text>
                      <Text style={[styles.chatMeta, { color: t.textSecondary }]}>
                        {isEmpty ? 'Empty' : `${chat.messages.length} msg${chat.messages.length !== 1 ? 's' : ''} · ${formatRelative(chat.lastMessageAt)}`}
                      </Text>
                    </View>
                    {isActive && (
                      <View style={[styles.activeDot, { backgroundColor: accent.deep }]} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          {/* Footer hint */}
          <View style={[styles.footer, { borderTopColor: t.cardBorder }]}>
            <Text style={[styles.footerHint, { color: t.textSecondary }]}>
              Long-press a chat to delete
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: DRAWER_WIDTH,
    borderRightWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Playfair-Black',
    letterSpacing: -0.3,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 18,
    paddingVertical: 13,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  newChatBtnText: {
    fontSize: 15,
    fontFamily: 'DMSans-Bold',
    color: '#fff',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'DMSans-Bold',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  list: {
    flex: 1,
    paddingHorizontal: 12,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
    gap: 10,
  },
  chatTitle: {
    fontSize: 14,
    fontFamily: 'DMSans-SemiBold',
  },
  chatMeta: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
    marginTop: 2,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: 'DMSans-Medium',
  },
  footer: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  footerHint: {
    fontSize: 11,
    fontFamily: 'DMSans-Regular',
  },
});

export default ChatHistoryDrawer;
