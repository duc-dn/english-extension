import { db, triggerAutoSync, type TodoItem } from './db';
import { getSettings } from './settings';

export type { TodoItem };

export type TodoInput = {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  dueDate?: string; // Format: YYYY-MM-DD or YYYY-MM-DDTHH:mm
  reminderAt?: string; // Format: YYYY-MM-DDTHH:mm or ISO
  tags?: string[];
  status?: 'pending' | 'completed';
};

export interface TodoStats {
  total: number;
  pending: number;
  completed: number;
  dueToday: number;
  overdue: number;
  highPriority: number;
  completionRate: number;
}

export type TodoFilterType = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed' | 'pending';

/**
 * Returns today's date in local YYYY-MM-DD string
 */
export function getTodayDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks whether a dueDate (YYYY-MM-DD or ISO) matches today
 */
export function isDateToday(dateStr?: string): boolean {
  if (!dateStr) return false;
  const todayStr = getTodayDateString();
  return dateStr.startsWith(todayStr);
}

/**
 * Checks whether a dueDate (YYYY-MM-DD or ISO) is strictly in the past (overdue)
 */
export function isDateOverdue(dateStr?: string): boolean {
  if (!dateStr) return false;
  const now = new Date();
  
  // If only date format (YYYY-MM-DD)
  if (dateStr.length === 10) {
    const todayStr = getTodayDateString(now);
    return dateStr < todayStr;
  }
  
  // If date-time format
  const due = new Date(dateStr);
  return !isNaN(due.getTime()) && due.getTime() < now.getTime();
}

/**
 * Safely notify background script to refresh extension badge and auto-sync to GitHub
 */
export function notifyBackgroundBadgeUpdate() {
  triggerAutoSync();
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ action: 'REFRESH_TODO_BADGE' }).catch(() => {
        // Silently catch in case popup/background is not responding
      });
    } catch {
      // Ignored
    }
  }
}

/**
 * Add a new Todo item to IndexedDB
 */
export async function addTodo(input: TodoInput): Promise<TodoItem> {
  const trimmedTitle = (input.title || '').trim();
  if (!trimmedTitle) {
    throw new Error('Tiêu đề công việc không được để trống.');
  }

  const newTodo: TodoItem = {
    id: crypto.randomUUID(),
    title: trimmedTitle,
    description: (input.description || '').trim(),
    priority: input.priority || 'medium',
    status: input.status || 'pending',
    dueDate: input.dueDate || '',
    reminderAt: input.reminderAt || '',
    reminderNotified: false,
    tags: Array.isArray(input.tags) && input.tags.length > 0
      ? [...new Set(input.tags.map(t => t.trim()).filter(Boolean))]
      : ['General'],
    createdAt: new Date().toISOString(),
    completedAt: input.status === 'completed' ? new Date().toISOString() : undefined,
  };

  await db.todos.add(newTodo);
  notifyBackgroundBadgeUpdate();
  return newTodo;
}

/**
 * Update an existing Todo item
 */
export async function updateTodo(
  id: string,
  updates: Partial<Omit<TodoItem, 'id' | 'createdAt'>>
): Promise<void> {
  const existing = await db.todos.get(id);
  if (!existing) {
    throw new Error('Nhiệm vụ không tồn tại.');
  }

  const payload: Partial<TodoItem> = { ...updates };
  if (payload.title !== undefined) {
    payload.title = payload.title.trim();
    if (!payload.title) {
      throw new Error('Tiêu đề công việc không được để trống.');
    }
  }

  if (payload.status === 'completed' && !existing.completedAt) {
    payload.completedAt = new Date().toISOString();
  } else if (payload.status === 'pending') {
    payload.completedAt = undefined;
  }

  // If reminderAt is updated to a new future time, reset reminderNotified
  if (payload.reminderAt && payload.reminderAt !== existing.reminderAt) {
    payload.reminderNotified = false;
  }

  await db.todos.update(id, payload);
  notifyBackgroundBadgeUpdate();
}

/**
 * Delete a Todo item
 */
export async function deleteTodo(id: string): Promise<void> {
  await db.todos.delete(id);
  notifyBackgroundBadgeUpdate();
}

/**
 * Toggle todo status between pending and completed
 */
export async function toggleTodoStatus(id: string): Promise<TodoItem | null> {
  const todo = await db.todos.get(id);
  if (!todo) return null;

  const newStatus: 'pending' | 'completed' = todo.status === 'completed' ? 'pending' : 'completed';
  const completedAt = newStatus === 'completed' ? new Date().toISOString() : undefined;

  await db.todos.update(id, {
    status: newStatus,
    completedAt,
  });

  notifyBackgroundBadgeUpdate();
  return {
    ...todo,
    status: newStatus,
    completedAt,
  };
}

/**
 * Get all todos
 */
export async function getTodos(): Promise<TodoItem[]> {
  return await db.todos.reverse().sortBy('createdAt');
}

/**
 * Get pending todos
 */
export async function getPendingTodos(): Promise<TodoItem[]> {
  const all = await db.todos.toArray();
  return all.filter(t => t.status === 'pending');
}

/**
 * Get overdue todos (pending and due date < today/now)
 */
export async function getOverdueTodos(): Promise<TodoItem[]> {
  const all = await db.todos.toArray();
  return all.filter(t => t.status === 'pending' && isDateOverdue(t.dueDate));
}

/**
 * Get todos due today
 */
export async function getDueTodayTodos(): Promise<TodoItem[]> {
  const all = await db.todos.toArray();
  return all.filter(t => isDateToday(t.dueDate));
}

/**
 * Compute statistics for Todos
 */
export async function getTodoStats(): Promise<TodoStats> {
  const all = await db.todos.toArray();
  const total = all.length;
  const pending = all.filter(t => t.status === 'pending').length;
  const completed = all.filter(t => t.status === 'completed').length;
  const dueToday = all.filter(t => t.status === 'pending' && isDateToday(t.dueDate)).length;
  const overdue = all.filter(t => t.status === 'pending' && isDateOverdue(t.dueDate)).length;
  const highPriority = all.filter(t => t.status === 'pending' && t.priority === 'high').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    pending,
    completed,
    dueToday,
    overdue,
    highPriority,
    completionRate,
  };
}

/**
 * Formats relative due date for display (e.g., "Hôm nay", "Quá hạn", "Ngày mai", or formatted date)
 */
export function formatRelativeDueDate(dateStr?: string, lang: 'vi' | 'en' = 'vi'): string {
  if (!dateStr) return '';

  const now = new Date();
  const todayStr = getTodayDateString(now);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getTodayDateString(tomorrow);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getTodayDateString(yesterday);

  const hasTime = dateStr.includes('T');
  let timePart = '';
  if (hasTime) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      timePart = ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
  }

  const baseDate = dateStr.slice(0, 10);

  if (baseDate === todayStr) {
    return lang === 'vi' ? `Hôm nay${timePart}` : `Today${timePart}`;
  }
  if (baseDate === tomorrowStr) {
    return lang === 'vi' ? `Ngày mai${timePart}` : `Tomorrow${timePart}`;
  }
  if (baseDate === yesterdayStr) {
    return lang === 'vi' ? `Hôm qua${timePart}` : `Yesterday${timePart}`;
  }

  if (isDateOverdue(dateStr)) {
    return lang === 'vi' ? `Quá hạn (${baseDate})` : `Overdue (${baseDate})`;
  }

  return `${baseDate}${timePart}`;
}

/**
 * Check and notify pending todos whose reminder time has arrived or that are overdue
 */
export async function checkAndNotifyPendingTodos(): Promise<{ notifiedCount: number; overdueCount: number }> {
  const settings = await getSettings();
  const isEnabled = settings.enable_todo_reminders !== false;
  const lang = settings.language || 'vi';

  const pendingTodos = await db.todos.filter(t => t.status === 'pending').toArray();
  const now = new Date();
  const nowTime = now.getTime();

  let notifiedCount = 0;
  let overdueCount = 0;

  // 1. Check specific scheduled reminders (reminderAt)
  for (const todo of pendingTodos) {
    if (todo.reminderAt && !todo.reminderNotified) {
      const reminderTime = new Date(todo.reminderAt).getTime();
      if (!isNaN(reminderTime) && reminderTime <= nowTime) {
        // Trigger notification
        if (isEnabled && typeof chrome !== 'undefined' && chrome.notifications) {
          try {
            chrome.notifications.create(`todo-reminder-${todo.id}`, {
              type: 'basic',
              iconUrl: 'logo.png',
              title: lang === 'vi' ? '⏰ Nhắc nhở công việc / Ghi chú' : '⏰ Task & Note Reminder',
              message: `${todo.title}${todo.dueDate ? ` (Hạn: ${formatRelativeDueDate(todo.dueDate, lang)})` : ''}`,
              priority: 2,
              requireInteraction: true,
            });
          } catch (e) {
            console.warn('Chrome notification error:', e);
          }
        }
        await db.todos.update(todo.id, { reminderNotified: true });
        notifiedCount++;
      }
    }

    if (isDateOverdue(todo.dueDate)) {
      overdueCount++;
    }
  }

  // 2. Update Chrome Extension Badge
  await updateChromeExtensionBadge(pendingTodos.length, overdueCount);

  return { notifiedCount, overdueCount };
}

/**
 * Updates extension icon badge text & background color
 */
export async function updateChromeExtensionBadge(pendingCount?: number, overdueCount?: number) {
  if (typeof chrome === 'undefined' || !chrome.action) return;

  const settings = await getSettings();
  if (settings.show_todo_badge === false) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  if (pendingCount === undefined) {
    const pendingTodos = await db.todos.filter(t => t.status === 'pending').toArray();
    pendingCount = pendingTodos.length;
    overdueCount = pendingTodos.filter(t => isDateOverdue(t.dueDate)).length;
  }

  if (pendingCount > 0) {
    chrome.action.setBadgeText({ text: String(pendingCount) });
    if (overdueCount && overdueCount > 0) {
      // Red badge for overdue tasks
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    } else {
      // Bright indigo/sky for pending tasks
      chrome.action.setBadgeBackgroundColor({ color: '#0284c7' });
    }
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Quick Task & Note Presets for versatile daily use (Work, Notes, Personal, Study)
 */
export const QUICK_TODO_PRESETS = [
  {
    titleVi: 'Gửi báo cáo / Hoàn thành task công việc',
    titleEn: 'Submit report / Finish work task',
    tags: ['Work'],
    priority: 'high' as const,
  },
  {
    titleVi: 'Ghi chú ý tưởng / nội dung mới',
    titleEn: 'Note down new ideas & thoughts',
    tags: ['Notes'],
    priority: 'medium' as const,
  },
  {
    titleVi: 'Ôn 20 từ vựng SRS',
    titleEn: 'Review 20 SRS Vocabulary Words',
    tags: ['Vocabulary', 'Study'],
    priority: 'high' as const,
  },
  {
    titleVi: '1 phiên Pomodoro tập trung 25 phút',
    titleEn: '1 Focused 25-Min Pomodoro Session',
    tags: ['Focus'],
    priority: 'medium' as const,
  },
  {
    titleVi: 'Họp / Trao đổi công việc',
    titleEn: 'Meeting / Discussion',
    tags: ['Work'],
    priority: 'medium' as const,
  },
  {
    titleVi: 'Việc cá nhân / Cần làm hôm nay',
    titleEn: 'Personal errand / To-do today',
    tags: ['Personal'],
    priority: 'low' as const,
  },
];

export const STUDY_PRESETS = QUICK_TODO_PRESETS;

