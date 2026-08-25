/**
 * Personal details — the customer's own account information.
 *
 * Server-backed rather than a local store. Every other profile-ish thing here
 * lives in zustand and persists to the device, and that pattern has repeatedly
 * lost data on reinstall (onboarding answers, chat history, side-effect logs).
 * Account details are precisely what a customer expects to find waiting on a
 * new phone, so `profiles` is the source of truth and this screen reads and
 * writes it directly.
 *
 * Everything except the name is optional. Nothing in the app gates on an
 * address or a phone number, and nothing should start to without Edward saying
 * so.
 *
 * Save state is explicit — Saving / Saved / an error. savePersonalDetails
 * returns a confirmed boolean, and showing "Saved" over a write that silently
 * failed is the exact failure this codebase keeps hitting.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { V3DetailShell, GlassCard } from '../../src/components/v3';
import { useV3Theme } from '../../src/theme/V3ThemeProvider';
import { tapLight } from '../../src/utils/haptics';
import {
  fetchPersonalDetails,
  savePersonalDetails,
  isValidDateOfBirth,
  EMPTY_DETAILS,
  type PersonalDetails,
} from '../../src/services/profileService';

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

interface FieldSpec {
  key: keyof PersonalDetails;
  label: string;
  placeholder: string;
  keyboardType?: 'default' | 'phone-pad' | 'numbers-and-punctuation';
  autoCapitalize?: 'none' | 'words' | 'characters';
  hint?: string;
}

const IDENTITY: FieldSpec[] = [
  { key: 'firstName', label: 'First name', placeholder: 'First name', autoCapitalize: 'words' },
  { key: 'lastName', label: 'Last name', placeholder: 'Last name', autoCapitalize: 'words' },
  { key: 'phone', label: 'Phone', placeholder: 'Optional', keyboardType: 'phone-pad' },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    placeholder: 'YYYY-MM-DD',
    keyboardType: 'numbers-and-punctuation',
    hint: 'Optional. Format: YYYY-MM-DD',
  },
];

const ADDRESS: FieldSpec[] = [
  { key: 'addressLine1', label: 'Address', placeholder: 'Street address', autoCapitalize: 'words' },
  { key: 'addressLine2', label: 'Address line 2', placeholder: 'Apt, suite (optional)', autoCapitalize: 'words' },
  { key: 'city', label: 'City', placeholder: 'City', autoCapitalize: 'words' },
  { key: 'region', label: 'State / Region', placeholder: 'State or region', autoCapitalize: 'words' },
  { key: 'postalCode', label: 'ZIP / Postal code', placeholder: 'Postal code', autoCapitalize: 'characters' },
  { key: 'country', label: 'Country', placeholder: 'Country', autoCapitalize: 'words' },
];

export default function PersonalDetailsScreen() {
  const t = useV3Theme();
  const [details, setDetails] = useState<PersonalDetails>(EMPTY_DETAILS);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const loaded = await fetchPersonalDetails();
      if (!active) return;
      if (loaded) {
        setDetails(loaded);
        setStatus('idle');
      } else {
        setStatus('error');
        setMessage('Could not load your details. Check your connection and try again.');
      }
    })();
    return () => { active = false; };
  }, []);

  const set = useCallback((key: keyof PersonalDetails, value: string) => {
    setDetails((d) => ({ ...d, [key]: value }));
    // Any edit invalidates a previous "Saved" — leaving it up would tell the
    // user their current text is stored when it is not.
    setStatus((s) => (s === 'saved' || s === 'error' ? 'idle' : s));
  }, []);

  const onSave = useCallback(async () => {
    if (!isValidDateOfBirth(details.dateOfBirth)) {
      setStatus('error');
      setMessage('Enter your date of birth as YYYY-MM-DD, or leave it blank.');
      return;
    }
    tapLight();
    setStatus('saving');
    const ok = await savePersonalDetails(details);
    setStatus(ok ? 'saved' : 'error');
    setMessage(ok ? '' : 'Could not save. Check your connection and try again.');
  }, [details]);

  const renderField = (f: FieldSpec) => (
    <View key={f.key} style={styles.field}>
      <Text style={[styles.label, { color: t.colors.textSecondary }]}>{f.label}</Text>
      <TextInput
        value={details[f.key]}
        onChangeText={(v) => set(f.key, v)}
        placeholder={f.placeholder}
        placeholderTextColor={t.colors.textSecondary}
        keyboardType={f.keyboardType ?? 'default'}
        autoCapitalize={f.autoCapitalize ?? 'none'}
        accessibilityLabel={f.label}
        style={[
          styles.input,
          { color: t.colors.textPrimary, backgroundColor: t.colors.cardBg, borderColor: t.colors.cardBorder },
        ]}
      />
      {!!f.hint && <Text style={[styles.hint, { color: t.colors.textSecondary }]}>{f.hint}</Text>}
    </View>
  );

  if (status === 'loading') {
    return (
      <V3DetailShell title="Personal details" observation="Your account information.">
        <View style={styles.centre}>
          <ActivityIndicator color={t.colors.textPrimary} />
        </View>
      </V3DetailShell>
    );
  }

  return (
    <V3DetailShell
      title="Personal details"
      observation="Your account information — only your name is required."
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }} keyboardShouldPersistTaps="handled">
        <GlassCard style={styles.card}>
          <Text style={[styles.section, { color: t.colors.textPrimary }]}>You</Text>
          <View style={styles.readonly}>
            <Text style={[styles.label, { color: t.colors.textSecondary }]}>Email</Text>
            <Text style={[styles.readonlyValue, { color: t.colors.textPrimary }]}>
              {details.email || '—'}
            </Text>
            <Text style={[styles.hint, { color: t.colors.textSecondary }]}>
              This is the address you sign in with.
            </Text>
          </View>
          {IDENTITY.map(renderField)}
        </GlassCard>

        <GlassCard style={styles.card}>
          <Text style={[styles.section, { color: t.colors.textPrimary }]}>Address</Text>
          {ADDRESS.map(renderField)}
        </GlassCard>

        {status === 'error' && !!message && (
          <View style={styles.messageRow}>
            <Ionicons name="alert-circle-outline" size={16} color="#C2564B" />
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}
        {status === 'saved' && (
          <View style={styles.messageRow}>
            <Ionicons name="checkmark-circle-outline" size={16} color="#3F8F63" />
            <Text style={styles.savedText}>Saved</Text>
          </View>
        )}

        <Pressable
          onPress={onSave}
          disabled={status === 'saving'}
          accessibilityRole="button"
          accessibilityLabel="Save personal details"
          style={[
            styles.saveBtn,
            { backgroundColor: t.colors.textPrimary, opacity: status === 'saving' ? 0.6 : 1 },
          ]}
        >
          <Text style={[styles.saveText, { color: t.colors.bgBase1 }]}>
            {status === 'saving' ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </ScrollView>
    </V3DetailShell>
  );
}

const styles = StyleSheet.create({
  centre: { paddingVertical: 48, alignItems: 'center' },
  card: { padding: 16, marginBottom: 14, gap: 4 },
  section: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  field: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  hint: { fontSize: 11, marginTop: 5 },
  readonly: { marginBottom: 14 },
  readonlyValue: { fontSize: 15, fontWeight: '600' },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12, paddingHorizontal: 4 },
  errorText: { color: '#C2564B', fontSize: 13, flex: 1 },
  savedText: { color: '#3F8F63', fontSize: 13, fontWeight: '600' },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { fontSize: 15, fontWeight: '700' },
});
