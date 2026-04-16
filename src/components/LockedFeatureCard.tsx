/**
 * LockedFeatureCard — wraps a feature card. If the user doesn't have the
 * feature, dims the children, overlays a lock badge, and opens PaywallModal
 * when tapped anywhere on the card.
 *
 * Usage:
 *   <LockedFeatureCard feature="workout_programs" tier="pro">
 *     <MyProgramCard ... />
 *   </LockedFeatureCard>
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { PaywallModal } from './PaywallModal';
import { LockBadge } from './LockBadge';

interface LockedFeatureCardProps {
  feature: string;
  tier: 'plus' | 'pro';
  children: React.ReactNode;
  /** Style applied to the outer wrapper */
  style?: ViewStyle;
  /** Position of the lock badge overlay (default 'top-right') */
  badgePosition?: 'top-right' | 'top-left';
  /** How much to dim the locked children (default 0.55) */
  dimOpacity?: number;
}

export function LockedFeatureCard({
  feature,
  tier,
  children,
  style,
  badgePosition = 'top-right',
  dimOpacity = 0.55,
}: LockedFeatureCardProps) {
  const hasAccess = useFeatureGate(feature);
  const [modalVisible, setModalVisible] = useState(false);

  if (hasAccess) {
    return <View style={style}>{children}</View>;
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setModalVisible(true)}
        style={[styles.wrapper, style]}
      >
        <View style={[styles.dimmed, { opacity: dimOpacity }]} pointerEvents="none">
          {children}
        </View>
        {/* Frosted lock overlay */}
        <View style={styles.lockOverlay} pointerEvents="none">
          <LockBadge tier={tier} size="md" position={badgePosition} />
        </View>
      </TouchableOpacity>

      <PaywallModal
        visible={modalVisible}
        feature={feature}
        onDismiss={() => setModalVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  dimmed: {
    // dimming is handled via opacity prop
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default LockedFeatureCard;
