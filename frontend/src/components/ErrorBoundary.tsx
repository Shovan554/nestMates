import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl shadow-rose-100/40 border border-rose-100 p-8 text-center">
          <div className="text-5xl mb-4">😵‍💫</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Something broke</h1>
          <p className="text-sm text-gray-600 mb-1">{this.state.error.message}</p>
          <p className="text-xs text-gray-400 mb-6">The error has been logged to the console.</p>
          <div className="flex justify-center gap-2">
            <button
              onClick={this.reset}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm shadow-primary-200"
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = '/dashboard')}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }
}
