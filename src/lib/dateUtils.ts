import { useState, useEffect } from 'react';

/**
 * Formats a given date according to locale and desired style
 */
export function formatTodayDate(
  date: Date = new Date(),
  locale: 'vi' | 'en' = 'vi',
  style: 'compact' | 'medium' | 'full' = 'medium'
): string {
  if (locale === 'vi') {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const shortDays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const day = days[date.getDay()];
    const shortDay = shortDays[date.getDay()];
    const d = date.getDate();
    const m = date.getMonth() + 1;
    const y = date.getFullYear();

    if (style === 'compact') {
      return `${shortDay}, ${d}/${m}`;
    }
    if (style === 'medium') {
      return `${day}, ${d}/${m}/${y}`;
    }
    return `${day}, ngày ${d} tháng ${m} năm ${y}`;
  }

  // English formatting
  if (style === 'compact') {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  if (style === 'medium') {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/**
 * Formats time as HH:mm
 */
export function formatCurrentTime(date: Date = new Date()): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Computes ISO week number
 */
export function getWeekNumber(date: Date = new Date()): number {
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Custom hook to keep live date/time updated
 */
export function useLiveDate(intervalMs = 30000): Date {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, intervalMs);

    return () => clearInterval(timer);
  }, [intervalMs]);

  return currentDate;
}
