import { Component, type ReactNode, type ErrorInfo } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { AlertTriangle, RefreshCw } from 'lucide-react-native'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary]', error.message, errorInfo.componentStack)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <View className="flex-1 items-center justify-center bg-cyan-50 px-8">
          <View className="w-16 h-16 bg-red-100 rounded-3xl items-center justify-center mb-4">
            <AlertTriangle size={32} color="#EF4444" />
          </View>
          <Text className="text-lg font-bold text-gray-900 text-center mb-2">
            Something went wrong
          </Text>
          <Text className="text-sm text-gray-500 text-center mb-6 leading-5">
            An unexpected error occurred. This doesn't affect your data — it's all safe in the cloud.
          </Text>
          {this.state.error && (
            <Text
              className="text-xs text-gray-400 mb-4 text-center max-w-xs"
              numberOfLines={3}
            >
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity
            onPress={this.handleRetry}
            className="bg-cyan-600 px-8 py-3.5 rounded-2xl flex-row items-center gap-2"
            activeOpacity={0.8}
          >
            <RefreshCw size={18} color="white" />
            <Text className="text-white font-semibold">Try Again</Text>
          </TouchableOpacity>
        </View>
      )
    }

    return this.props.children
  }
}
