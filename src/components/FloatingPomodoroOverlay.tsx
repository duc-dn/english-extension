import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play } from 'lucide-react';
import { 
  usePomodoroTimer, 
  pomodoroManager, 
  formatTime 
} from '../lib/pomodoro';
import { isExtensionContextValid } from '../lib/extensionContext';

const STORAGE_POS_KEY = 'eng_ext_pomodoro_pos';

interface Position {
  x: number;
  y: number;
}

export const FloatingPomodoroOverlay: React.FC = () => {
  const {
    mode,
    timeLeft,
    isRunning,
    isFloatingVisible,
  } = usePomodoroTimer();

  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  const dragMetaRef = useRef<{
    startX: number;
    startY: number;
    initX: number;
    initY: number;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    initX: 0,
    initY: 0,
    hasMoved: false,
  });

  // Cute icons and themes for each mode
  const modeTheme = {
    focus: {
      color: '#fb7185',
      border: 'rgba(244, 63, 94, 0.45)',
      glow: 'rgba(244, 63, 94, 0.25)',
      emoji: '🍅',
      sparkle: '✨',
      tooltip: 'Tập trung học',
    },
    short_break: {
      color: '#34d399',
      border: 'rgba(16, 185, 129, 0.45)',
      glow: 'rgba(16, 185, 129, 0.25)',
      emoji: '☕',
      sparkle: '🌱',
      tooltip: 'Nghỉ ngắn',
    },
    long_break: {
      color: '#38bdf8',
      border: 'rgba(56, 189, 248, 0.45)',
      glow: 'rgba(56, 189, 248, 0.25)',
      emoji: '🌟',
      sparkle: '🫧',
      tooltip: 'Nghỉ dài',
    },
  }[mode];

  // Clamp helper for compact pill
  const clampPosition = useCallback((x: number, y: number, w: number = 140, h: number = 40): Position => {
    const maxX = Math.max(10, window.innerWidth - w - 12);
    const maxY = Math.max(10, window.innerHeight - h - 12);
    return {
      x: Math.min(Math.max(10, x), maxX),
      y: Math.min(Math.max(10, y), maxY),
    };
  }, []);

  // Initialize position from chrome storage or default to bottom-right
  useEffect(() => {
    const defaultPos = (): Position => {
      const w = 140;
      const h = 40;
      return {
        x: Math.max(12, window.innerWidth - w - 24),
        y: Math.max(12, window.innerHeight - h - 24),
      };
    };

    if (isExtensionContextValid() && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.get([STORAGE_POS_KEY], (res: Record<string, any>) => {
          if (res && res[STORAGE_POS_KEY] && typeof res[STORAGE_POS_KEY].x === 'number') {
            const saved = res[STORAGE_POS_KEY];
            setPosition(clampPosition(saved.x, saved.y));
          } else {
            setPosition(defaultPos());
          }
        });
        return;
      } catch (e) {
        // fallback
      }
    }

    try {
      const raw = localStorage.getItem(STORAGE_POS_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.x === 'number') {
          setPosition(clampPosition(saved.x, saved.y));
          return;
        }
      }
    } catch (e) {
      // fallback
    }

    setPosition(defaultPos());
  }, [clampPosition]);

  // Adjust on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        if (!prev) return prev;
        const w = widgetRef.current?.offsetWidth || 140;
        const h = widgetRef.current?.offsetHeight || 40;
        return clampPosition(prev.x, prev.y, w, h);
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clampPosition]);

  // Save position helper
  const persistPosition = (pos: Position) => {
    try {
      localStorage.setItem(STORAGE_POS_KEY, JSON.stringify(pos));
    } catch (e) {
      // ignore
    }
    if (isExtensionContextValid() && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        chrome.storage.local.set({ [STORAGE_POS_KEY]: pos });
      } catch (e) {
        // ignore
      }
    }
  };

  // Drag listeners
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    
    // Do not initiate drag when clicking the close button
    const target = e.target as HTMLElement;
    if (target.closest('button[data-close-btn="true"]')) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    const currentX = position?.x ?? (window.innerWidth - 160);
    const currentY = position?.y ?? (window.innerHeight - 80);

    dragMetaRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentX,
      initY: currentY,
      hasMoved: false,
    };

    const handleMouseMove = (moveEv: MouseEvent) => {
      moveEv.preventDefault();
      const deltaX = moveEv.clientX - dragMetaRef.current.startX;
      const deltaY = moveEv.clientY - dragMetaRef.current.startY;

      if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
        dragMetaRef.current.hasMoved = true;
      }

      const w = widgetRef.current?.offsetWidth || 140;
      const h = widgetRef.current?.offsetHeight || 40;
      const newPos = clampPosition(
        dragMetaRef.current.initX + deltaX,
        dragMetaRef.current.initY + deltaY,
        w,
        h
      );

      setPosition(newPos);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      setPosition((latest) => {
        if (latest) {
          persistPosition(latest);
        }
        return latest;
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    // If user dragged, don't toggle
    if (dragMetaRef.current.hasMoved) return;

    if (isRunning) {
      pomodoroManager.pause();
    } else {
      pomodoroManager.start(true);
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    pomodoroManager.setFloatingVisible(false);
  };

  if (!isFloatingVisible || !position) {
    return null;
  }

  return (
    <div
      ref={widgetRef}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 2147483645,
        userSelect: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        background: 'rgba(15, 23, 42, 0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: `1.5px solid ${modeTheme.border}`,
        borderRadius: 22,
        boxShadow: `0 8px 24px rgba(0, 0, 0, 0.35), 0 0 12px ${modeTheme.glow}`,
        padding: '5px 8px 5px 10px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#f8fafc',
        boxSizing: 'border-box',
        transition: isDragging ? 'none' : 'border-color 0.25s ease, box-shadow 0.25s ease',
      }}
      title="Kéo để di chuyển vị trí"
    >
      {/* Cute Icon Cluster */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2, 
          cursor: 'inherit',
        }}
        title={modeTheme.tooltip}
      >
        <span
          style={{
            fontSize: 15,
            display: 'inline-block',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
          }}
        >
          {modeTheme.emoji}
        </span>
        <span
          style={{
            fontSize: 11,
            display: 'inline-block',
            opacity: 0.9,
          }}
        >
          {modeTheme.sparkle}
        </span>
      </div>

        {/* Countdown Timer with clickable Play/Pause */}
        <div
          onClick={handleTogglePlay}
          title={isRunning ? 'Đang chạy (Bấm để tạm dừng)' : 'Đang tạm dừng (Bấm để chạy tiếp)'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 12,
            background: isRunning ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = isRunning ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)')}
        >
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 14,
              fontWeight: 800,
              color: modeTheme.color,
              letterSpacing: '0.4px',
            }}
          >
            {formatTime(timeLeft)}
          </span>

          {isRunning ? (
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: modeTheme.color,
                boxShadow: `0 0 6px ${modeTheme.color}`,
              }}
            />
          ) : (
            <Play size={9} color={modeTheme.color} fill={modeTheme.color} style={{ marginLeft: 1 }} />
          )}
        </div>

        {/* Close Button */}
        <button
          data-close-btn="true"
          onClick={handleClose}
          title="Đóng đồng hồ nổi"
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: 3,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fb7185';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#94a3b8';
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <X size={12} strokeWidth={2.4} />
        </button>
      </div>
  );
};
