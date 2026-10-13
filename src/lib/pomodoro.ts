import { useState, useEffect } from 'react';
import { playPomodoroChime } from './audio';

export type PomodoroMode = 'focus' | 'short_break' | 'long_break';

export interface PomodoroSettings {
  focusDuration: number; // in seconds (default: 25 * 60 = 1500)
  shortBreakDuration: number; // in seconds (default: 5 * 60 = 300)
  longBreakDuration: number; // in seconds (default: 15 * 60 = 900)
  soundEnabled: boolean;
  autoStartNext: boolean;
}

export interface PomodoroDailyStats {
  date: string;
  completedSessions: number;
  totalMinutes: number;
}

export interface PomodoroState {
  mode: PomodoroMode;
  timeLeft: number;
  totalDuration: number;
  isRunning: boolean;
  cycle: number; // 1 to 4
  settings: PomodoroSettings;
  todayCompletedSessions: number;
  todayTotalMinutes: number;
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  focusDuration: 25 * 60,
  shortBreakDuration: 5 * 60,
  longBreakDuration: 15 * 60,
  soundEnabled: true,
  autoStartNext: false,
};

const STATS_STORAGE_KEY = 'eng_ext_pomodoro_stats';
const SETTINGS_STORAGE_KEY = 'eng_ext_pomodoro_settings';
const STATE_STORAGE_KEY = 'eng_ext_pomodoro_state';

let mockPomodoroStorage: Record<string, string> = {};

function storageGet(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    // fallback
  }
  return mockPomodoroStorage[key] ?? null;
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch (e) {
    // fallback
  }
  mockPomodoroStorage[key] = value;
}

export function clearMockPomodoroStorage(): void {
  mockPomodoroStorage = {};
}

function getTodayKey(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayPomodoroStats(): PomodoroDailyStats {
  try {
    const raw = storageGet(STATS_STORAGE_KEY);
    if (raw) {
      const parsed: PomodoroDailyStats = JSON.parse(raw);
      if (parsed.date === getTodayKey()) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read pomodoro stats:', e);
  }
  return { date: getTodayKey(), completedSessions: 0, totalMinutes: 0 };
}

export function recordCompletedFocusSession(minutes: number = 25): PomodoroDailyStats {
  const current = getTodayPomodoroStats();
  const updated: PomodoroDailyStats = {
    date: getTodayKey(),
    completedSessions: current.completedSessions + 1,
    totalMinutes: current.totalMinutes + Math.round(minutes),
  };
  try {
    storageSet(STATS_STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save pomodoro stats:', e);
  }
  return updated;
}

function loadSavedSettings(): PomodoroSettings {
  try {
    const raw = storageGet(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (e) {
    // Ignore error
  }
  return { ...DEFAULT_SETTINGS };
}

function saveStoredSettings(settings: PomodoroSettings) {
  try {
    storageSet(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    // Ignore error
  }
}

class PomodoroManager {
  private mode: PomodoroMode = 'focus';
  private timeLeft: number = DEFAULT_SETTINGS.focusDuration;
  private totalDuration: number = DEFAULT_SETTINGS.focusDuration;
  private isRunning: boolean = false;
  private cycle: number = 1;
  private settings: PomodoroSettings = loadSavedSettings();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private targetEndTime: number | null = null;
  private listeners: Set<(state: PomodoroState) => void> = new Set();

  constructor() {
    this.restoreState();
  }

  private restoreState() {
    try {
      const raw = storageGet(STATE_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        this.mode = saved.mode || 'focus';
        this.cycle = saved.cycle || 1;
        this.totalDuration = saved.totalDuration || this.getDurationForMode(this.mode);

        if (saved.isRunning && saved.targetEndTime) {
          const remaining = Math.max(0, Math.ceil((saved.targetEndTime - Date.now()) / 1000));
          if (remaining > 0) {
            this.timeLeft = remaining;
            this.targetEndTime = saved.targetEndTime;
            this.start();
            return;
          } else {
            this.timeLeft = 0;
            this.isRunning = false;
            this.handleTimerEnd();
            return;
          }
        } else {
          this.timeLeft = typeof saved.timeLeft === 'number' ? saved.timeLeft : this.totalDuration;
          this.isRunning = false;
        }
      }
    } catch (e) {
      // Ignore
    }
  }

  private persistState() {
    try {
      storageSet(
        STATE_STORAGE_KEY,
        JSON.stringify({
          mode: this.mode,
          timeLeft: this.timeLeft,
          totalDuration: this.totalDuration,
          isRunning: this.isRunning,
          cycle: this.cycle,
          targetEndTime: this.targetEndTime,
        })
      );
    } catch (e) {
      // Ignore
    }
  }

  private getDurationForMode(mode: PomodoroMode): number {
    switch (mode) {
      case 'focus':
        return this.settings.focusDuration;
      case 'short_break':
        return this.settings.shortBreakDuration;
      case 'long_break':
        return this.settings.longBreakDuration;
    }
  }

  public getState(): PomodoroState {
    const todayStats = getTodayPomodoroStats();
    return {
      mode: this.mode,
      timeLeft: this.timeLeft,
      totalDuration: this.totalDuration,
      isRunning: this.isRunning,
      cycle: this.cycle,
      settings: { ...this.settings },
      todayCompletedSessions: todayStats.completedSessions,
      todayTotalMinutes: todayStats.totalMinutes,
    };
  }

  public subscribe(listener: (state: PomodoroState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.listeners.forEach(fn => fn(state));
    this.persistState();
  }

  public start() {
    if (this.isRunning) return;

    if (this.timeLeft <= 0) {
      this.timeLeft = this.totalDuration;
    }

    this.isRunning = true;
    this.targetEndTime = Date.now() + this.timeLeft * 1000;

    if (this.intervalId) clearInterval(this.intervalId);

    this.intervalId = setInterval(() => {
      if (!this.targetEndTime) return;
      const remaining = Math.max(0, Math.ceil((this.targetEndTime - Date.now()) / 1000));
      this.timeLeft = remaining;

      if (remaining <= 0) {
        this.handleTimerEnd();
      } else {
        this.notify();
      }
    }, 1000);

    this.notify();
  }

  public pause() {
    if (!this.isRunning) return;

    if (this.targetEndTime) {
      this.timeLeft = Math.max(0, Math.ceil((this.targetEndTime - Date.now()) / 1000));
    }
    this.isRunning = false;
    this.targetEndTime = null;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.notify();
  }

  public reset() {
    this.pause();
    this.timeLeft = this.getDurationForMode(this.mode);
    this.totalDuration = this.timeLeft;
    this.notify();
  }

  public setMode(mode: PomodoroMode, customSeconds?: number) {
    this.pause();
    this.mode = mode;
    this.timeLeft = customSeconds ?? this.getDurationForMode(mode);
    this.totalDuration = this.timeLeft;
    this.notify();
  }

  public skip() {
    this.pause();
    this.handleTimerEnd(true);
  }

  public updateSettings(partial: Partial<PomodoroSettings>) {
    this.settings = { ...this.settings, ...partial };
    saveStoredSettings(this.settings);
    if (!this.isRunning) {
      this.totalDuration = this.getDurationForMode(this.mode);
      this.timeLeft = this.totalDuration;
    }
    this.notify();
  }

  private handleTimerEnd(skipped: boolean = false) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    this.targetEndTime = null;

    const previousMode = this.mode;

    if (!skipped) {
      if (previousMode === 'focus') {
        recordCompletedFocusSession(Math.round(this.totalDuration / 60));
        if (this.settings.soundEnabled) {
          playPomodoroChime('focus_complete');
        }
        this.sendSystemNotification('🍅 Phiên Pomodoro hoàn thành!', 'Tuyệt vời! Đã đến lúc nghỉ ngơi một chút.');
      } else {
        if (this.settings.soundEnabled) {
          playPomodoroChime('break_complete');
        }
        this.sendSystemNotification('🔔 Hết giờ nghỉ ngơi!', 'Sẵn sàng bắt đầu phiên học tập trung tiếp theo.');
      }
    }

    // Next mode
    if (previousMode === 'focus') {
      if (this.cycle >= 4) {
        this.mode = 'long_break';
        this.cycle = 1;
      } else {
        this.mode = 'short_break';
      }
    } else if (previousMode === 'short_break') {
      this.mode = 'focus';
      this.cycle = Math.min(4, this.cycle + 1);
    } else {
      this.mode = 'focus';
      this.cycle = 1;
    }

    this.totalDuration = this.getDurationForMode(this.mode);
    this.timeLeft = this.totalDuration;

    if (this.settings.autoStartNext && !skipped) {
      this.start();
    } else {
      this.notify();
    }
  }

  private sendSystemNotification(title: string, body: string) {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/logo.png' });
      } else if (typeof chrome !== 'undefined' && chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: '/logo.png',
          title,
          message: body,
        });
      }
    } catch (e) {
      // Ignore
    }
  }
}

export const pomodoroManager = new PomodoroManager();

export function formatTime(seconds: number): string {
  const mins = Math.floor(Math.max(0, seconds) / 60);
  const secs = Math.floor(Math.max(0, seconds) % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function usePomodoroTimer(): PomodoroState {
  const [state, setState] = useState<PomodoroState>(() => pomodoroManager.getState());

  useEffect(() => {
    return pomodoroManager.subscribe((newState) => {
      setState(newState);
    });
  }, []);

  return state;
}
