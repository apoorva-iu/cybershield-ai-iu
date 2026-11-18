import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

const STORAGE_KEY = 'cs_theme';

export function getStoredTheme() {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'light' || val === 'dark') return val;
  } catch (e) {
    // localStorage may be disabled or restricted
  }
  return null;
}

export function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function getActiveTheme() {
  if (typeof document !== 'undefined') {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'light' || attr === 'dark') return attr;
  }
  return getStoredTheme() || getSystemTheme();
}

export function updateThemeColorMeta(theme) {
  if (typeof document === 'undefined') return;
  const color = theme === 'light' ? '#F5F9FF' : '#06142B';
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
}

export function applyTheme(theme, persist = false) {
  if (typeof document === 'undefined') return;
  const targetTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', targetTheme);
  updateThemeColorMeta(targetTheme);

  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, targetTheme);
    } catch (e) {
      // quota or security error
    }
  }

  try {
    window.dispatchEvent(new CustomEvent('cs-theme-change', { detail: { theme: targetTheme } }));
  } catch (e) {}
}

const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {}
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => getActiveTheme());

  const handleSetTheme = useCallback((newTheme) => {
    const normalized = newTheme === 'light' ? 'light' : 'dark';
    setThemeState(normalized);
    applyTheme(normalized, true);
  }, []);

  const toggleTheme = useCallback(() => {
    handleSetTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, handleSetTheme]);

  useEffect(() => {
    // Ensure document is marked ready for transitions after initial mount
    const timer = setTimeout(() => {
      document.documentElement.classList.add('theme-ready');
    }, 50);

    // Sync state if external change occurs (e.g. storage event or custom event)
    const onThemeChange = (e) => {
      if (e?.detail?.theme && e.detail.theme !== theme) {
        setThemeState(e.detail.theme);
      }
    };

    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyTheme(e.newValue, false);
      }
    };

    // System scheme listener if user has not explicitly stored a preference
    let mediaQuery = null;
    const onMediaChange = (e) => {
      const stored = getStoredTheme();
      if (!stored) {
        const sys = e.matches ? 'light' : 'dark';
        setThemeState(sys);
        applyTheme(sys, false);
      }
    };

    if (window.matchMedia) {
      mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', onMediaChange);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(onMediaChange);
      }
    }

    window.addEventListener('cs-theme-change', onThemeChange);
    window.addEventListener('storage', onStorage);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('cs-theme-change', onThemeChange);
      window.removeEventListener('storage', onStorage);
      if (mediaQuery) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', onMediaChange);
        } else if (mediaQuery.removeListener) {
          mediaQuery.removeListener(onMediaChange);
        }
      }
    };
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: handleSetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Universal ThemeToggle button
 * Shows Sun icon when in dark mode (to switch to light)
 * Shows Moon icon when in light mode (to switch to dark)
 */
export function ThemeToggle({
  variant = 'default',
  className = '',
  showLabel = false,
  labelPosition = 'right'
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const labelText = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const actionText = isDark ? 'Light mode' : 'Dark mode';

  return (
    <button
      type="button"
      className={`theme-toggle-btn theme-toggle-${variant} ${className}`}
      onClick={toggleTheme}
      aria-label={labelText}
      title={labelText}
    >
      <span className="theme-toggle-icon-wrap" aria-hidden="true">
        {isDark ? (
          <Sun size={17} className="theme-toggle-icon" />
        ) : (
          <Moon size={17} className="theme-toggle-icon" />
        )}
      </span>
      {showLabel && (
        <span className="theme-toggle-label">{actionText}</span>
      )}
    </button>
  );
}
export default ThemeToggle;
