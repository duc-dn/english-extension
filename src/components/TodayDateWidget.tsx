import React, { useState } from 'react';
import { Popover, Calendar } from 'antd';
import { Calendar as CalendarIcon, Clock, Sparkles } from 'lucide-react';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { formatTodayDate, formatCurrentTime, getWeekNumber, useLiveDate } from '../lib/dateUtils';

interface TodayDateWidgetProps {
  compact?: boolean;
  showTime?: boolean;
  className?: string;
}

export const TodayDateWidget: React.FC<TodayDateWidgetProps> = ({
  compact = false,
  showTime = true,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const liveDate = useLiveDate(10000); // refresh every 10s

  const compactText = formatTodayDate(liveDate, currentLang, 'compact');
  const mediumText = formatTodayDate(liveDate, currentLang, 'medium');
  const fullText = formatTodayDate(liveDate, currentLang, 'full');
  const timeText = formatCurrentTime(liveDate);
  const weekNum = getWeekNumber(liveDate);

  const popoverContent = (
    <div style={{ width: 300, padding: 4 }}>
      {/* Header Banner */}
      <div
        style={{
          background: isDark
            ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.25) 0%, rgba(217, 70, 239, 0.25) 100%)'
            : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(217, 70, 239, 0.1) 100%)',
          border: isDark ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.15)',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: '#8b5cf6',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Sparkles size={12} /> {translate('today', currentLang)}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isDark ? '#cbd5e1' : '#64748b',
              background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
              padding: '2px 6px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Clock size={11} /> {timeText}
          </span>
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#f1f5f9' : '#1e293b', lineHeight: 1.4 }}>
          {fullText}
        </div>

        <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', marginTop: 4 }}>
          {translate('weekLabel', currentLang)} {weekNum}
        </div>
      </div>

      {/* Mini Calendar */}
      <div
        style={{
          border: isDark ? '1px solid #334155' : '1px solid #f1f5f9',
          borderRadius: 10,
          overflow: 'hidden',
          background: isDark ? '#1e293b' : '#fff',
        }}
      >
        <Calendar fullscreen={false} />
      </div>
    </div>
  );

  if (compact) {
    return (
      <Popover
        content={popoverContent}
        trigger="click"
        open={open}
        onOpenChange={setOpen}
        placement="bottomRight"
        arrow={{ pointAtCenter: true }}
      >
        <button
          type="button"
          className={className}
          title={`${fullText} • ${timeText}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 8,
            fontSize: 11,
            fontWeight: 700,
            background: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.08)',
            border: isDark ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.18)',
            color: isDark ? '#c4b5fd' : '#7c3aed',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            height: 24,
            lineHeight: 1,
            userSelect: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 3px 8px rgba(139, 92, 246, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <CalendarIcon size={12} color="#8b5cf6" />
          <span>{compactText}</span>
          {showTime && (
            <span style={{ opacity: 0.75, fontWeight: 500, fontSize: 10, marginLeft: 1 }}>
              {timeText}
            </span>
          )}
        </button>
      </Popover>
    );
  }

  // Full/Header Widget layout
  return (
    <Popover
      content={popoverContent}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottom"
      arrow={{ pointAtCenter: true }}
    >
      <div
        className={className}
        title={translate('viewCalendar', currentLang)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          borderRadius: 12,
          background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(10px)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
          boxShadow: isDark
            ? '0 2px 8px rgba(0, 0, 0, 0.2)'
            : '0 1px 4px rgba(15, 23, 42, 0.04)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          userSelect: 'none',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.borderColor = '#4f46e5';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0';
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: '#4f46e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 2px 6px rgba(79, 70, 229, 0.3)',
            flexShrink: 0,
          }}
        >
          <CalendarIcon size={15} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#4f46e5',
                letterSpacing: '0.3px',
              }}
            >
              {translate('today', currentLang)}
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>
              • {translate('weekLabel', currentLang)} {weekNum}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#f8fafc' : '#1e293b' }}>
              {mediumText}
            </span>
            {showTime && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isDark ? '#cbd5e1' : '#64748b',
                  background: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                  padding: '1px 5px',
                  borderRadius: 4,
                }}
              >
                {timeText}
              </span>
            )}
          </div>
        </div>
      </div>
    </Popover>
  );
};
