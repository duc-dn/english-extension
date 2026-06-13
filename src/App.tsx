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
import { CompactView } from './components/CompactView';
import './App.css';

function App() {
  const [themeMode, setThemeMode] = useState<'system'|'light'|'dark'>('light');
  const [mode, setMode] = useState<'popup' | 'sidepanel' | 'dashboard'>('dashboard');

  useEffect(() => {
    const detectMode = () => {
      const params = new URLSearchParams(window.location.search);
      const modeParam = params.get('mode');
      if (modeParam === 'popup') return 'popup';
      if (modeParam === 'sidepanel') return 'sidepanel';
      if (modeParam === 'dashboard') return 'dashboard';
      
      // If we have a hash route (e.g. #/settings), it is the dashboard
      if (window.location.hash) {
        return 'dashboard';
      }
      
      // Fallback detection using chrome extension API
      if (typeof chrome !== 'undefined' && chrome.extension) {
        try {
          const views = chrome.extension.getViews({ type: 'popup' });
          if (views.includes(window)) {
            return 'popup';
          }
        } catch (e) {
          // ignore
        }
      }
      
      // Secondary fallback inside extension context
      if (typeof chrome !== 'undefined' && chrome.extension) {
        if (window.innerWidth < 500) {
          return 'sidepanel';
        }
      }
      
      return 'dashboard';
    };

    const currentMode = detectMode();
    setMode(currentMode);

    const body = document.body;
    const html = document.documentElement;

    const applyClasses = (m: 'popup' | 'sidepanel' | 'dashboard') => {
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

    applyClasses(currentMode);

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
  }, []);

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
          colorPrimary: '#8b5cf6',
          fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
          borderRadius: 8,
          colorBgContainer: isDark ? '#1e293b' : 'rgba(255, 255, 255, 0.8)',
        },
        components: {
          Card: {
            borderRadiusLG: 16,
          },
          Button: {
            controlHeight: 38,
            borderRadius: 8,
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
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </HashRouter>
      )}
    </ConfigProvider>
  );
}

export default App;
