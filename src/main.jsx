/**
 * Punto de entrada del cliente. Monta React y coloca toda la aplicación dentro
 * del límite de errores para evitar una pantalla en blanco sin explicación.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
