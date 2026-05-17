/**
 * Greeting — top-of-screen greeting row (§4.4 + §4.5).
 *
 * Female: "Hi, Sarah" in Playfair Display, "Saturday · May 16" sub-line.
 * Male: "EDWARD H." in Newsreader all-caps, cycle line in cognac small-caps.
 *
 * `variant`:
 *   - `home`    → full hero treatment (large font + sub-line)
 *   - `screen-header` → smaller, sits at the top of detail screens
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useV3Theme } from '../../theme/V3ThemeProvider';
import { useAuthStore } from '../../store/useAuthStore';
import { AvatarShortcut } from './AvatarShortcut';
import { ProBadge } from './ProBadge';

interface Props {
  variant?: 'home' | 'screen-header';
  /** Optional sub-line override. Female default = today's date; male default
   *  = cycle line e.g. "Retatrutide Gradual · Wk 6/12" — Phase B will wire
   *  the real cycle data. */
  subline?: string;
  /** Show the Pro badge on the right (male treatment). */
  proBadge?: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function todayLine(): string {
  const d = new Date();
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function Greeting({ variant = 'home', subline, proBadge }: Props) {
  const t = useV3Theme();
  const firstName = useAuthStore((s) => s.user?.firstName) ?? 'there';

  const isHome = variant === 'home';
  const isDark = t.isDark;

  // Male render — uppercase last initial form: "EDWARD H."
  const maleGreeting = (firstName: string) => {
    const last = (useAuthStore.getState().user?.lastName ?? '').slice(0, 1).toUpperCase();
    return `${firstName.toUpperCase()}${last ? ` ${last}.` : ''}`;
  };

  const greetingText = isDark
    ? maleGreeting(firstName)
    : `Hi, ${firstName}`;

  const sublineText = subline ?? (isDark ? '' : todayLine());

  const headlineFont = isDark ? t.typography.headlineMale : t.typography.headlineFemale;
  const headlineSize = isHome ? 28 : 20;
  const sublineSize = isHome ? 13 : 12;

  return (
    <View style={[styles.wrap, { paddingHorizontal: t.spacing.phonePaddingSides, paddingTop: isHome ? t.spacing.phonePaddingTop : t.spacing.lg }]}>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: headlineFont,
            fontSize: headlineSize,
            color: t.colors.textPrimary as string,
            letterSpacing: isDark ? 1 : -0.5,
          }}
          accessibilityRole="header"
        >
          {greetingText}
        </Text>
        {sublineText ? (
          <Text
            style={{
              fontFamily: t.typography.body,
              fontSize: sublineSize,
              color: t.colors.textSecondary as string,
              marginTop: 4,
              textTransform: isDark ? 'uppercase' : 'none',
              letterSpacing: isDark ? 1.2 : 0,
            }}
          >
            {sublineText}
          </Text>
        ) : null}
      </View>
      <View style={styles.rightSlot}>
        {proBadge ? <ProBadge style={{ marginRight: 10 }} /> : null}
        <AvatarShortcut />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
