import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * DesktopGate — PepTalk is a phone app. On desktop/laptop browsers we don't run
 * the mobile UI (it stretches and looks broken); instead we show this clean
 * "open on your phone" screen. Phones + tablets get the real app.
 */
export default function DesktopGate() {
  return (
    <View style={styles.wrap}>
      <LinearGradient
        colors={['#EAEFEA', '#C6E0D8', '#AED0C6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.card}>
        <Text style={styles.logo}>PepTalk</Text>
        <View style={styles.bar} />
        <Text style={styles.title}>PepTalk is a mobile app</Text>
        <Text style={styles.body}>
          Open it on your phone to install PepTalk and get started.
        </Text>
        <View style={styles.urlPill}>
          <Text style={styles.url}>peptalk.bio</Text>
        </View>
        <Text style={styles.hint}>
          Visit peptalk.bio on your iPhone or Android and tap “Install”.
        </Text>
      </View>
    </View>
  );
}

const INK = '#2D2D2D';
const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', maxWidth: 460 },
  logo: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -1,
    color: INK,
    fontFamily: 'Georgia',
  },
  bar: { width: 44, height: 3, borderRadius: 2, backgroundColor: '#E89672', marginTop: 12, marginBottom: 28 },
  title: { fontSize: 24, fontWeight: '700', color: INK, textAlign: 'center', marginBottom: 10 },
  body: { fontSize: 16, lineHeight: 24, color: '#4B5B54', textAlign: 'center', marginBottom: 24 },
  urlPill: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    marginBottom: 16,
  },
  url: { fontSize: 18, fontWeight: '700', color: INK, letterSpacing: 0.3 },
  hint: { fontSize: 13, color: '#5F6F68', textAlign: 'center' },
});
