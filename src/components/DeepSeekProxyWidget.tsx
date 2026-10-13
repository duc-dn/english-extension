import React, { useState, useEffect, useCallback } from 'react';
import { Switch, Badge, Popover, Button, Space, Typography, Select, message } from 'antd';
import { Zap, RefreshCw, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { useSettings, saveSettings } from '../lib/settings';
import { pingDeepSeekProxy, toggleDeepSeekProxy, isDeepSeekProxyActive, type DeepSeekProxyHealth } from '../lib/deepseekProxy';
import { translate } from '../lib/localization';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

export const DeepSeekProxyWidget: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const settings = useSettings();
  const navigate = useNavigate();
  const currentLang = settings.language || 'vi';

  const isActive = isDeepSeekProxyActive(settings);
  const [health, setHealth] = useState<DeepSeekProxyHealth | null>(null);
  const [isPinging, setIsPinging] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const checkHealth = useCallback(async (silent = false) => {
    setIsPinging(true);
    try {
      const res = await pingDeepSeekProxy(settings.deepseek_proxy_url);
      setHealth(res);
      if (!silent) {
        if (res.online) {
          message.success(`${translate('deepseekProxyPingSuccess', currentLang)} ${res.latencyMs}ms`);
        } else {
          message.warning(translate('deepseekProxyPingFailed', currentLang));
        }
      }
    } catch {
      setHealth({ online: false, url: settings.deepseek_proxy_url || 'http://127.0.0.1:9655' });
      if (!silent) {
        message.error(translate('deepseekProxyPingFailed', currentLang));
      }
    } finally {
      setIsPinging(false);
    }
  }, [settings.deepseek_proxy_url, currentLang]);

  // Tự động kiểm tra sức khỏe khi component mount hoặc khi trạng thái thay đổi
  useEffect(() => {
    checkHealth(true);
  }, [isActive, settings.deepseek_proxy_url]);

  const handleToggle = async (checked: boolean) => {
    setIsToggling(true);
    try {
      await toggleDeepSeekProxy(checked);
      if (checked) {
        message.success(translate('deepseekProxyEnableSuccess', currentLang));
        // Kiểm tra ping ngay sau khi bật
        checkHealth(true);
      } else {
        message.info(translate('deepseekProxyDisableSuccess', currentLang));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi chuyển đổi proxy';
      message.error(msg);
    } finally {
      setIsToggling(false);
    }
  };

  const handleModelChange = async (val: string) => {
    await saveSettings({ deepseek_model: val });
    message.success(currentLang === 'vi' ? `Đã chọn mô hình: ${val}` : `Selected model: ${val}`);
  };

  // Popover content
  const popoverContent = (
    <div style={{ width: 300, padding: '4px 2px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 14 }}>
          <Zap size={16} color="#2563eb" />
          <span>{translate('deepseekProxyQuickCardTitle', currentLang)}</span>
        </div>
        <Badge 
          status={isActive ? (health?.online ? 'success' : 'error') : 'default'} 
          text={
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {isActive ? (health?.online ? translate('deepseekProxyOnline', currentLang) : translate('deepseekProxyOffline', currentLang)) : translate('deepseekProxyInactiveBadge', currentLang)}
            </span>
          }
        />
      </div>

      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12, lineHeight: 1.4 }}>
        {translate('deepseekProxyQuickCardDesc', currentLang)}
      </Text>

      <div style={{ background: 'rgba(37, 99, 235, 0.05)', padding: '10px 12px', borderRadius: 8, marginBottom: 12, border: '1px solid rgba(37, 99, 235, 0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Trạng thái kết nối:</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: health?.online ? '#16a34a' : '#dc2626' }}>
            {health?.online ? `Online (${health.latencyMs}ms)` : 'Offline'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>Endpoint:</span>
          <code style={{ fontSize: 11, background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 4 }}>
            {settings.deepseek_proxy_url || 'http://127.0.0.1:9655'}
          </code>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
          {translate('deepseekProxyModelSwitch', currentLang)}
        </span>
        <Select
          size="small"
          style={{ width: '100%' }}
          value={settings.deepseek_model || 'deepseek-chat'}
          onChange={handleModelChange}
          options={[
            { value: 'deepseek-chat', label: 'DeepSeek-V3 / Flash (Nhanh & Thông minh ⚡)' },
            { value: 'deepseek-reasoner', label: 'DeepSeek-R1 (Suy luận sâu & Ngữ pháp 🧠)' }
          ]}
        />
      </div>

      {!health?.online && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 10px', marginBottom: 12, fontSize: 11, color: '#92400e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, marginBottom: 2 }}>
            <AlertTriangle size={13} color="#d97706" />
            <span>Chưa thấy server chạy:</span>
          </div>
          <code>ALLOW_BROWSER_ORIGIN=1 npm start</code> trong thư mục <b>FreeDeepseekAPI</b>.
        </div>
      )}

      <Space orientation="horizontal" style={{ width: '100%', justifyContent: 'space-between' }}>
        <Button 
          size="small" 
          icon={<RefreshCw size={12} className={isPinging ? 'animate-spin' : ''} />} 
          onClick={() => checkHealth(false)} 
          loading={isPinging}
          style={{ borderRadius: 6, fontSize: 12 }}
        >
          {translate('deepseekProxyPingBtn', currentLang)}
        </Button>
        <Button 
          type="link" 
          size="small" 
          icon={<SettingsIcon size={12} />} 
          onClick={() => navigate('/settings')}
          style={{ padding: 0, fontSize: 12 }}
        >
          {translate('settings', currentLang)}
        </Button>
      </Space>
    </div>
  );

  return (
    <Popover content={popoverContent} trigger="click" placement="bottomRight">
      <div 
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: compact ? '4px 8px' : '5px 12px',
          background: isActive 
            ? (health?.online ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)')
            : 'rgba(100, 116, 139, 0.08)',
          border: `1px solid ${isActive ? (health?.online ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)') : 'rgba(100, 116, 139, 0.15)'}`,
          borderRadius: 20,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isActive && health?.online ? '0 0 10px rgba(34, 197, 94, 0.12)' : 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span 
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isActive ? (health?.online ? '#22c55e' : '#ef4444') : '#94a3b8',
              boxShadow: isActive && health?.online ? '0 0 6px #22c55e' : 'none',
              animation: isActive && health?.online ? 'pulse 2s infinite' : 'none'
            }} 
          />
          <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#1e293b' : '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Zap size={13} color={isActive ? '#2563eb' : '#94a3b8'} />
            {!compact && 'DeepSeek Proxy:'}
            <span style={{ color: isActive ? (health?.online ? '#16a34a' : '#dc2626') : '#64748b' }}>
              {isActive ? (health?.online ? (compact ? 'ON' : 'Online') : (compact ? 'ERR' : 'Offline')) : 'OFF'}
            </span>
          </span>
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <Switch
            size="small"
            checked={isActive}
            loading={isToggling}
            onChange={handleToggle}
            style={{
              background: isActive ? '#2563eb' : undefined
            }}
          />
        </div>
      </div>
    </Popover>
  );
};
