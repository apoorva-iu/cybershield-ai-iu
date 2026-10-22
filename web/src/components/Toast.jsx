import React, { useState, useEffect } from 'react';

let toastCounter = 0;
let addToastHandler = null;

export function addToast(message) {
  if (addToastHandler) {
    addToastHandler(message);
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToastHandler = (message) => {
      const id = ++toastCounter;
      setToasts(t => [...t, { id, message }]);
      setTimeout(() => {
        setToasts(t => t.filter(toast => toast.id !== id));
      }, 3000);
    };
    return () => { addToastHandler = null; };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  );
}

