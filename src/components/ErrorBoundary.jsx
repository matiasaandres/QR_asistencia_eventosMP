import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    localStorage.removeItem('mp_current_tab');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <div>
                <h1 className="text-lg font-bold">Ocurrió un error al cargar la vista</h1>
                <p className="text-xs text-slate-400">MundoPalabra Acceso</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl font-mono text-xs text-rose-300 overflow-x-auto max-h-48 border border-slate-800">
              {this.state.error?.toString() || "Error desconocido"}
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] text-slate-500 mt-2 whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 bg-sky-600 hover:bg-sky-500 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Recargar Aplicación
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold rounded-xl text-xs"
              >
                Limpiar Datos
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
