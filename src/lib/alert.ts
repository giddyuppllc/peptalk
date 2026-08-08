/**
 * alert — cross-platform `Alert.alert()`.
 *
 * NATIVE: re-exports React Native's real Alert unchanged, so iOS/Android
 * behaviour is byte-for-byte what it was. Metro resolves `alert.web.ts` on web,
 * where RN Web's Alert is an empty no-op — see alertDispatch.ts for the full
 * story and the mapping rules.
 *
 * Call sites should import from here instead of 'react-native':
 *     import { Alert } from '../src/lib/alert';
 */
export { Alert } from 'react-native';
