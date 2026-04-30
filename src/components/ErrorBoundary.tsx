import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { captureException } from '../services/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
    // Route through the telemetry facade so this boundary reports to
    // Sentry/Bugsnag/etc. once one is wired up — without us having to
    // revisit this component. See src/services/telemetry.ts.
    captureException(error, {
      source: 'ErrorBoundary',
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  /**
   * Copies a single self-contained error report to the clipboard so the
   * user can paste it into a bug report. Includes app version, platform,
   * and the *component stack* — which is far more useful than the React
   * fiber-internal stack, especially in minified production bundles
   * where JS frames get mangled but component names survive.
   */
  handleCopy = async () => {
    const { error, errorInfo } = this.state;
    const expoVersion =
      typeof Constants !== 'undefined'
        ? `${Constants.expoConfig?.name ?? 'PepTalk'} v${Constants.expoConfig?.version ?? '?'} (${(Constants.expoConfig as any)?.ios?.buildNumber ?? (Constants.expoConfig as any)?.android?.versionCode ?? '?'})`
        : 'unknown';
    const lines = [
      `App: ${expoVersion}`,
      `Platform: ${Platform.OS} ${Platform.Version}`,
      `Time: ${new Date().toISOString()}`,
      '',
      `Error: ${error?.toString() ?? 'unknown'}`,
      '',
      'Component stack:',
      errorInfo?.componentStack ?? '(none)',
      '',
      'JS stack:',
      error?.stack ?? '(none)',
    ];
    try {
      await Clipboard.setStringAsync(lines.join('\n'));
    } catch {
      // Clipboard can fail on some devices — silently ignore, the user
      // still has the visible error text on screen.
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning-outline" size={48} color="#e3a7a1" />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.subtitle}>
              The app encountered an unexpected error. You can try again or
              restart the app.
            </Text>

            {this.state.error && (
              <ScrollView style={styles.errorBox}>
                <Text style={styles.errorTitle}>Error message:</Text>
                <Text selectable style={styles.errorText}>
                  {this.state.error.toString()}
                </Text>
                {/* Component stack first — survives minification far better
                    than the JS fiber stack and usually points at the offending
                    component by display name. */}
                {this.state.errorInfo?.componentStack && (
                  <>
                    <Text style={[styles.errorTitle, { marginTop: 12 }]}>Component stack:</Text>
                    <Text selectable style={styles.errorText}>
                      {this.state.errorInfo.componentStack.trim()}
                    </Text>
                  </>
                )}
                {this.state.error.stack && (
                  <>
                    <Text style={[styles.errorTitle, { marginTop: 12 }]}>JS stack:</Text>
                    <Text selectable style={styles.errorText}>
                      {this.state.error.stack}
                    </Text>
                  </>
                )}
              </ScrollView>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={this.handleCopy}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Copy error details to clipboard"
              >
                <Ionicons name="copy-outline" size={16} color="#2D2D2D" />
                <Text style={styles.buttonTextSecondary}>Copy details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.button}
                onPress={this.handleReset}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Ionicons name="refresh-outline" size={18} color="#2D2D2D" />
                <Text style={styles.buttonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EDE6D6',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  content: {
    alignItems: 'center',
    maxWidth: 340,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(227, 167, 161, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2D2D2D',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  errorBox: {
    maxHeight: 320,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.04)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  errorTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#dc2626',
    lineHeight: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e3a7a1',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  buttonSecondary: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D2D2D',
  },
  buttonTextSecondary: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D2D',
  },
});
