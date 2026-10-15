import React, { useState } from 'react';
import { Popover, Button, Progress, Typography, Segmented, Space, Tooltip } from 'antd';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Coffee,
  Sparkles,
  Flame,
  Maximize2
} from 'lucide-react';
import { 
  usePomodoroTimer, 
  pomodoroManager, 
  formatTime, 
  type PomodoroMode 
} from '../lib/pomodoro';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';

const { Text } = Typography;

export const PomodoroTimerWidget: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  const {
    mode,
    timeLeft,
    totalDuration,
    isRunning,
    cycle,
    settings: pomodoroSettings,
    todayCompletedSessions,
    todayTotalMinutes,
  } = usePomodoroTimer();

  const [popoverOpen, setPopoverOpen] = useState(false);

  const percent = totalDuration > 0
    ? Math.min(100, Math.max(0, Math.round(((totalDuration - timeLeft) / totalDuration) * 100)))
    : 0;

  const modeTheme = {
    focus: {
      color: '#f43f5e',
      bg: 'rgba(244, 63, 94, 0.08)',
      border: 'rgba(244, 63, 94, 0.25)',
      gradient: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
      label: translate('pomodoroFocus', currentLang),
      icon: <Flame size={14} color="#f43f5e" />,
      circleStroke: '#f43f5e',
    },
    short_break: {
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.08)',
      border: 'rgba(16, 185, 129, 0.25)',
      gradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
      label: translate('pomodoroShortBreak', currentLang),
      icon: <Coffee size={14} color="#10b981" />,
      circleStroke: '#10b981',
    },
    long_break: {
      color: '#0284c7',
      bg: 'rgba(2, 132, 199, 0.08)',
      border: 'rgba(2, 132, 199, 0.25)',
      gradient: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
      label: translate('pomodoroLongBreak', currentLang),
      icon: <Sparkles size={14} color="#0284c7" />,
      circleStroke: '#0284c7',
    },
  }[mode];

  const handleModeChange = (val: string | number) => {
    pomodoroManager.setMode(val as PomodoroMode);
  };

  const handleQuickPreset = (minutes: number) => {
    pomodoroManager.updateSettings({ focusDuration: minutes * 60 });
    pomodoroManager.setMode('focus', minutes * 60);
  };

  const toggleSound = () => {
    pomodoroManager.updateSettings({ soundEnabled: !pomodoroSettings.soundEnabled });
  };

  const popoverContent = (
    <div style={{ width: 280, padding: 6 }}>
      {/* Mode Segmented Controller */}
      <Segmented
        block
        value={mode}
        onChange={handleModeChange}
        options={[
          {
            label: (
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Flame size={13} color="#f43f5e" />
                Focus
              </span>
            ),
            value: 'focus',
          },
          {
            label: (
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Coffee size={13} color="#10b981" />
                Short
              </span>
            ),
            value: 'short_break',
          },
          {
            label: (
              <span style={{ fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <Sparkles size={13} color="#0284c7" />
                Long
              </span>
            ),
            value: 'long_break',
          },
        ]}
        style={{ marginBottom: 16 }}
      />

      {/* Circular Progress & Big Timer Display */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
        <Progress
          type="circle"
          percent={percent}
          size={140}
          strokeColor={modeTheme.circleStroke}
          strokeWidth={7}
          format={() => (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, fontFamily: 'monospace', color: '#1e293b' }}>
                {formatTime(timeLeft)}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: modeTheme.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {modeTheme.label}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {translate('pomodoroCycle', currentLang)} {cycle}/4
              </div>
            </div>
          )}
        />
      </div>

      {/* Main Action Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
        <Button
          type="primary"
          icon={isRunning ? <Pause size={15} /> : <Play size={15} fill="white" />}
          onClick={() => (isRunning ? pomodoroManager.pause() : pomodoroManager.start())}
          style={{
            flex: 1,
            background: modeTheme.gradient,
            borderColor: 'transparent',
            height: 34,
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 13,
            boxShadow: `0 2px 8px ${modeTheme.color}33`,
          }}
        >
          {isRunning ? translate('pomodoroPause', currentLang) : translate('pomodoroStart', currentLang)}
        </Button>
        <Tooltip title={translate('pomodoroReset', currentLang)}>
          <Button
            icon={<RotateCcw size={14} color="#64748b" />}
            onClick={() => pomodoroManager.reset()}
            style={{ borderRadius: 8, height: 34, width: 34, padding: 0 }}
          />
        </Tooltip>
        <Tooltip title={translate('pomodoroSkip', currentLang)}>
          <Button
            icon={<SkipForward size={14} color="#64748b" />}
            onClick={() => pomodoroManager.skip()}
            style={{ borderRadius: 8, height: 34, width: 34, padding: 0 }}
          />
        </Tooltip>
      </div>

      {/* Quick Duration Presets for Focus */}
      {mode === 'focus' && (
        <div style={{ marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
            Thời lượng nhanh (Phút):
          </div>
          <Space orientation="horizontal" size={6} style={{ justifyContent: 'center', width: '100%' }}>
            {[15, 25, 45, 50].map((mins) => {
              const isCurrent = pomodoroSettings.focusDuration === mins * 60;
              return (
                <Button
                  key={mins}
                  size="small"
                  type={isCurrent ? 'primary' : 'default'}
                  onClick={() => handleQuickPreset(mins)}
                  style={{
                    borderRadius: 6,
                    fontSize: 11,
                    height: 24,
                    padding: '0 8px',
                    borderColor: isCurrent ? '#f43f5e' : undefined,
                    background: isCurrent ? '#f43f5e' : undefined,
                  }}
                >
                  {mins}m
                </Button>
              );
            })}
          </Space>
        </div>
      )}

      {/* Footer Info: Completed Today & Sound */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 10,
          borderTop: '1px solid #f1f5f9',
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 14 }}>🍅</span>
          <Text style={{ fontSize: 11, color: '#475569', fontWeight: 600 }}>
            Hôm nay: <span style={{ color: '#f43f5e', fontWeight: 700 }}>{todayCompletedSessions}</span> phiên ({todayTotalMinutes}m)
          </Text>
        </div>

        <Tooltip title={pomodoroSettings.soundEnabled ? 'Tắt âm thanh chuông' : 'Bật âm thanh chuông'}>
          <Button
            type="text"
            size="small"
            icon={
              pomodoroSettings.soundEnabled ? (
                <Volume2 size={15} color="#10b981" />
              ) : (
                <VolumeX size={15} color="#94a3b8" />
              )
            }
            onClick={toggleSound}
            style={{ padding: 4, height: 28, width: 28, borderRadius: 6 }}
          />
        </Tooltip>
      </div>

      {/* Button to open dedicated full Pomodoro page */}
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <Button
          type="dashed"
          block
          size="small"
          icon={<Maximize2 size={13} color="#8b5cf6" />}
          onClick={() => {
            setPopoverOpen(false);
            if (typeof window !== 'undefined') {
              if (window.location.hash) {
                window.location.hash = '#/pomodoro';
              } else if (typeof chrome !== 'undefined' && chrome.tabs) {
                chrome.tabs.create({ url: chrome.runtime.getURL('index.html#/pomodoro') });
              } else {
                window.open('/#/pomodoro', '_blank');
              }
            }
          }}
          style={{
            borderRadius: 8,
            fontSize: 11,
            color: '#8b5cf6',
            borderColor: 'rgba(139, 92, 246, 0.35)',
            background: 'rgba(139, 92, 246, 0.04)',
            fontWeight: 600
          }}
        >
          {currentLang === 'vi' ? 'Mở Không Gian Học Pomodoro 🍅' : 'Open Focus Sanctuary 🍅'}
        </Button>
      </div>
    </div>
  );

  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={popoverOpen}
      onOpenChange={setPopoverOpen}
      placement="bottomRight"
    >
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: compact ? '4px 8px' : '5px 12px',
          background: modeTheme.bg,
          border: `1px solid ${modeTheme.border}`,
          borderRadius: 20,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: isRunning ? `0 0 10px ${modeTheme.color}25` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: modeTheme.color,
              boxShadow: isRunning ? `0 0 6px ${modeTheme.color}` : 'none',
              animation: isRunning ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13 }}>🍅</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                fontFamily: 'monospace',
                color: modeTheme.color,
                letterSpacing: '0.2px',
              }}
            >
              {formatTime(timeLeft)}
            </span>
            {!compact && (
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 2 }}>
                ({modeTheme.label} {cycle}/4)
              </span>
            )}
          </div>
        </div>

        {/* Quick Play/Pause button inside header pill */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            if (isRunning) {
              pomodoroManager.pause();
            } else {
              pomodoroManager.start();
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: isRunning ? 'rgba(0,0,0,0.06)' : modeTheme.color,
            color: isRunning ? modeTheme.color : '#ffffff',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
          }}
        >
          {isRunning ? (
            <Pause size={11} fill={modeTheme.color} />
          ) : (
            <Play size={11} fill="#ffffff" style={{ marginLeft: 1 }} />
          )}
        </div>
      </div>
    </Popover>
  );
};
