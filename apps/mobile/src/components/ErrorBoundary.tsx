import { Component, useState, type ReactNode, type ErrorInfo } from "react";
import { COLORS } from "@kanchuki/shared";
import { View, Text, TouchableOpacity } from "react-native";
import { AlertTriangle, RefreshCw, Bug } from "lucide-react-native";
import { ReportProblem } from "./ReportProblem";
import { captureException } from "../lib/sentry";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
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

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary]", error.message, errorInfo.componentStack);
    this.setState({ errorInfo });
    // Report to Sentry for automatic crash tracking
    captureException(error, errorInfo.componentStack ?? undefined);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}

// Extracted to a function component so it can use hooks (ReportProblem modal)
function ErrorFallback({
  error,
  errorInfo,
  onRetry,
}: {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
}) {
  const [showReport, setShowReport] = useState(false);

  return (
    <View className="flex-1 items-center justify-center bg-ink-50 px-8">
      <View className="w-16 h-16 bg-rust-100 rounded-3xl items-center justify-center mb-4">
        <AlertTriangle size={32} color={COLORS.danger} />
      </View>
      <Text className="text-lg font-bold text-sand-900 text-center mb-2">
        Something went wrong
      </Text>
      <Text className="text-sm text-sand-500 text-center mb-6 leading-5">
        {
          "An unexpected error occurred. This doesn't affect your data — it's all safe in the cloud."
        }
      </Text>
      {error && (
        <Text
          className="text-xs text-sand-400 mb-4 text-center max-w-xs"
          numberOfLines={3}
        >
          {error.message}
        </Text>
      )}
      <View className="gap-3 w-full max-w-xs">
        <TouchableOpacity
          onPress={onRetry}
          className="bg-ink-600 px-8 py-3.5 rounded-2xl flex-row items-center justify-center gap-2"
          activeOpacity={0.8}
        >
          <RefreshCw size={18} color="white" />
          <Text className="text-white font-semibold">Try Again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowReport(true)}
          className="bg-white border border-sand-200 px-8 py-3.5 rounded-2xl flex-row items-center justify-center gap-2"
          activeOpacity={0.8}
        >
          <Bug size={18} color={COLORS.danger} />
          <Text className="text-sand-700 font-semibold">Report this error</Text>
        </TouchableOpacity>
      </View>

      <ReportProblem
        visible={showReport}
        onClose={() => setShowReport(false)}
        errorContext={{
          errorMessage: error?.message,
          errorStack: errorInfo?.componentStack ?? undefined,
        }}
      />
    </View>
  );
}
