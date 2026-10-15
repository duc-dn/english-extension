import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from './db';
import {
  addTodo,
  updateTodo,
  deleteTodo,
  toggleTodoStatus,
  getTodos,
  getPendingTodos,
  getOverdueTodos,
  getDueTodayTodos,
  getTodoStats,
  formatRelativeDueDate,
  isDateToday,
  isDateOverdue,
  getTodayDateString,
} from './todo';

describe('Todo Service and Store (Dexie & Helpers)', () => {
  beforeEach(async () => {
    await db.todos.clear();
  });

  it('should add a new todo item properly', async () => {
    const item = await addTodo({
      title: 'Review 20 words',
      description: 'Focus on technology terms',
      priority: 'high',
      dueDate: '2026-10-15',
      tags: ['English', 'Vocabulary'],
    });

    expect(item.id).toBeDefined();
    expect(item.title).toBe('Review 20 words');
    expect(item.priority).toBe('high');
    expect(item.status).toBe('pending');
    expect(item.tags).toEqual(['English', 'Vocabulary']);
    expect(item.createdAt).toBeDefined();

    const count = await db.todos.count();
    expect(count).toBe(1);
  });

  it('should throw an error when title is empty', async () => {
    await expect(addTodo({ title: '   ' })).rejects.toThrow();
  });

  it('should toggle todo status between pending and completed', async () => {
    const item = await addTodo({
      title: 'Complete homework',
    });
    expect(item.status).toBe('pending');

    const toggled = await toggleTodoStatus(item.id);
    expect(toggled?.status).toBe('completed');
    expect(toggled?.completedAt).toBeDefined();

    const toggledBack = await toggleTodoStatus(item.id);
    expect(toggledBack?.status).toBe('pending');
    expect(toggledBack?.completedAt).toBeUndefined();
  });

  it('should update todo fields correctly', async () => {
    const item = await addTodo({
      title: 'Initial Title',
      priority: 'low',
    });

    await updateTodo(item.id, {
      title: 'Updated Title',
      priority: 'high',
      description: 'New notes',
    });

    const updated = await db.todos.get(item.id);
    expect(updated?.title).toBe('Updated Title');
    expect(updated?.priority).toBe('high');
    expect(updated?.description).toBe('New notes');
  });

  it('should delete a todo item', async () => {
    const item = await addTodo({
      title: 'Task to delete',
    });

    expect(await db.todos.count()).toBe(1);
    await deleteTodo(item.id);
    expect(await db.todos.count()).toBe(0);
  });

  it('should calculate todo statistics accurately', async () => {
    const todayStr = getTodayDateString();
    
    // 1 pending task due today
    await addTodo({
      title: 'Task 1',
      priority: 'high',
      dueDate: todayStr,
      status: 'pending',
    });

    // 1 pending overdue task (past date)
    await addTodo({
      title: 'Task 2',
      priority: 'medium',
      dueDate: '2020-01-01',
      status: 'pending',
    });

    // 1 completed task
    await addTodo({
      title: 'Task 3',
      priority: 'low',
      status: 'completed',
    });

    const stats = await getTodoStats();
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(2);
    expect(stats.completed).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.overdue).toBe(1);
    expect(stats.highPriority).toBe(1);
    expect(stats.completionRate).toBe(33); // 1/3 = 33%

    const all = await getTodos();
    expect(all.length).toBe(3);
    const pendingList = await getPendingTodos();
    expect(pendingList.length).toBe(2);
    const overdueList = await getOverdueTodos();
    expect(overdueList.length).toBe(1);
    const dueTodayList = await getDueTodayTodos();
    expect(dueTodayList.length).toBe(1);
  });

  it('should accurately test isDateToday and isDateOverdue', () => {
    const todayStr = getTodayDateString();
    expect(isDateToday(todayStr)).toBe(true);
    expect(isDateToday('2020-01-01')).toBe(false);

    expect(isDateOverdue('2020-01-01')).toBe(true);
    expect(isDateOverdue('2099-01-01')).toBe(false);
  });

  it('should format relative due dates properly', () => {
    const todayStr = getTodayDateString();
    expect(formatRelativeDueDate(todayStr, 'vi')).toBe('Hôm nay');
    expect(formatRelativeDueDate(todayStr, 'en')).toBe('Today');
    expect(formatRelativeDueDate('2020-01-01', 'vi')).toContain('Quá hạn');
    expect(formatRelativeDueDate('2020-01-01', 'en')).toContain('Overdue');
  });
});
