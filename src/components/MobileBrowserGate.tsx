import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

function goInstall() {
  if (typeof window !== 'undefined') window.location.href = '/install.html';
}

/**
 * MobileBrowserGate — PepTalk only runs as the INSTALLED app (standalone). If it's
 * opened in a mobile browser tab (not launched from the Home-screen icon), we don't
 * run the app in the browser — we tell them to open it from Home, or install it.
 */
export default function MobileBrowserGate() {
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
        <Text style={styles.title}>Open the PepTalk app</Text>
        <Text style={styles.body}>
          PepTalk runs as its own app — not in your browser. Tap the PepTalk icon on your
          Home screen to open it.
        </Text>
        <Pressable style={styles.btn} onPress={goInstall}>
          <Text style={styles.btnText}>Not installed yet? Install PepTalk</Text>
        </Pressable>
      </View>
    </View>
  );
}

const INK = '#2D2D2D';
const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', maxWidth: 420, width: '100%' },
  logo: { fontSize: 40, fontWeight: '800', letterSpacing: -1, color: INK, fontFamily: 'Georgia' },
  bar: { width: 44, height: 3, borderRadius: 2, backgroundColor: '#E89672', marginTop: 12, marginBottom: 26 },
  title: { fontSize: 23, fontWeight: '700', color: INK, textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 16, lineHeight: 24, color: '#4B5B54', textAlign: 'center', marginBottom: 28 },
  btn: {
    backgroundColor: '#14b8a6',
    paddingHorizontal: 24,
    paddingVertical: 15,
    borderRadius: 14,
    width: '100%',
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
