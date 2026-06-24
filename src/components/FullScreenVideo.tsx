/**
 * FullScreenVideo — immersive full-screen workout-video player.
 *
 * Big, obvious transport controls: close, −10s (reverse), play/pause,
 * +10s (fast-forward), plus a draggable scrubber and time readout. Tap
 * the video to toggle the controls; they auto-hide a few seconds after
 * you stop touching while it's playing. Used by the workout video
 * library + exercise demos so "selected video → full screen" is the
 * same experience everywhere.
 *
 * Deliberately no expo-screen-orientation dependency (keeps the binary
 * unchanged / OTA-friendly) — full-screen portrait, CONTAIN-fit so both
 * portrait and landscape clips show correctly letterboxed.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  PanResponder,
  StatusBar,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors } from '../constants/theme';

interface FullScreenVideoProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  title?: string;
}

const SKIP_MS = 10000;
const HIDE_AFTER = 3500;

function fmt(ms: number): string {
  const t = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function FullScreenVideo({ visible, uri, onClose, title }: FullScreenVideoProps) {
  const ref = useRef<Video>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [controls, setControls] = useState(true);
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPos, setScrubPos] = useState(0);

  // Refs mirror live values so the PanResponder closure (created once)
  // never reads stale state.
  const durationRef = useRef(0);
  const scrubPosRef = useRef(0);
  const barWidth = useRef(1);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  durationRef.current = duration;
  scrubPosRef.current = scrubPos;

  const buzz = () => {
    try {
      Haptics.selectionAsync();
    } catch {
      /* haptics best-effort */
    }
  };

  const armHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), HIDE_AFTER);
  }, []);

  const reveal = useCallback(() => {
    setControls(true);
    armHide();
  }, [armHide]);

  // Reset transport state every time the player opens (or the clip changes).
  useEffect(() => {
    if (visible) {
      setLoaded(false);
      setIsPlaying(true);
      setPosition(0);
      setDuration(0);
      setScrubbing(false);
      setControls(true);
      armHide();
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [visible, uri, armHide]);

  const onStatus = (st: AVPlaybackStatus) => {
    if (!st.isLoaded) return;
    setLoaded(true);
    setIsPlaying(!!st.isPlaying);
    setDuration(st.durationMillis ?? 0);
    if (!scrubbing) setPosition(st.positionMillis ?? 0);
  };

  const togglePlay = async () => {
    buzz();
    reveal();
    if (isPlaying) await ref.current?.pauseAsync();
    else await ref.current?.playAsync();
  };

  const skip = async (delta: number) => {
    buzz();
    reveal();
    const target = Math.max(0, Math.min(durationRef.current, position + delta));
    setPosition(target);
    await ref.current?.setPositionAsync(target);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setScrubbing(true);
        setControls(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth.current));
        const p = ratio * durationRef.current;
        scrubPosRef.current = p;
        setScrubPos(p);
      },
      onPanResponderMove: (e) => {
        const ratio = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidth.current));
        const p = ratio * durationRef.current;
        scrubPosRef.current = p;
        setScrubPos(p);
      },
      onPanResponderRelease: async () => {
        const target = scrubPosRef.current;
        setPosition(target);
        setScrubbing(false);
        await ref.current?.setPositionAsync(target);
        armHide();
      },
    }),
  ).current;

  const shownPos = scrubbing ? scrubPos : position;
  const pct = duration > 0 ? Math.max(0, Math.min(1, shownPos / duration)) : 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait']}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <View style={st.root}>
        {/* Tap anywhere on the video toggles the controls */}
        <TouchableOpacity
          activeOpacity={1}
          style={StyleSheet.absoluteFill}
          onPress={() => (controls ? setControls(false) : reveal())}
        >
          {uri && (
            <Video
              ref={ref}
              source={{ uri }}
              style={StyleSheet.absoluteFill}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              onPlaybackStatusUpdate={onStatus}
            />
          )}
        </TouchableOpacity>

        {!loaded && (
          <View style={st.center} pointerEvents="none">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {controls && (
          <>
            {/* Top bar: close + title */}
            <View style={st.topBar} pointerEvents="box-none">
              <TouchableOpacity onPress={onClose} hitSlop={16} style={st.iconBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              {!!title && (
                <Text numberOfLines={1} style={st.title}>
                  {title}
                </Text>
              )}
              <View style={{ width: 44 }} />
            </View>

            {/* Center transport: reverse 10s · play/pause · forward 10s */}
            {loaded && (
              <View style={st.centerRow} pointerEvents="box-none">
                <TouchableOpacity onPress={() => skip(-SKIP_MS)} hitSlop={14} style={st.skipBtn}>
                  <Ionicons name="play-back" size={28} color="#fff" />
                  <Text style={st.skipLabel}>10s</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePlay} hitSlop={14} style={st.playBtn}>
                  <Ionicons name={isPlaying ? 'pause' : 'play'} size={42} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => skip(SKIP_MS)} hitSlop={14} style={st.skipBtn}>
                  <Ionicons name="play-forward" size={28} color="#fff" />
                  <Text style={st.skipLabel}>10s</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Bottom: time + draggable scrubber */}
            <View style={st.bottomBar} pointerEvents="box-none">
              <Text style={st.time}>{fmt(shownPos)}</Text>
              <View
                style={st.barTouch}
                onLayout={(e) => {
                  barWidth.current = e.nativeEvent.layout.width || 1;
                }}
                {...pan.panHandlers}
              >
                <View style={st.barTrack}>
                  <View style={[st.barFill, { width: `${pct * 100}%` }]} />
                  <View style={[st.barThumb, { left: `${pct * 100}%` }]} />
                </View>
              </View>
              <Text style={st.time}>{fmt(duration)}</Text>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 12,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  centerRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },
  skipBtn: { alignItems: 'center', justifyContent: 'center', width: 64, height: 64 },
  skipLabel: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 2 },
  playBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: 36,
    paddingHorizontal: 16,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  time: { color: '#fff', fontSize: 12, fontWeight: '600', minWidth: 38, textAlign: 'center' },
  barTouch: { flex: 1, height: 36, justifyContent: 'center' },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, height: 4, borderRadius: 2, backgroundColor: Colors.pepTeal },
  barThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: Colors.pepTeal,
  },
});

export default FullScreenVideo;
