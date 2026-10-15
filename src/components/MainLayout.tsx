import React from 'react';
import { Layout, Button, Tooltip } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { 
  BookMarked, Layers, LayoutDashboard, Settings, BookOpen, 
  CheckSquare, Globe, Timer, Sun, Moon, Sparkles, ChevronRight 
} from 'lucide-react';
import { useSettings, saveSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';

import { DeepSeekProxyWidget } from './DeepSeekProxyWidget';
import { PomodoroTimerWidget } from './PomodoroTimerWidget';

const { Content, Sider } = Layout;

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeVariant?: 'sky' | 'amber' | 'emerald' | 'subtle';
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Live queries to show gamified dynamic badges
  const words = useLiveQuery(() => db.words.toArray()) || [];
  const totalWords = words.length;
  const dueReviews = words.filter(w => w.next_review && new Date(w.next_review) <= new Date() && w.status !== 'mastered').length;

  const navSections: NavSection[] = [
    {
      items: [
        { 
          key: '/', 
          icon: <LayoutDashboard size={17} />, 
          label: translate('dashboard', currentLang),
        },
      ]
    },
    {
      title: currentLang === 'vi' ? 'HỌC TẬP & ÔN LUYỆN' : 'LEARN & PRACTICE',
      items: [
        { 
          key: '/vocabulary', 
          icon: <BookMarked size={17} />, 
          label: translate('vocabulary', currentLang),
          badge: totalWords > 0 ? `${totalWords} ${currentLang === 'vi' ? 'từ' : 'words'}` : undefined,
          badgeVariant: 'sky'
        },
        { 
          key: '/grammar', 
          icon: <BookOpen size={17} />, 
          label: translate('grammar', currentLang),
        },
        { 
          key: '/flashcards', 
          icon: <Layers size={17} />, 
          label: translate('flashcards', currentLang),
          badge: dueReviews > 0 ? `${dueReviews} ${currentLang === 'vi' ? 'cần ôn' : 'due'}` : 'SRS',
          badgeVariant: dueReviews > 0 ? 'amber' : 'subtle'
        },
        { 
          key: '/quizzes', 
          icon: <CheckSquare size={17} />, 
          label: translate('quizzes', currentLang),
          badge: 'Quiz',
          badgeVariant: 'emerald'
        },
      ]
    },
    {
      title: currentLang === 'vi' ? 'CÔNG CỤ & HỆ THỐNG' : 'TOOLS & SYSTEM',
      items: [
        { 
          key: '/pomodoro', 
          icon: <Timer size={17} />, 
          label: translate('pomodoroTimer', currentLang),
        },
        { 
          key: '/settings', 
          icon: <Settings size={17} />, 
          label: translate('settings', currentLang),
        },
      ]
    }
  ];

  const allItems = navSections.flatMap(s => s.items);
  const currentTitle = allItems.find(m => m.key === location.pathname)?.label || 'EngExt Pro';

  const toggleTheme = () => {
    saveSettings({ theme: isDark ? 'light' : 'dark' });
  };

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent', position: 'relative' }}>
      <style>{`
        .eng-sidebar-btn {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .eng-sidebar-btn:hover {
          transform: translateX(2px);
        }
      `}</style>

      <Sider 
        theme={isDark ? 'dark' : 'light'} 
        width={260}
        className="glass-sidebar"
        style={{ 
          position: 'relative', 
          borderRight: isDark ? '1px solid rgba(56, 189, 248, 0.12)' : '1px solid #e0f2fe',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          background: isDark ? '#0c1322' : '#ffffff',
        }}
      >
        {/* Brand Header with Youthful Light Sky Blue Glow */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 12,
          margin: '18px 14px 14px 14px',
          padding: '10px 12px',
          borderRadius: 14,
          background: isDark 
            ? 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(56, 189, 248, 0.04) 100%)' 
            : 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          border: isDark ? '1px solid rgba(56, 189, 248, 0.2)' : '1px solid rgba(14, 165, 233, 0.2)'
        }}>
          <div style={{
            position: 'relative',
            width: 36,
            height: 36,
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 4px 14px rgba(14, 165, 233, 0.3)',
            flexShrink: 0
          }}>
            <img 
              src="/logo.png" 
              alt="Logo" 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
              }} 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ 
                fontWeight: 800, 
                fontSize: '15px', 
                color: isDark ? '#f0f9ff' : '#0369a1',
                letterSpacing: '-0.3px' 
              }}>
                English Space
              </span>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#0ea5e9',
                boxShadow: '0 0 8px #0ea5e9'
              }} />
            </div>
            <span style={{ fontSize: '11px', color: isDark ? '#7dd3fc' : '#0284c7', fontWeight: 600 }}>
              ✦ AI Reading & SRS
            </span>
          </div>
        </div>

        {/* Modern Youthful Sidebar Navigation */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px' }}>
          {navSections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: 14 }}>
              {section.title && (
                <div style={{
                  padding: '6px 10px 4px 10px',
                  fontSize: '10px',
                  fontWeight: 800,
                  letterSpacing: '0.8px',
                  color: isDark ? '#64748b' : '#94a3b8',
                  textTransform: 'uppercase'
                }}>
                  {section.title}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {section.items.map((item) => {
                  const isSelected = location.pathname === item.key;
                  return (
                    <div
                      key={item.key}
                      onClick={() => navigate(item.key)}
                      className="eng-sidebar-btn"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 12,
                        cursor: 'pointer',
                        userSelect: 'none',
                        position: 'relative',
                        background: isSelected
                          ? isDark
                            ? 'linear-gradient(90deg, rgba(14, 165, 233, 0.2) 0%, rgba(56, 189, 248, 0.08) 100%)'
                            : 'linear-gradient(90deg, #f0f9ff 0%, #e0f2fe 100%)'
                          : 'transparent',
                        border: isSelected
                          ? isDark
                            ? '1px solid rgba(56, 189, 248, 0.3)'
                            : '1px solid rgba(14, 165, 233, 0.28)'
                          : '1px solid transparent',
                        boxShadow: isSelected
                          ? isDark
                            ? '0 2px 10px rgba(14, 165, 233, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
                            : '0 2px 8px rgba(14, 165, 233, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
                          : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = isDark 
                            ? 'rgba(255, 255, 255, 0.04)' 
                            : 'rgba(14, 165, 233, 0.05)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = 'transparent';
                        }
                      }}
                    >
                      {/* Active Indicator Bar */}
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: '22%',
                            bottom: '22%',
                            width: 3.5,
                            borderRadius: '0 4px 4px 0',
                            background: '#0ea5e9',
                            boxShadow: '0 0 8px rgba(14, 165, 233, 0.8)',
                          }}
                        />
                      )}

                      {/* Icon Squircle + Label */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 9,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            background: isSelected
                              ? 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)'
                              : isDark
                                ? 'rgba(255, 255, 255, 0.05)'
                                : '#f8fafc',
                            color: isSelected
                              ? '#ffffff'
                              : isDark
                                ? '#94a3b8'
                                : '#0284c7',
                            border: isSelected
                              ? '1px solid rgba(255, 255, 255, 0.25)'
                              : isDark
                                ? '1px solid rgba(255, 255, 255, 0.06)'
                                : '1px solid #e0f2fe',
                            boxShadow: isSelected
                              ? '0 3px 10px rgba(14, 165, 233, 0.35)'
                              : 'none',
                            transition: 'all 0.18s ease',
                          }}
                        >
                          {item.icon}
                        </div>

                        <span
                          style={{
                            fontSize: '13px',
                            fontWeight: isSelected ? 700 : 500,
                            color: isSelected
                              ? isDark
                                ? '#f0f9ff'
                                : '#0369a1'
                              : isDark
                                ? '#94a3b8'
                                : '#475569',
                            letterSpacing: '-0.1px'
                          }}
                        >
                          {item.label}
                        </span>
                      </div>

                      {/* Right side: Badge or Chevron */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {item.badge && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 6,
                              lineHeight: 1.2,
                              background: item.badgeVariant === 'amber'
                                ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7')
                                : item.badgeVariant === 'emerald'
                                  ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#d1fae5')
                                  : item.badgeVariant === 'sky'
                                    ? (isDark ? 'rgba(14, 165, 233, 0.2)' : '#e0f2fe')
                                    : (isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9'),
                              color: item.badgeVariant === 'amber'
                                ? (isDark ? '#fbbf24' : '#b45309')
                                : item.badgeVariant === 'emerald'
                                  ? (isDark ? '#34d399' : '#047857')
                                  : item.badgeVariant === 'sky'
                                    ? (isDark ? '#38bdf8' : '#0284c7')
                                    : (isDark ? '#94a3b8' : '#64748b'),
                              border: item.badgeVariant === 'amber'
                                ? '1px solid rgba(245, 158, 11, 0.3)'
                                : item.badgeVariant === 'emerald'
                                  ? '1px solid rgba(16, 185, 129, 0.3)'
                                  : item.badgeVariant === 'sky'
                                    ? '1px solid rgba(14, 165, 233, 0.3)'
                                    : '1px solid transparent',
                            }}
                          >
                            {item.badge}
                          </span>
                        )}

                        {isSelected && (
                          <ChevronRight 
                            size={14} 
                            color={isDark ? '#38bdf8' : '#0284c7'} 
                            strokeWidth={2.5}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        
        {/* Sidebar Footer Controls */}
        <div style={{
          padding: '14px 14px',
          borderTop: isDark ? '1px solid rgba(56, 189, 248, 0.12)' : '1px solid #e0f2fe',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: isDark ? 'rgba(12, 19, 34, 0.6)' : 'rgba(240, 249, 255, 0.5)'
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Tooltip title={currentLang === 'vi' ? 'Đổi ngôn ngữ' : 'Change language'}>
              <Button
                type="default"
                onClick={() => saveSettings({ language: currentLang === 'vi' ? 'en' : 'vi' })}
                icon={<Globe size={14} color="#0284c7" />}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderColor: isDark ? 'rgba(14, 165, 233, 0.3)' : 'rgba(14, 165, 233, 0.25)',
                  background: isDark ? 'rgba(14, 165, 233, 0.1)' : 'rgba(14, 165, 233, 0.06)',
                  color: isDark ? '#38bdf8' : '#0284c7',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  height: 36,
                  fontSize: '12px'
                }}
              >
                {currentLang === 'vi' ? 'VI' : 'EN'}
              </Button>
            </Tooltip>

            <Tooltip title={isDark ? (currentLang === 'vi' ? 'Chuyển giao diện Sáng' : 'Switch to Light') : (currentLang === 'vi' ? 'Chuyển giao diện Tối' : 'Switch to Dark')}>
              <Button
                type="default"
                onClick={toggleTheme}
                icon={isDark ? <Sun size={15} color="#fbbf24" /> : <Moon size={15} color="#0284c7" />}
                style={{
                  borderRadius: 10,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#e0f2fe',
                  background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 38,
                  height: 36,
                }}
              />
            </Tooltip>
          </div>

          <div style={{ 
            fontSize: '11px', 
            color: isDark ? '#7dd3fc' : '#0369a1', 
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            fontWeight: 500
          }}>
            <Sparkles size={11} color="#0ea5e9" />
            <span>Shift + Bôi đen để tra cứu</span>
          </div>
        </div>
      </Sider>

      <Layout style={{ background: 'transparent' }}>
        {/* Top Header Bar across all admin pages */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 32px',
          gap: 16,
          flexWrap: 'wrap',
          borderBottom: isDark ? '1px solid rgba(56, 189, 248, 0.12)' : '1px solid rgba(224, 242, 254, 0.8)',
          background: isDark ? 'rgba(11, 15, 25, 0.7)' : 'rgba(255, 255, 255, 0.75)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ 
              fontSize: 12, 
              fontWeight: 600, 
              color: isDark ? '#64748b' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}>
              English Space <span style={{ opacity: 0.4 }}>/</span>
            </span>
            <span style={{ 
              fontSize: 13, 
              fontWeight: 700, 
              color: isDark ? '#f0f9ff' : '#0369a1',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: isDark ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.08)',
              padding: '4px 12px',
              borderRadius: 8,
              border: isDark ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(14, 165, 233, 0.2)'
            }}>
              {allItems.find(m => m.key === location.pathname)?.icon}
              <span>{currentTitle}</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <PomodoroTimerWidget />
            <DeepSeekProxyWidget />
          </div>
        </div>
        <Content style={{ margin: '20px 32px 32px 32px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};
