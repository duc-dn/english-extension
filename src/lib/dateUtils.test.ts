import { describe, it, expect } from 'vitest';
import { formatTodayDate, formatCurrentTime, getWeekNumber } from './dateUtils';

describe('dateUtils', () => {
  it('formats Vietnamese dates correctly', () => {
    // 2026-10-13 is a Tuesday (Thứ Ba)
    const testDate = new Date(2026, 9, 13, 14, 30); // October 13, 2026
    
    expect(formatTodayDate(testDate, 'vi', 'compact')).toBe('T3, 13/10');
    expect(formatTodayDate(testDate, 'vi', 'medium')).toBe('Thứ Ba, 13/10/2026');
    expect(formatTodayDate(testDate, 'vi', 'full')).toBe('Thứ Ba, ngày 13 tháng 10 năm 2026');
  });

  it('formats English dates correctly', () => {
    const testDate = new Date(2026, 9, 13, 14, 30);
    
    expect(formatTodayDate(testDate, 'en', 'compact')).toContain('Tue');
    expect(formatTodayDate(testDate, 'en', 'medium')).toContain('2026');
    expect(formatTodayDate(testDate, 'en', 'full')).toContain('Tuesday');
  });

  it('formats current time as HH:mm', () => {
    const testDate = new Date(2026, 9, 13, 9, 5);
    expect(formatCurrentTime(testDate)).toBe('09:05');

    const testDate2 = new Date(2026, 9, 13, 16, 45);
    expect(formatCurrentTime(testDate2)).toBe('16:45');
  });

  it('calculates week number correctly', () => {
    const testDate = new Date(2026, 9, 13);
    const week = getWeekNumber(testDate);
    expect(week).toBeGreaterThan(0);
    expect(week).toBeLessThanOrEqual(53);
  });
});
