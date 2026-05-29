// frontend/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Main App Component
import App from './App';

// Global Styles
import './styles/globals.css';
import './styles/index.css';

// Error Boundary Component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error: error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
    this.setState({ errorInfo: errorInfo });
    
    // Log to error reporting service (optional)
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container">
            <div className="error-icon">⚠️</div>
            <h1>Something went wrong</h1>
            <p>The application encountered an unexpected error.</p>
            <details className="error-details">
              <summary>Error Details</summary>
              <pre>{this.state.error?.toString()}</pre>
              <pre>{this.state.errorInfo?.componentStack}</pre>
            </details>
            <button 
              onClick={() => window.location.reload()} 
              className="btn-reload"
            >
              Reload Application
            </button>
            <button 
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              className="btn-retry"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Loading Component
const LoadingScreen = () => (
  <div className="global-loading">
    <div className="loading-content">
      <div className="loading-spinner-large"></div>
      <h2>Loading DID Protocol</h2>
      <p>Initializing secure connection...</p>
      <div className="loading-steps">
        <div className="loading-step">✓ Checking wallet connection</div>
        <div className="loading-step">⟳ Loading smart contracts</div>
        <div className="loading-step">⟳ Initializing ZKP circuits</div>
        <div className="loading-step">⟳ Connecting to IPFS</div>
      </div>
    </div>
  </div>
);

// Performance monitoring (optional)
const reportWebVitals = (metric) => {
  console.log('Web Vitals:', metric);
  // Send to analytics service
  // sendToAnalytics(metric);
};

// Initialize global error handlers
const initErrorHandlers = () => {
  // Handle uncaught promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
    // Show user-friendly notification
    const errorMessage = event.reason?.message || 'An unexpected error occurred';
    // You could dispatch a global event or show a toast
    window.dispatchEvent(new CustomEvent('app-error', { detail: { message: errorMessage } }));
  });

  // Handle global errors
  window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error);
    // Don't show user-friendly error for 404s or network errors
    if (!event.message?.includes('404') && !event.message?.includes('network')) {
      window.dispatchEvent(new CustomEvent('app-error', { 
        detail: { message: 'Application error. Please refresh the page.' } 
      }));
    }
  });
};

// Check browser compatibility
const checkBrowserCompatibility = () => {
  const requiredFeatures = [
    'window.ethereum',
    'crypto',
    'crypto.subtle',
    'localStorage',
    'WebSocket'
  ];

  const missingFeatures = requiredFeatures.filter(feature => {
    const parts = feature.split('.');
    let obj = window;
    for (const part of parts) {
      if (!obj[part]) return true;
      obj = obj[part];
    }
    return false;
  });

  if (missingFeatures.length > 0) {
    console.warn('Missing browser features:', missingFeatures);
    return false;
  }

  // Check for MetaMask
  if (!window.ethereum) {
    console.warn('MetaMask not detected');
    return false;
  }

  return true;
};

// Initialize app with fallbacks
const initApp = async () => {
  // Check browser compatibility
  const isCompatible = checkBrowserCompatibility();
  
  if (!isCompatible) {
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif;">
          <div style="text-align: center; padding: 2rem; max-width: 500px;">
            <div style="font-size: 4rem; margin-bottom: 1rem;">🌐</div>
            <h1>Browser Not Supported</h1>
            <p>Your browser does not support the features required for this application.</p>
            <p>Please use a modern browser like Chrome, Firefox, or Brave with MetaMask installed.</p>
            <a href="https://metamask.io/download/" target="_blank" style="display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; background: #667eea; color: white; text-decoration: none; border-radius: 0.5rem;">
              Install MetaMask
            </a>
          </div>
        </div>
      `;
    }
    return;
  }

  // Initialize error handlers
  initErrorHandlers();

  // Get root element
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    console.error('Root element not found');
    return;
  }

  // Create root and render
  const root = ReactDOM.createRoot(rootElement);
  
  // Show loading screen while initializing
  root.render(<LoadingScreen />);

  // Small delay to show loading screen (optional, for better UX)
  setTimeout(() => {
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
          </BrowserRouter>
        </ErrorBoundary>
      </React.StrictMode>
    );
  }, 100);

  // Report web vitals in development
  if (import.meta.env.DEV) {
    reportWebVitals(console.log);
  }
};

// Start the application
initApp().catch((error) => {
  console.error('Failed to initialize application:', error);
  
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: sans-serif;">
        <div style="text-align: center; padding: 2rem;">
          <div style="font-size: 4rem; margin-bottom: 1rem;">💥</div>
          <h1>Failed to Load Application</h1>
          <p>${error.message || 'An unexpected error occurred'}</p>
          <button onclick="window.location.reload()" style="margin-top: 1rem; padding: 0.75rem 1.5rem; background: #667eea; color: white; border: none; border-radius: 0.5rem; cursor: pointer;">
            Reload Page
          </button>
        </div>
      </div>
    `;
  }
});

// Enable hot module replacement in development
if (import.meta.hot) {
  import.meta.hot.accept();
}
