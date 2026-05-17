/**
 * Progress photos — Master Refactor Plan v3.1 §5.2 + §13.5.
 *
 * Local-first gallery. Private by default (§13.5); each photo has a
 * per-entry "share with community" toggle that's off until the user
 * explicitly flips it. Uses expo-image-picker (already installed) for
 * camera + library access.
 */

import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight, tapMedium } from '../../src/utils/haptics';
import { useProgressPhotosStore } from '../../src/store/useProgressPhotosStore';

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ProgressPhotosScreen() {
  const t = useV3Theme();
  const photos = useProgressPhotosStore((s) => s.photos);
  const addPhoto = useProgressPhotosStore((s) => s.addPhoto);
  const removePhoto = useProgressPhotosStore((s) => s.removePhoto);
  const toggleShare = useProgressPhotosStore((s) => s.toggleShare);

  const [captionOpen, setCaptionOpen] = useState(false);
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');

  const handlePickFromCamera = async () => {
    tapMedium();
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Camera access needed',
          'Allow camera in Settings to take a progress photo.',
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingUri(result.assets[0].uri);
        setCaption('');
        setCaptionOpen(true);
      }
    } catch (err) {
      Alert.alert(
        'Camera unavailable',
        err instanceof Error ? err.message : 'Try the library picker instead.',
      );
    }
  };

  const handlePickFromLibrary = async () => {
    tapMedium();
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photos access needed',
          'Allow photo library access in Settings to import a progress photo.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingUri(result.assets[0].uri);
        setCaption('');
        setCaptionOpen(true);
      }
    } catch (err) {
      Alert.alert(
        'Library unavailable',
        err instanceof Error ? err.message : 'Try the camera instead.',
      );
    }
  };

  const handleSavePending = () => {
    if (!pendingUri) return;
    addPhoto({
      uri: pendingUri,
      date: todayKey(),
      caption: caption.trim() || undefined,
      sharedToCommunity: false,
    });
    setCaptionOpen(false);
    setPendingUri(null);
    setCaption('');
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Delete this photo?',
      'It is removed from your device only — nothing was ever uploaded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => removePhoto(id),
        },
      ],
    );
  };

  return (
    <V3DetailShell
      title="Progress photos"
      observation={
        photos.length === 0
          ? 'No photos yet. Stored on this device only.'
          : `${photos.length} photo${photos.length === 1 ? '' : 's'}. ${
              photos.filter((p) => p.sharedToCommunity).length
            } shared with the community.`
      }
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={styles.actionRow}>
          <Pressable
            onPress={handlePickFromCamera}
            style={[
              styles.actionCta,
              { backgroundColor: t.colors.textPrimary as string },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Take a progress photo with the camera"
          >
            <Ionicons
              name="camera-outline"
              size={18}
              color={t.colors.bgBase1 as string}
            />
            <Text
              style={{
                color: t.colors.bgBase1 as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 13,
                marginLeft: 8,
                letterSpacing: 0.3,
              }}
            >
              Camera
            </Text>
          </Pressable>
          <Pressable
            onPress={handlePickFromLibrary}
            style={[
              styles.actionCtaSecondary,
              { borderColor: t.colors.textPrimary as string },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Pick a progress photo from the library"
          >
            <Ionicons
              name="images-outline"
              size={18}
              color={t.colors.textPrimary as string}
            />
            <Text
              style={{
                color: t.colors.textPrimary as string,
                fontFamily: t.typography.bodyBold,
                fontSize: 13,
                marginLeft: 8,
                letterSpacing: 0.3,
              }}
            >
              Library
            </Text>
          </Pressable>
        </View>

        {photos.length === 0 ? (
          <GlassCard style={styles.cardSpacing}>
            <Text
              style={{
                color: t.colors.textSecondary as string,
                fontFamily: t.typography.body,
                fontSize: 13,
                textAlign: 'center',
                lineHeight: 19,
              }}
            >
              Add your first progress photo. It stays on this device unless
              you tap the share toggle on a specific photo (off by default).
            </Text>
          </GlassCard>
        ) : (
          photos.map((p) => (
            <GlassCard key={p.id} style={styles.photoCard}>
              <Image
                source={{ uri: p.uri }}
                style={styles.photo}
                resizeMode="cover"
                accessibilityLabel={`Progress photo from ${p.date}${p.caption ? ': ' + p.caption : ''}`}
              />
              <View style={styles.photoMeta}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.photoDate,
                      {
                        color: t.colors.textPrimary as string,
                        fontFamily: t.typography.bodyBold,
                      },
                    ]}
                  >
                    {p.date}
                  </Text>
                  {p.caption ? (
                    <Text
                      style={[
                        styles.photoCaption,
                        {
                          color: t.colors.textSecondary as string,
                          fontFamily: t.typography.body,
                        },
                      ]}
                    >
                      {p.caption}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    tapLight();
                    toggleShare(p.id);
                  }}
                  style={styles.shareBtn}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: !!p.sharedToCommunity }}
                  accessibilityLabel={
                    p.sharedToCommunity
                      ? 'Photo shared with community. Tap to make private.'
                      : 'Photo is private. Tap to share with community.'
                  }
                >
                  <Ionicons
                    name={p.sharedToCommunity ? 'eye' : 'eye-off-outline'}
                    size={18}
                    color={t.colors.textSecondary as string}
                  />
                </Pressable>
                <Pressable
                  onPress={() => handleDelete(p.id)}
                  style={styles.deleteBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this progress photo"
                >
                  <Ionicons
                    name="trash-outline"
                    size={16}
                    color={t.colors.textSecondary as string}
                  />
                </Pressable>
              </View>
            </GlassCard>
          ))
        )}
      </ScrollView>

      {/* Caption modal */}
      <Modal
        visible={captionOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCaptionOpen(false)}
      >
        <View style={styles.captionBackdrop}>
          <View
            style={[
              styles.captionSheet,
              {
                backgroundColor: t.colors.bgBase2 as string,
                borderTopLeftRadius: t.radius.card,
                borderTopRightRadius: t.radius.card,
              },
            ]}
          >
            {pendingUri ? (
              <Image
                source={{ uri: pendingUri }}
                style={styles.captionPreview}
                resizeMode="cover"
              />
            ) : null}
            <Text
              style={[
                styles.captionLabel,
                {
                  color: t.colors.textSecondary as string,
                  fontFamily: t.typography.body,
                },
              ]}
            >
              Caption (optional)
            </Text>
            <View
              style={[
                styles.captionInputBox,
                {
                  borderColor: t.colors.cardBorder as string,
                  backgroundColor: t.isDark
                    ? 'rgba(255,255,255,0.04)'
                    : 'rgba(255,255,255,0.5)',
                },
              ]}
            >
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="What you want to remember about this day"
                placeholderTextColor={t.colors.textSecondary as string}
                style={{
                  color: t.colors.textPrimary as string,
                  fontFamily: t.typography.body,
                  fontSize: 14,
                }}
              />
            </View>
            <View style={styles.captionActions}>
              <Pressable
                onPress={() => {
                  setCaptionOpen(false);
                  setPendingUri(null);
                }}
                style={styles.captionCancel}
                accessibilityRole="button"
                accessibilityLabel="Discard this photo"
              >
                <Text
                  style={{
                    color: t.colors.textSecondary as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 13,
                  }}
                >
                  Discard
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSavePending}
                style={[
                  styles.captionSave,
                  { backgroundColor: t.colors.textPrimary as string },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save photo to private gallery"
              >
                <Text
                  style={{
                    color: t.colors.bgBase1 as string,
                    fontFamily: t.typography.bodyBold,
                    fontSize: 13,
                  }}
                >
                  Save (private)
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionCta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 999,
  },
  actionCtaSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  cardSpacing: { marginTop: 14 },
  photoCard: {
    marginTop: 12,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
  },
  photoMeta: {
    paddingHorizontal: 14,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  photoDate: { fontSize: 13 },
  photoCaption: { fontSize: 11, marginTop: 2 },
  shareBtn: { padding: 4 },
  deleteBtn: { padding: 4 },
  captionBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  captionSheet: {
    padding: 20,
    paddingBottom: 30,
  },
  captionPreview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 14,
  },
  captionLabel: {
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  captionInputBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  captionActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  captionCancel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 999,
  },
  captionSave: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 13,
    borderRadius: 999,
  },
});
