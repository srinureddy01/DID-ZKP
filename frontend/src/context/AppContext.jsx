// frontend/src/context/AppContext.jsx
import React, { createContext, useContext, useState, useCallback } from 'react';

// Create context
const AppContext = createContext();

// Custom hook to use context
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

// Provider component
export const AppProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(false);

  // Add notification
  const addNotification = useCallback((notification) => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, ...notification }]);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
    
    return id;
  }, []);

  // Remove notification
  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  // Show toast message
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Clear toast
  const clearToast = useCallback(() => {
    setToast(null);
  }, []);

  const value = {
    notifications,
    toast,
    loading,
    addNotification,
    removeNotification,
    showToast,
    clearToast,
    setLoading
  };

  return (
    <AppContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
      {notifications.map(notif => (
        <div key={notif.id} className={`notification notification-${notif.type}`}>
          <span>{notif.message}</span>
          <button onClick={() => removeNotification(notif.id)}>×</button>
        </div>
      ))}
    </AppContext.Provider>
  );
};
