import React from 'react';
import { Layout, Menu, Button } from 'antd';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Book, Layers, LayoutDashboard, Settings, BookOpen, CheckSquare, Globe } from 'lucide-react';
import { useSettings, saveSettings } from '../lib/settings';
import { translate } from '../lib/localization';

import { DeepSeekProxyWidget } from './DeepSeekProxyWidget';

const { Content, Sider } = Layout;

export const MainLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const menuItems = [
    { key: '/', icon: <LayoutDashboard size={18} />, label: translate('dashboard', currentLang) },
    { key: '/vocabulary', icon: <Book size={18} />, label: translate('vocabulary', currentLang) },
    { key: '/grammar', icon: <BookOpen size={18} />, label: translate('grammar', currentLang) },
    { key: '/flashcards', icon: <Layers size={18} />, label: translate('flashcards', currentLang) },
    { key: '/quizzes', icon: <CheckSquare size={18} />, label: translate('quizzes', currentLang) },
    { key: '/settings', icon: <Settings size={18} />, label: translate('settings', currentLang) },
  ];

  const currentTitle = menuItems.find(m => m.key === location.pathname)?.label || 'EngExt Pro';

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent', position: 'relative' }}>
      <div className="bg-glow-purple" />
      <div className="bg-glow-pink" />
      <Sider 
        theme="light" 
        width={240}
        className="glass-sidebar"
        style={{ position: 'relative' }}
      >
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 10,
          margin: '24px 16px',
          padding: '8px 12px',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(217, 70, 239, 0.08) 100%)', 
          border: '1px solid rgba(139, 92, 246, 0.15)',
          borderRadius: 12, 
        }}>
          <img 
            src="/logo.png" 
            alt="EngExt Logo" 
            style={{ 
              width: 32, 
              height: 32, 
              borderRadius: 8, 
              objectFit: 'cover',
              boxShadow: '0 4px 10px rgba(139, 92, 246, 0.3)'
            }} 
          />
          <span style={{ 
            fontWeight: 800, 
            fontSize: '16px', 
            background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            letterSpacing: '0.5px' 
          }}>
            EngExt Pro
          </span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 'none', background: 'transparent', padding: '0 8px' }}
        />
        
        {/* Language switch button at bottom of sidebar */}
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          padding: '0 16px',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <Button
            type="default"
            onClick={() => saveSettings({ language: currentLang === 'vi' ? 'en' : 'vi' })}
            icon={<Globe size={14} color="#8b5cf6" />}
            style={{
              width: '100%',
              borderRadius: 20,
              borderColor: 'rgba(139, 92, 246, 0.15)',
              background: 'rgba(255, 255, 255, 0.6)',
              color: '#8b5cf6',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              height: 36,
              fontSize: '13px'
            }}
          >
            {currentLang === 'vi' ? 'English (EN)' : 'Tiếng Việt (VI)'}
          </Button>
        </div>
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        {/* Top Header Bar across all admin pages */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 32px 0 32px',
        }}>
          <div>
            <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Trang quản trị / Admin
            </span>
            <h3 style={{ margin: '2px 0 0 0', fontWeight: 800, fontSize: 20, color: '#1e293b' }}>
              {currentTitle}
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
