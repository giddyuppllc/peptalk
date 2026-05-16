/**
 * Aimee Pending Action Card
 *
 * Renders below a chat message when Aimee proposed a write that needs user
 * confirmation. Two variants by `tool`:
 *
 *   draft_meal_template — shows meal title, item list, macro totals.
 *     Confirm → POST aimee-action-confirm → row appears in meal_entries.
 *
 *   propose_log_field   — shows "Log [field] = [value] to today's check-in?".
 *     Confirm → POST aimee-action-confirm → check_ins row inserted/updated.
 *
 * Cancel always flips the row's status to 'cancelled' and never writes.
 *
 * Visual: small chip-bar with two buttons. No modal — keeps the chat thread
 * scrollable and lets the user keep typing while they decide.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveAimeeAction } from '../services/llmService';
import { Colors, FontSizes, Spacing, BorderRadius } from '../constants/theme';
import { tapMedium } from '../utils/haptics';
import type { AimeePendingAction } from '../types';

interface Props {
  action: AimeePendingAction;
  onResolved?: (decision: 'confirm' | 'cancel') => void;
  /**
   * Optional handler for actions that should resolve client-side instead
   * of via the aimee-action-confirm edge function. Used for the deferred
   * write tools (log_dose, log_meal, schedule_workout) that the chat
   * client routes through this card to require user confirmation. When
   * provided AND action.id starts with `client-`, we call this instead
   * of POSTing to the server.
   */
  onLocalConfirm?: (action: AimeePendingAction) => Promise<{ ok: boolean; error?: string }>;
}

export const AimeePendingActionCard: React.FC<Props> = ({ action, onResolved, onLocalConfirm }) => {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'confirmed' | 'cancelled' | 'error'>(
    action.status === 'confirmed'
      ? 'confirmed'
      : action.status === 'cancelled'
        ? 'cancelled'
        : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isClientSide = action.id.startsWith('client-') && !!onLocalConfirm;

  const resolve = async (decision: 'confirm' | 'cancel') => {
    if (status !== 'idle') return;
    setStatus('submitting');
    setErrorMessage(null);
    tapMedium();
    let result: { ok: boolean; error?: string };
    if (isClientSide) {
      // Client-side write — no server row to flip. Cancel is always a no-op.
      if (decision === 'cancel') {
        result = { ok: true };
      } else {
        result = await onLocalConfirm!(action);
      }
    } else {
      result = await resolveAimeeAction({
        actionId: action.id,
        decision,
      });
    }
    if (!result.ok) {
      setStatus('error');
      setErrorMessage(result.error ?? 'Failed to save');
      return;
    }
    setStatus(decision === 'confirm' ? 'confirmed' : 'cancelled');
    onResolved?.(decision);
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Ionicons
          name={iconForTool(action.tool)}
          size={16}
          color={Colors.orchidDeep}
          style={{ marginRight: 6 }}
        />
        <Text style={styles.headerText}>{titleForTool(action.tool)}</Text>
      </View>

      <View style={styles.previewBlock}>{renderPreview(action)}</View>

      {status === 'idle' && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.btn, styles.confirmBtn]}
            onPress={() => resolve('confirm')}
            accessibilityLabel="Confirm the action Aimee proposed"
          >
            <Ionicons name="checkmark" size={14} color={Colors.white} />
            <Text style={styles.confirmBtnText}>Confirm</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.cancelBtn]}
            onPress={() => resolve('cancel')}
            accessibilityLabel="Cancel the action Aimee proposed"
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'submitting' && (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color={Colors.orchidDeep} />
          <Text style={styles.statusText}>Saving…</Text>
        </View>
      )}

      {status === 'confirmed' && (
        <View style={styles.statusRow}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
          <Text style={[styles.statusText, { color: Colors.success }]}>Saved</Text>
        </View>
      )}

      {status === 'cancelled' && (
        <View style={styles.statusRow}>
          <Ionicons name="close-circle-outline" size={14} color={Colors.darkTextSecondary} />
          <Text style={styles.statusText}>Cancelled</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.statusRow}>
          <Ionicons name="alert-circle" size={14} color={Colors.error} />
          <Text style={[styles.statusText, { color: Colors.error }]}>
            {errorMessage ?? 'Failed'}
          </Text>
          <TouchableOpacity onPress={() => setStatus('idle')} style={{ marginLeft: 8 }}>
            <Text style={[styles.statusText, { textDecorationLine: 'underline' }]}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

function iconForTool(tool: string): keyof typeof Ionicons.glyphMap {
  if (tool === 'draft_meal_template') return 'restaurant-outline';
  if (tool === 'propose_log_field') return 'clipboard-outline';
  if (tool === 'log_dose') return 'flask-outline';
  if (tool === 'log_meal') return 'nutrition-outline';
  if (tool === 'schedule_workout') return 'barbell-outline';
  return 'sparkles-outline';
}

function titleForTool(tool: string): string {
  if (tool === 'draft_meal_template') return 'Meal template — Confirm to add';
  if (tool === 'propose_log_field') return 'Today\'s log — Confirm to add';
  if (tool === 'log_dose') return 'Log this dose? — Confirm to save';
  if (tool === 'log_meal') return 'Log this meal? — Confirm to save';
  if (tool === 'schedule_workout') return 'Schedule this workout? — Confirm to save';
  return 'Aimee proposed an action';
}

function renderPreview(action: AimeePendingAction): React.ReactNode {
  const p = action.preview ?? {};
  if (action.tool === 'draft_meal_template') {
    const items = Array.isArray(p.items) ? (p.items as any[]) : [];
    const totals = (p.totals as any) ?? {};
    return (
      <>
        {p.title ? <Text style={styles.previewTitle}>{String(p.title)}</Text> : null}
        {items.slice(0, 8).map((it, i) => (
          <Text key={i} style={styles.previewLine}>
            • {it?.name ?? '—'}
            {it?.amount ? `  (${it.amount})` : ''}
          </Text>
        ))}
        {(totals.calories || totals.protein) ? (
          <Text style={styles.previewMacro}>
            ~{Math.round(totals.calories ?? 0)} cal · {Math.round(totals.protein ?? 0)}g protein ·{' '}
            {Math.round(totals.carbs ?? 0)}g carbs · {Math.round(totals.fat ?? 0)}g fat
          </Text>
        ) : null}
        {p.notes ? <Text style={styles.previewNote}>{String(p.notes)}</Text> : null}
      </>
    );
  }
  if (action.tool === 'propose_log_field') {
    const field = String(p.field ?? '');
    const value = p.value;
    return (
      <Text style={styles.previewLine}>
        {labelForField(field)}:{' '}
        <Text style={styles.previewValue}>
          {Array.isArray(value) ? value.join(', ') : String(value)}
        </Text>
      </Text>
    );
  }
  if (action.tool === 'log_dose') {
    const name = String(p.peptideName ?? p.peptide ?? p.peptideId ?? 'peptide');
    const amount = p.amount ?? p.dose;
    const unit = String(p.unit ?? 'mcg');
    const route = p.route ? ` · ${String(p.route)}` : '';
    return (
      <Text style={styles.previewLine}>
        <Text style={styles.previewTitle}>{name}</Text>
        {'  '}
        <Text style={styles.previewValue}>
          {amount} {unit}
        </Text>
        {route}
      </Text>
    );
  }
  if (action.tool === 'log_meal') {
    const name = String(p.name ?? p.title ?? p.foodName ?? 'meal');
    const cals = p.calories ?? p.cal;
    const proteinG = p.proteinG ?? p.protein;
    return (
      <>
        <Text style={styles.previewTitle}>{name}</Text>
        {(cals != null || proteinG != null) && (
          <Text style={styles.previewMacro}>
            {cals != null ? `${Math.round(Number(cals))} cal` : ''}
            {cals != null && proteinG != null ? ' · ' : ''}
            {proteinG != null ? `${Math.round(Number(proteinG))}g protein` : ''}
          </Text>
        )}
      </>
    );
  }
  if (action.tool === 'schedule_workout') {
    const name = String(p.name ?? p.title ?? 'workout');
    const date = p.date ? String(p.date) : '';
    const duration = p.durationMin ? `${p.durationMin} min` : '';
    return (
      <>
        <Text style={styles.previewTitle}>{name}</Text>
        {(date || duration) && (
          <Text style={styles.previewMacro}>
            {date}
            {date && duration ? ' · ' : ''}
            {duration}
          </Text>
        )}
      </>
    );
  }
  return <Text style={styles.previewLine}>(no preview)</Text>;
}

function labelForField(f: string): string {
  switch (f) {
    case 'mood':
      return 'Mood';
    case 'energy':
      return 'Energy';
    case 'sleepHours':
      return 'Sleep (hours)';
    case 'weightLbs':
      return 'Weight (lbs)';
    case 'symptoms':
      return 'Symptoms';
    case 'notes':
      return 'Notes';
    default:
      return f;
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(155, 134, 164, 0.06)',
    borderColor: 'rgba(155, 134, 164, 0.25)',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  headerText: {
    fontSize: FontSizes.xs,
    fontWeight: '600',
    color: Colors.orchidDarker,
  },
  previewBlock: {
    marginBottom: Spacing.sm,
  },
  previewTitle: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.darkText,
    marginBottom: 4,
  },
  previewLine: {
    fontSize: FontSizes.xs,
    color: Colors.darkText,
    lineHeight: 18,
  },
  previewValue: {
    fontWeight: '600',
  },
  previewMacro: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
    marginTop: 6,
  },
  previewNote: {
    fontSize: FontSizes.xs,
    fontStyle: 'italic',
    color: Colors.darkTextSecondary,
    marginTop: 6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.md,
    gap: 4,
  },
  confirmBtn: {
    backgroundColor: Colors.orchidDeep,
  },
  confirmBtnText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: '600',
  },
  cancelBtn: {
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    backgroundColor: 'transparent',
  },
  cancelBtnText: {
    color: Colors.darkTextSecondary,
    fontSize: FontSizes.xs,
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: FontSizes.xs,
    color: Colors.darkTextSecondary,
  },
});
