import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { subscribeToSettings } from './lib/settings';
import { MainLayout } from './components/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { VocabularyManager } from './pages/VocabularyManager';
import { FlashcardReview } from './pages/FlashcardReview';
import { SettingsPage } from './pages/SettingsPage';
import { GrammarManager } from './pages/GrammarManager';
import { QuizPage } from './pages/QuizPage';
import { ListeningPage } from './pages/ListeningPage';
import { PomodoroPage } from './pages/PomodoroPage';
import { TodoPage } from './pages/TodoPage';
import { CompactView } from './components/CompactView';
import './App.css';

const detectMode = (): 'popup' | 'sidepanel' | 'dashboard' => {
  const params = new URLSearchParams(window.location.search);
  const modeParam = params.get('mode');
  if (modeParam === 'popup') return 'popup';
  if (modeParam === 'sidepanel') return 'sidepanel';
  if (modeParam === 'dashboard') return 'dashboard';
  
  // If we have a hash route (e.g. #/settings or #/todos), it is the dashboard
  if (window.location.hash && window.location.hash.length > 1) {
    return 'dashboard';
  }
  
  // Fallback detection using chrome extension API
  if (typeof chrome !== 'undefined' && chrome.extension?.getViews) {
    try {
      const views = chrome.extension.getViews({ type: 'popup' });
      if (views.includes(window)) {
        return 'popup';
      }
    } catch (e) {
      // ignore
    }
  }
  
  // In extension context without a hash route, default to sidepanel
  return 'sidepanel';
};

function App() {
  const [themeMode, setThemeMode] = useState<'system'|'light'|'dark'>('light');
  const [mode, setMode] = useState<'popup' | 'sidepanel' | 'dashboard'>(detectMode);

  useEffect(() => {
    const applyClasses = (m: 'popup' | 'sidepanel' | 'dashboard') => {
      const body = document.body;
      const html = document.documentElement;
      if (m === 'popup') {
        body.classList.add('popup-mode');
        body.classList.remove('sidepanel-mode', 'dashboard-mode');
        html.classList.add('popup-mode');
        html.classList.remove('sidepanel-mode', 'dashboard-mode');
      } else if (m === 'sidepanel') {
        body.classList.add('sidepanel-mode');
        body.classList.remove('popup-mode', 'dashboard-mode');
        html.classList.add('sidepanel-mode');
        html.classList.remove('popup-mode', 'dashboard-mode');
      } else {
        body.classList.add('dashboard-mode');
        body.classList.remove('popup-mode', 'sidepanel-mode');
        html.classList.add('dashboard-mode');
        html.classList.remove('popup-mode', 'sidepanel-mode');
      }
    };

    applyClasses(mode);

    const handleResize = () => {
      const params = new URLSearchParams(window.location.search);
      if (!params.get('mode')) {
        const newMode = detectMode();
        setMode(newMode);
        applyClasses(newMode);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); };
  }, [mode]);

  // Track the side panel for the background shortcut toggle.
  useEffect(() => {
    if (mode !== 'sidepanel') return;

    let isUnmounted = false;
    let port: chrome.runtime.Port | null = null;
    let heartbeatTimer: any = null;

    const connectPort = () => {
      if (isUnmounted) return;
      if (typeof chrome === 'undefined' || !chrome.runtime?.connect) return;

      try {
        port = chrome.runtime.connect({ name: 'sidepanel' });

        port.onDisconnect.addListener(() => {
          port = null;
          if (!isUnmounted) {
            // Reconnect if service worker restarted while panel is open
            setTimeout(connectPort, 200);
          }
        });

        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          try {
            port?.postMessage({ type: 'HEARTBEAT' });
          } catch {}
        }, 25000);
      } catch (e) {
        console.warn("Side panel port connect failed:", e);
      }
    };

    connectPort();

    let customShortcutKey = 'e';
    let customModifiers = { metaOrCtrl: true, shift: true, alt: false };

    if (typeof chrome !== 'undefined' && chrome.commands?.getAll) {
      try {
        chrome.commands.getAll((commands) => {
          const cmd = commands.find(c => c.name === 'open_side_panel');
          if (cmd?.shortcut) {
            const parts = cmd.shortcut.toLowerCase().split('+');
            const lastKey = parts[parts.length - 1];
            customShortcutKey = lastKey;
            customModifiers = {
              metaOrCtrl: parts.includes('command') || parts.includes('ctrl') || parts.includes('macctrl'),
              shift: parts.includes('shift'),
              alt: parts.includes('alt') || parts.includes('option')
            };
          }
        });
      } catch {
        // ignore
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const keyLower = e.key.toLowerCase();
      const codeMatches = e.code.toLowerCase() === `key${customShortcutKey.toLowerCase()}`;

      // Default Cmd/Ctrl + Shift + E
      const isDefault = isCmdOrCtrl && e.shiftKey && (keyLower === 'e' || e.code === 'KeyE');

      // Custom shortcut if reconfigured in chrome://extensions/shortcuts
      const isCustom = 
        (!customModifiers.metaOrCtrl || isCmdOrCtrl) &&
        (!customModifiers.shift || e.shiftKey) &&
        (!customModifiers.alt || e.altKey) &&
        (keyLower === customShortcutKey.toLowerCase() || codeMatches);

      if (isDefault || isCustom) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'CLOSE_SIDE_PANEL_BY_SHORTCUT' })
            .then((result: { ok?: boolean; error?: string }) => {
              if (!result?.ok) console.error('Failed to close side panel via keyboard shortcut:', result?.error);
            })
            .catch((error) => console.error('Failed to close side panel via keyboard shortcut:', error));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      isUnmounted = true;
      clearInterval(heartbeatTimer);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (port) {
        try {
          port.disconnect();
        } catch {}
      }
    };
  }, [mode]);

  useEffect(() => {
    const unsubscribe = subscribeToSettings((settings) => {
      setThemeMode(settings.theme || 'light');
    });
    return () => { unsubscribe(); };
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDark]);

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#0284c7',
          colorPrimaryHover: '#0ea5e9',
          colorSuccess: '#10b981',
          colorWarning: '#f59e0b',
          colorError: '#f43f5e',
          colorInfo: '#0ea5e9',
          fontFamily: "'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
          borderRadius: 10,
          borderRadiusLG: 16,
          colorBgContainer: isDark ? '#111827' : '#ffffff',
          colorBgBase: isDark ? '#0b0f19' : '#f8fafc',
          colorText: isDark ? '#f8fafc' : '#0f172a',
          colorTextSecondary: isDark ? '#94a3b8' : '#475569',
          colorBorder: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e0f2fe',
          colorBorderSecondary: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f0f9ff',
        },
        components: {
          Card: {
            borderRadiusLG: 18,
            colorBorderSecondary: isDark ? 'rgba(255, 255, 255, 0.08)' : '#e0f2fe',
          },
          Button: {
            controlHeight: 34,
            controlHeightSM: 28,
            borderRadius: 8,
            borderRadiusSM: 6,
            colorPrimary: '#0284c7',
            fontWeight: 600,
          },
          Input: {
            borderRadius: 10,
            controlHeight: 38,
          },
          Select: {
            borderRadius: 10,
            controlHeight: 38,
          },
          Table: {
            headerBg: 'transparent',
            headerColor: isDark ? '#94a3b8' : '#64748b',
            borderRadiusLG: 14,
          },
          Modal: {
            borderRadiusLG: 20,
          },
          Tag: {
            borderRadius: 8,
          },
          Menu: {
            itemBorderRadius: 10,
            itemSelectedBg: isDark ? 'rgba(14, 165, 233, 0.18)' : 'rgba(14, 165, 233, 0.08)',
            itemSelectedColor: isDark ? '#38bdf8' : '#0284c7',
            itemHoverBg: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(14, 165, 233, 0.04)',
            itemHoverColor: isDark ? '#f8fafc' : '#0f172a',
          }
        }
      }}
    >
      {mode === 'popup' || mode === 'sidepanel' ? (
        <CompactView />
      ) : (
        <HashRouter>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="vocabulary" element={<VocabularyManager />} />
              <Route path="grammar" element={<GrammarManager />} />
              <Route path="flashcards" element={<FlashcardReview />} />
              <Route path="quizzes" element={<QuizPage />} />
              <Route path="listening" element={<ListeningPage />} />
              <Route path="todos" element={<TodoPage defaultTab="tasks" />} />
              <Route path="todos/dashboard" element={<TodoPage defaultTab="dashboard" />} />
              <Route path="todos/tasks" element={<TodoPage defaultTab="tasks" />} />
              <Route path="pomodoro" element={<PomodoroPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </ConfigProvider>
  );
}

export default App;
