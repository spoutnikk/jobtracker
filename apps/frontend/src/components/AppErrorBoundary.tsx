import { Component, type ErrorInfo, type ReactNode } from "react";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Unhandled application error", error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
          <section
            role="alert"
            className="w-full max-w-lg rounded-lg border border-red-200 bg-white p-6 shadow-sm"
          >
            <h1 className="text-2xl font-bold text-gray-900">
              Une erreur inattendue est survenue
            </h1>

            <p className="mt-3 text-gray-600">
              L'application n'a pas pu afficher cette page correctement.
            </p>

            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-6 rounded-md bg-blue-600 px-4 py-2 font-medium text-white"
            >
              Réessayer
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
