/**
 * Compose post — Plus+ tier required.
 *
 * If the user doesn't have a community handle yet, redirects to the
 * setup-username screen first. Once they have one, this screen renders
 * the title + body + topic-picker form.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GlassCard } from '../../../src/components/GlassCard';
import { GradientButton } from '../../../src/components/GradientButton';
import { useTheme } from '../../../src/hooks/useTheme';
import { Spacing, FontSizes } from '../../../src/constants/theme';
import { useCommunityStore } from '../../../src/store/useCommunityStore';
import { pickAndUploadCommunityImage } from '../../../src/services/communityImageUpload';

const MAX_IMAGES = 4;

const TITLE_MIN = 3, TITLE_MAX = 140;
const BODY_MIN = 1, BODY_MAX = 8000;

export default function ComposePostScreen() {
  const t = useTheme();
  const router = useRouter();

  const topics = useCommunityStore((s) => s.topics);
  const hydrateTopics = useCommunityStore((s) => s.hydrateTopics);
  const createPost = useCommunityStore((s) => s.createPost);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [topicSlug, setTopicSlug] = useState<string | null>(null);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleAddImage = async () => {
    if (imageUrls.length >= MAX_IMAGES || uploadingImage) return;
    setUploadingImage(true);
    try {
      const result = await pickAndUploadCommunityImage('post');
      if (result?.publicUrl) {
        setImageUrls((prev) => [...prev, result.publicUrl]);
      }
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Could not upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = (url: string) => {
    setImageUrls((prev) => prev.filter((u) => u !== url));
  };

  useEffect(() => {
    if (topics.length === 0) hydrateTopics();
  }, [hydrateTopics, topics.length]);

  const canSubmit =
    title.trim().length >= TITLE_MIN &&
    title.trim().length <= TITLE_MAX &&
    body.trim().length >= BODY_MIN &&
    body.trim().length <= BODY_MAX &&
    topicSlug != null &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const res = await createPost({
      topicSlug: topicSlug!,
      title: title.trim(),
      body: body.trim(),
      isAnonymous,
      imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
    });
    setSubmitting(false);

    if (res.ok) {
      router.replace(`/community/${res.postId}` as any);
      return;
    }

    if ((res as any).needsUsername) {
      Alert.alert('Pick a handle first', 'You need a community username before posting.', [
        { text: 'Set username', onPress: () => router.push('/community/setup-username' as any) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if ((res as any).upgrade) {
      Alert.alert('Upgrade required', res.error, [
        { text: 'See plans', onPress: () => router.push('/subscription' as any) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert('Post failed', res.error);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.bg }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="close" size={24} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: t.text }]}>New post</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.label, { color: t.textSecondary }]}>Topic</Text>
          <View style={styles.topicGrid}>
            {topics.map((tp) => {
              const active = tp.slug === topicSlug;
              return (
                <TouchableOpacity
                  key={tp.slug}
                  onPress={() => setTopicSlug(tp.slug)}
                  style={[
                    styles.topicChip,
                    {
                      borderColor: active ? t.primary : t.cardBorder,
                      backgroundColor: active ? t.primary + '18' : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.topicText, { color: active ? t.primary : t.text }]}>
                    {tp.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: t.textSecondary }]}>Title</Text>
          <GlassCard style={styles.inputCard}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="One-line summary of your post"
              placeholderTextColor={t.textSecondary}
              maxLength={TITLE_MAX}
              style={[styles.input, { color: t.text }]}
            />
          </GlassCard>
          <Text style={[styles.charCount, { color: t.textSecondary }]}>
            {title.length}/{TITLE_MAX}
          </Text>

          <Text style={[styles.label, { color: t.textSecondary }]}>Body</Text>
          <GlassCard style={styles.inputCard}>
            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="What did you experience? What worked / didn't work? Any cited sources?"
              placeholderTextColor={t.textSecondary}
              maxLength={BODY_MAX}
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.textarea, { color: t.text }]}
            />
          </GlassCard>
          <Text style={[styles.charCount, { color: t.textSecondary }]}>
            {body.length}/{BODY_MAX}
          </Text>

          {/* Image attachments — up to 4 R2-hosted images per post.
              Pickers preserve aspect ratio, max 5MB each (enforced
              server-side). */}
          <Text style={[styles.label, { color: t.textSecondary }]}>
            Photos {imageUrls.length > 0 ? `(${imageUrls.length}/${MAX_IMAGES})` : '(optional)'}
          </Text>
          <View style={styles.imagesRow}>
            {imageUrls.map((url, idx) => (
              <View key={url} style={styles.imageWrap}>
                <Image
                  source={{ uri: url }}
                  style={styles.imageThumb}
                  accessibilityRole="image"
                  accessibilityLabel={`Attached image ${idx + 1} of ${imageUrls.length}`}
                />
                <TouchableOpacity
                  onPress={() => handleRemoveImage(url)}
                  style={styles.imageRemove}
                  accessibilityRole="button"
                  accessibilityLabel="Remove image"
                  hitSlop={8}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {imageUrls.length < MAX_IMAGES && (
              <TouchableOpacity
                onPress={handleAddImage}
                disabled={uploadingImage}
                style={[
                  styles.imageAdd,
                  {
                    borderColor: t.cardBorder,
                    backgroundColor: t.glass,
                    opacity: uploadingImage ? 0.5 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={uploadingImage ? 'Uploading photo' : 'Add a photo'}
              >
                {uploadingImage ? (
                  <ActivityIndicator size="small" color={t.textSecondary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={20} color={t.textSecondary} />
                    <Text style={[styles.imageAddText, { color: t.textSecondary }]}>
                      Add photo
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.anonRow, { borderColor: t.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.anonTitle, { color: t.text }]}>Post anonymously</Text>
              <Text style={[styles.anonBody, { color: t.textSecondary }]}>
                Your handle is hidden; admins still see your account for moderation.
              </Text>
            </View>
            <Switch
              value={isAnonymous}
              onValueChange={setIsAnonymous}
              trackColor={{ true: t.primary + '88', false: t.cardBorder }}
              thumbColor={isAnonymous ? t.primary : '#fff'}
            />
          </View>

          <View style={[styles.guideline, { borderColor: t.cardBorder }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color={t.textSecondary} />
            <Text style={[styles.guidelineText, { color: t.textSecondary }]}>
              Talk about your protocol, not what others should do. No specific dose
              recommendations to other users.
            </Text>
          </View>

          <View style={{ height: 16 }} />
          <GradientButton
            label={submitting ? 'Posting…' : 'Post'}
            onPress={handleSubmit}
            disabled={!canSubmit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingBottom: 60,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: Spacing.md,
    marginBottom: 8,
  },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  topicText: { fontSize: FontSizes.xs, fontWeight: '600' },
  inputCard: { paddingHorizontal: 12, paddingVertical: 4 },
  input: { fontSize: FontSizes.md, paddingVertical: 10 },
  textarea: { minHeight: 220 },
  charCount: { fontSize: 11, textAlign: 'right', marginTop: 4 },
  anonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  anonTitle: { fontSize: FontSizes.sm, fontWeight: '700' },
  anonBody: { fontSize: 11, marginTop: 2, lineHeight: 16 },
  guideline: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  guidelineText: { flex: 1, fontSize: 11, lineHeight: 16 },
  imagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  imageWrap: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  imageThumb: { width: '100%', height: '100%' },
  imageRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageAdd: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  imageAddText: { fontSize: 11, fontWeight: '600' },
});
