/**
 * SquareCardForm (WEB ONLY) — collects a card via the Square Web Payments SDK,
 * tokenizes it, and starts a recurring PepTalk subscription through the
 * `square-subscribe` edge function. Native builds get the no-op stub in
 * SquareCardForm.tsx (this file is never bundled on iOS/Android).
 */
import { useEffect, useRef, useState } from 'react';
import { toUserMessage } from '../lib/errorMessages';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  SQUARE_APPLICATION_ID,
  SQUARE_LOCATION_ID,
  SQUARE_SDK_URL,
} from '../config/square';
import { subscribeWithCardToken } from '../services/squareService';
import { useSubscriptionStore } from '../store/useSubscriptionStore';

type Props = {
  productId: string;
  planName: string;
  priceLabel: string;
  onClose: () => void;
  onSuccess: (tier: string) => void;
};

function loadSdk(): Promise<any> {
  const w = window as any;
  if (w.Square) return Promise.resolve(w.Square);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SQUARE_SDK_URL}"]`);
    const done = () => (w.Square ? resolve(w.Square) : reject(new Error('Square SDK failed to load')));
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => reject(new Error('Square SDK failed to load')));
      return;
    }
    const s = document.createElement('script');
    s.src = SQUARE_SDK_URL;
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error('Square SDK failed to load'));
    document.head.appendChild(s);
  });
}

export function SquareCardForm({ productId, planName, priceLabel, onClose, onSuccess }: Props) {
  const cardRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Square = await loadSdk();
        const payments = Square.payments(SQUARE_APPLICATION_ID, SQUARE_LOCATION_ID);
        const card = await payments.card();
        await card.attach('#sq-card-container');
        if (cancelled) {
          await card.destroy?.();
          return;
        }
        cardRef.current = card;
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          setError(toUserMessage(e, 'Could not load the card form.'));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      cardRef.current?.destroy?.();
    };
  }, []);

  const handleSubscribe = async () => {
    if (submitting || !cardRef.current) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await cardRef.current.tokenize();
      if (result.status !== 'OK' || !result.token) {
        throw new Error(result?.errors?.[0]?.message ?? 'Card was declined or incomplete.');
      }
      const { tier } = await subscribeWithCardToken({ productId, cardToken: result.token });
      await useSubscriptionStore.getState().syncFromServer();
      onSuccess(tier);
    } catch (e: any) {
      setError(toUserMessage(e, 'Subscription could not be completed.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Subscribe to {planName}</Text>
          <Text style={styles.price}>{priceLabel} · auto-renews monthly · cancel anytime</Text>

          {/* Square Web Payments SDK mounts the card fields into this container. */}
          <View nativeID="sq-card-container" style={styles.cardContainer} />

          {loading ? <ActivityIndicator style={{ marginVertical: 12 }} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={handleSubscribe}
            disabled={loading || submitting}
            style={[styles.payBtn, (loading || submitting) && styles.payBtnDisabled]}
            accessibilityRole="button"
          >
            <Text style={styles.payBtnText}>{submitting ? 'Processing…' : `Subscribe · ${priceLabel}`}</Text>
          </Pressable>
          <Pressable onPress={onClose} disabled={submitting} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          <Text style={styles.legal}>
            You authorize PepTalk to charge this card {priceLabel} monthly until you cancel.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#12141a', borderRadius: 18, padding: 22 },
  title: { color: '#fff', fontSize: 20, fontWeight: '700' },
  price: { color: '#9aa1ad', fontSize: 13, marginTop: 4, marginBottom: 16 },
  cardContainer: { minHeight: 90, borderRadius: 10, backgroundColor: '#fff', padding: 4 },
  error: { color: '#ff6b6b', fontSize: 13, marginTop: 10 },
  payBtn: { marginTop: 16, backgroundColor: '#6c5ce7', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  payBtnDisabled: { opacity: 0.5 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: '#9aa1ad', fontSize: 14 },
  legal: { color: '#6b7280', fontSize: 11, marginTop: 14, lineHeight: 15 },
});
