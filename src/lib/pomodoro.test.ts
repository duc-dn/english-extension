import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  pomodoroManager,
  formatTime,
  getTodayPomodoroStats,
  recordCompletedFocusSession,
  clearMockPomodoroStorage,
} from './pomodoro';

describe('Pomodoro Timer & State Manager', () => {
  beforeEach(() => {
    clearMockPomodoroStorage();
    pomodoroManager.pause();
    pomodoroManager.reset();
    pomodoroManager.setMode('focus', 25 * 60);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats time correctly', () => {
    expect(formatTime(1500)).toBe('25:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(-10)).toBe('00:00');
  });

  it('records and retrieves today stats in storage', () => {
    const stats1 = getTodayPomodoroStats();
    expect(stats1.completedSessions).toBe(0);
    expect(stats1.totalMinutes).toBe(0);

    recordCompletedFocusSession(25);
    recordCompletedFocusSession(25);

    const stats2 = getTodayPomodoroStats();
    expect(stats2.completedSessions).toBe(2);
    expect(stats2.totalMinutes).toBe(50);
  });

  it('starts, counts down, and pauses correctly', () => {
    pomodoroManager.setMode('focus', 100);
    expect(pomodoroManager.getState().timeLeft).toBe(100);
    expect(pomodoroManager.getState().isRunning).toBe(false);

    pomodoroManager.start();
    expect(pomodoroManager.getState().isRunning).toBe(true);

    vi.advanceTimersByTime(3000);
    expect(pomodoroManager.getState().timeLeft).toBe(97);

    pomodoroManager.pause();
    expect(pomodoroManager.getState().isRunning).toBe(false);
    expect(pomodoroManager.getState().timeLeft).toBe(97);

    vi.advanceTimersByTime(5000);
    expect(pomodoroManager.getState().timeLeft).toBe(97);
  });

  it('transitions to short break when focus session completes', () => {
    pomodoroManager.updateSettings({ autoStartNext: false, soundEnabled: false });
    pomodoroManager.setMode('focus', 2);
    pomodoroManager.start();

    vi.advanceTimersByTime(2000);

    const state = pomodoroManager.getState();
    expect(state.mode).toBe('short_break');
    expect(state.isRunning).toBe(false);
    expect(state.todayCompletedSessions).toBeGreaterThanOrEqual(1);
  });

  it('skips to next mode cleanly', () => {
    pomodoroManager.setMode('focus', 1500);
    pomodoroManager.skip();

    const state = pomodoroManager.getState();
    expect(state.mode).toBe('short_break');
    expect(state.isRunning).toBe(false);
  });

  it('supports changing modes directly', () => {
    pomodoroManager.setMode('short_break');
    expect(pomodoroManager.getState().mode).toBe('short_break');
    expect(pomodoroManager.getState().timeLeft).toBe(5 * 60);

    pomodoroManager.setMode('long_break');
    expect(pomodoroManager.getState().mode).toBe('long_break');
    expect(pomodoroManager.getState().timeLeft).toBe(15 * 60);
  });
});
