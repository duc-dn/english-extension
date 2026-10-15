import React, { useState, useMemo, useEffect } from 'react';
import { Row, Col, Typography, Input, Button, Tag, Select, Modal, message, Popconfirm, Progress, Tooltip, Segmented } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ActivityCalendar } from 'react-activity-calendar';
import { 
  CheckSquare, 
  Square, 
  Plus, 
  Search, 
  Calendar, 
  Clock, 
  Bell, 
  AlertCircle, 
  CheckCircle2, 
  Trash2, 
  Edit3, 
  Timer, 
  Sparkles, 
  Tag as TagIcon,
  Layers,
  BarChart3,
  ListTodo,
  FileText,
  Zap,
  ArrowRight
} from 'lucide-react';
import { db, type TodoItem } from '../lib/db';
import { 
  addTodo, 
  updateTodo, 
  deleteTodo, 
  toggleTodoStatus, 
  formatRelativeDueDate, 
  isDateToday, 
  isDateOverdue, 
  getTodayDateString,
  STUDY_PRESETS,
  type TodoFilterType 
} from '../lib/todo';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { playTaskCompleteChime } from '../lib/audio';

const { Title, Text } = Typography;

function parseLocalDateKey(dateStr?: string): string | null {
  if (!dateStr) return null;
  if (dateStr.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return null;
  }
}

interface TodoPageProps {
  defaultTab?: 'dashboard' | 'tasks';
}

export const TodoPage: React.FC<TodoPageProps> = ({ defaultTab }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Tab State: 'dashboard' vs 'tasks' (driven by route)
  const isDashboardRoute = location.pathname.includes('/todos/dashboard');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tasks'>(
    defaultTab || (isDashboardRoute ? 'dashboard' : 'tasks')
  );

  useEffect(() => {
    if (location.pathname.includes('/todos/dashboard')) {
      setActiveTab('dashboard');
    } else if (location.pathname === '/todos' || location.pathname.includes('/todos/tasks')) {
      setActiveTab('tasks');
    }
  }, [location.pathname]);

  // Live query for all todos
  const todos = useLiveQuery(() => db.todos.reverse().sortBy('createdAt')) || [];

  // Scratchpad memo state (auto-saved)
  const [scratchpadText, setScratchpadText] = useState(() => {
    try {
      return localStorage.getItem('english_ext_todo_scratchpad') || '';
    } catch {
      return '';
    }
  });

  const handleScratchpadChange = (val: string) => {
    setScratchpadText(val);
    try {
      localStorage.setItem('english_ext_todo_scratchpad', val);
    } catch {
      // ignore
    }
  };

  const handleClearScratchpad = () => {
    setScratchpadText('');
    try {
      localStorage.removeItem('english_ext_todo_scratchpad');
      message.info(translate('todoScratchpadClear', currentLang));
    } catch {
      // ignore
    }
  };

  const handleConvertScratchpadToTask = () => {
    if (!scratchpadText.trim()) return;
    const lines = scratchpadText.trim().split('\n');
    const title = lines[0];
    const desc = lines.slice(1).join('\n');
    setEditingTodo(null);
    setModalTitle(title);
    setModalDesc(desc);
    setModalPriority('medium');
    setModalDueDate(getTodayDateString());
    setModalReminderAt('');
    setModalTagsStr('Notes, Memo');
    setIsModalOpen(true);
  };

  // Local state for UI controls (Task Planner Tab)
  const [filterType, setFilterType] = useState<TodoFilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal edit/create state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDesc, setModalDesc] = useState('');
  const [modalPriority, setModalPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [modalDueDate, setModalDueDate] = useState('');
  const [modalReminderAt, setModalReminderAt] = useState('');
  const [modalTagsStr, setModalTagsStr] = useState('');
  const [modalLoading, setModalLoading] = useState(false);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const pending = total - completed;
    const dueToday = todos.filter(t => t.status === 'pending' && isDateToday(t.dueDate)).length;
    const overdue = todos.filter(t => t.status === 'pending' && isDateOverdue(t.dueDate)).length;
    const highPriority = todos.filter(t => t.status === 'pending' && t.priority === 'high').length;
    const mediumPriority = todos.filter(t => t.status === 'pending' && t.priority === 'medium').length;
    const lowPriority = todos.filter(t => t.status === 'pending' && t.priority === 'low').length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { 
      total, 
      completed, 
      pending, 
      dueToday, 
      overdue, 
      highPriority, 
      mediumPriority, 
      lowPriority, 
      completionRate 
    };
  }, [todos]);

  // Today's schedule / focus todos for Dashboard
  const todayTodos = useMemo(() => {
    return todos.filter(t => isDateToday(t.dueDate) || (t.status === 'pending' && isDateOverdue(t.dueDate)));
  }, [todos]);

  // Recently completed todos for Dashboard
  const recentCompletedTodos = useMemo(() => {
    return todos.filter(t => t.status === 'completed').slice(0, 5);
  }, [todos]);

  // Extract unique tags and count for distribution
  const tagDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    todos.forEach(t => {
      (t.tags || []).forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [todos]);



  // Activity Heatmap Calendar filter & data calculation
  const [activityFilter, setActivityFilter] = useState<'completed' | 'all' | 'created'>('completed');

  const { activityCalendarData, totalActivityCount } = useMemo(() => {
    const counts: Record<string, number> = {};

    todos.forEach(todo => {
      if (activityFilter === 'completed' || activityFilter === 'all') {
        if (todo.status === 'completed') {
          const compDate = parseLocalDateKey(todo.completedAt) 
            || parseLocalDateKey(todo.dueDate)
            || parseLocalDateKey(todo.createdAt);
          if (compDate) {
            counts[compDate] = (counts[compDate] || 0) + 1;
          }
        }
      }
      if (activityFilter === 'created' || activityFilter === 'all') {
        const createDate = parseLocalDateKey(todo.createdAt);
        if (createDate) {
          counts[createDate] = (counts[createDate] || 0) + 1;
        }
      }
    });

    const data: { date: string; count: number; level: number }[] = [];
    const today = new Date();
    let total = 0;

    for (let i = 365; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const count = counts[dateStr] || 0;
      total += count;

      let level = 0;
      if (count > 0 && count <= 2) level = 1;
      else if (count > 2 && count <= 4) level = 2;
      else if (count > 4 && count <= 7) level = 3;
      else if (count > 7) level = 4;

      data.push({
        date: dateStr,
        count,
        level,
      });
    }

    return { activityCalendarData: data, totalActivityCount: total };
  }, [todos, activityFilter]);

  // Filtered todos for Task Manager tab
  const filteredTodos = useMemo(() => {
    return todos.filter(todo => {
      // 1. Status & timeline filter
      if (filterType === 'pending' && todo.status !== 'pending') return false;
      if (filterType === 'completed' && todo.status !== 'completed') return false;
      if (filterType === 'today' && (todo.status !== 'pending' || !isDateToday(todo.dueDate))) return false;
      if (filterType === 'overdue' && (todo.status !== 'pending' || !isDateOverdue(todo.dueDate))) return false;
      if (filterType === 'upcoming') {
        if (todo.status !== 'pending') return false;
        if (!todo.dueDate || isDateToday(todo.dueDate) || isDateOverdue(todo.dueDate)) return false;
      }

      // 2. Search query (matches title, description, and tags)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = todo.title.toLowerCase().includes(q);
        const inDesc = (todo.description || '').toLowerCase().includes(q);
        const inTag = (todo.tags || []).some(t => t.toLowerCase().includes(q));
        if (!inTitle && !inDesc && !inTag) return false;
      }

      return true;
    });
  }, [todos, filterType, searchQuery]);

  // Handle Toggle Status
  const handleToggle = async (todo: TodoItem) => {
    try {
      const updated = await toggleTodoStatus(todo.id);
      if (updated?.status === 'completed') {
        playTaskCompleteChime();
        message.success(translate('todoCompletedSuccess', currentLang));
      }
    } catch {
      message.error('Lỗi khi cập nhật trạng thái');
    }
  };

  // Handle Delete
  const handleDelete = async (id: string) => {
    try {
      await deleteTodo(id);
      message.success(translate('todoDeleteSuccess', currentLang));
    } catch {
      message.error('Lỗi khi xóa nhiệm vụ');
    }
  };

  // Open Modal for Create or Edit
  const openModal = (todo?: TodoItem) => {
    if (todo) {
      setEditingTodo(todo);
      setModalTitle(todo.title);
      setModalDesc(todo.description || '');
      setModalPriority(todo.priority);
      setModalDueDate(todo.dueDate || '');
      setModalReminderAt(todo.reminderAt || '');
      setModalTagsStr((todo.tags || []).join(', '));
    } else {
      setEditingTodo(null);
      setModalTitle('');
      setModalDesc('');
      setModalPriority('medium');
      setModalDueDate(getTodayDateString());
      setModalReminderAt('');
      setModalTagsStr('General');
    }
    setIsModalOpen(true);
  };

  // Quick preset click inside Modal
  const handleApplyPresetToModal = (preset: typeof STUDY_PRESETS[0]) => {
    setModalTitle(currentLang === 'vi' ? preset.titleVi : preset.titleEn);
    setModalPriority(preset.priority);
    setModalTagsStr(preset.tags.join(', '));
  };

  // Save from Modal
  const handleSaveModal = async () => {
    if (!modalTitle.trim()) {
      message.warning(translate('todoTitleLabel', currentLang));
      return;
    }

    setModalLoading(true);
    try {
      const tags = modalTagsStr
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      if (editingTodo) {
        await updateTodo(editingTodo.id, {
          title: modalTitle,
          description: modalDesc,
          priority: modalPriority,
          dueDate: modalDueDate || undefined,
          reminderAt: modalReminderAt || undefined,
          tags,
        });
        message.success(translate('todoUpdateSuccess', currentLang));
      } else {
        await addTodo({
          title: modalTitle,
          description: modalDesc,
          priority: modalPriority,
          dueDate: modalDueDate || undefined,
          reminderAt: modalReminderAt || undefined,
          tags,
        });
        message.success(translate('todoAddSuccess', currentLang));
      }
      setIsModalOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving task';
      message.error(msg);
    } finally {
      setModalLoading(false);
    }
  };

  // Helper for quick setting reminder time
  const setQuickReminderTime = (hoursFromNow: number) => {
    const d = new Date(Date.now() + hoursFromNow * 3600 * 1000);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const ho = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    setModalReminderAt(`${yr}-${mo}-${da}T${ho}:${mi}`);
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 60 }}>
      {/* 🌟 Top Page Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ 
              width: 38, 
              height: 38, 
              borderRadius: 12, 
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)', 
              color: '#ffffff', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)'
            }}>
              {activeTab === 'dashboard' ? <BarChart3 size={20} /> : <ListTodo size={20} />}
            </div>
            <div>
              <Title level={3} style={{ margin: 0, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '-0.3px' }}>
                {activeTab === 'dashboard' ? translate('todoNavDashboard', currentLang) : translate('todoPageTitle', currentLang)}
              </Title>
              <Text style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>
                {activeTab === 'dashboard' ? translate('todoDashboardSubtitle', currentLang) : translate('todoPageDesc', currentLang)}
              </Text>
            </div>
          </div>
        </div>

        {/* Action Controls: Add Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="primary"
            icon={<Plus size={14} />}
            onClick={() => openModal()}
            style={{
              height: 32,
              padding: '0 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: '#0284c7',
              border: 'none',
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5
            }}
          >
            {translate('addTodoBtn', currentLang)}
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 📊 TAB 1: DASHBOARD (TỔNG QUAN & PHÂN TÍCH GHI CHÚ / CÔNG VIỆC)            */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div style={{ animation: 'fadeIn 0.22s ease-in-out' }}>
          {/* Top Bento KPI Metrics Row - Equal Height Cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24, display: 'flex', alignItems: 'stretch' }}>
            {/* KPI 1: Completion Rate */}
            <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
              <div 
                className="bento-card hover-lift" 
                style={{ 
                  width: '100%', 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  flex: 1 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                    {translate('todoStatsTotal', currentLang)}
                  </span>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={17} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 14 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', lineHeight: 1.1 }}>
                    {stats.total}
                  </div>
                  <div style={{ marginTop: 8, height: 32, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Progress 
                      percent={stats.completionRate} 
                      strokeColor="#10b981" 
                      size="small" 
                      status="active" 
                      style={{ margin: '0 0 2px 0' }}
                    />
                    <div style={{ fontSize: 11, color: isDark ? '#64748b' : '#94a3b8' }}>
                      {stats.completed} {translate('todoStatsCompleted', currentLang).toLowerCase()} ({stats.completionRate}%)
                    </div>
                  </div>
                </div>
              </div>
            </Col>

            {/* KPI 2: Pending Tasks */}
            <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
              <div 
                className="bento-card bento-card-interactive hover-lift" 
                onClick={() => { navigate('/todos'); setFilterType('pending'); }}
                style={{ 
                  width: '100%', 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  flex: 1 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                    {translate('todoStatsPending', currentLang)}
                  </span>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={17} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 14 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: stats.pending > 0 ? '#f59e0b' : (isDark ? '#f8fafc' : '#0f172a'), lineHeight: 1.1 }}>
                    {stats.pending}
                  </div>
                  <div style={{ marginTop: 8, height: 32, display: 'flex', alignItems: 'center', fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', lineHeight: 1.3 }}>
                    {stats.highPriority > 0 ? `🔥 ${stats.highPriority} ${translate('todoPriorityHigh', currentLang).toLowerCase()}` : (currentLang === 'vi' ? 'Đang chờ xử lý' : 'Pending resolution')}
                  </div>
                </div>
              </div>
            </Col>

            {/* KPI 3: Due Today */}
            <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
              <div 
                className="bento-card bento-card-interactive hover-lift" 
                onClick={() => { navigate('/todos'); setFilterType('today'); }}
                style={{ 
                  width: '100%', 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  flex: 1 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                    {translate('todoStatsToday', currentLang)}
                  </span>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(14, 165, 233, 0.1)', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={17} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 14 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: stats.dueToday > 0 ? '#0284c7' : (isDark ? '#f8fafc' : '#0f172a'), lineHeight: 1.1 }}>
                    {stats.dueToday}
                  </div>
                  <div style={{ marginTop: 8, height: 32, display: 'flex', alignItems: 'center', fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', lineHeight: 1.3 }}>
                    {stats.dueToday > 0 ? `⚡ ${translate('todoDueTodayBanner', currentLang, { count: stats.dueToday })}` : (currentLang === 'vi' ? 'Hạn trong hôm nay' : 'Due by end of today')}
                  </div>
                </div>
              </div>
            </Col>

            {/* KPI 4: Overdue Tasks */}
            <Col xs={24} sm={12} lg={6} style={{ display: 'flex' }}>
              <div 
                className="bento-card bento-card-interactive hover-lift" 
                onClick={() => { navigate('/todos'); setFilterType('overdue'); }}
                style={{ 
                  width: '100%', 
                  padding: '20px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between',
                  flex: 1,
                  border: stats.overdue > 0 ? (isDark ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(239, 68, 68, 0.3)') : undefined 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                    {translate('todoStatsOverdue', currentLang)}
                  </span>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AlertCircle size={17} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginTop: 14 }}>
                  <div style={{ fontSize: 32, fontWeight: 800, color: stats.overdue > 0 ? '#ef4444' : (isDark ? '#f8fafc' : '#0f172a'), lineHeight: 1.1 }}>
                    {stats.overdue}
                  </div>
                  <div style={{ marginTop: 8, height: 32, display: 'flex', alignItems: 'center', fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', lineHeight: 1.3 }}>
                    {stats.overdue > 0 ? `⚠️ ${translate('todoFilterOverdue', currentLang)}` : translate('todoNoOverdueTasks', currentLang)}
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          {/* Main 2-Column Row: Today's Action Schedule + Quick Scratchpad */}
          <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
            {/* Left: Today's Focus Action Tasks */}
            <Col xs={24} lg={14}>
              <div className="bento-card" style={{ padding: '22px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'rgba(2, 132, 199, 0.12)',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Calendar size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                        {translate('todoTodayScheduleTitle', currentLang)}
                      </h4>
                      <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                        {todayTodos.length > 0
                          ? translate('todoTasksLeftToday', currentLang, { count: todayTodos.filter(t => t.status === 'pending').length })
                          : translate('todoNoTodayTasks', currentLang)}
                      </span>
                    </div>
                  </div>

                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate('/todos')}
                    style={{ fontWeight: 700, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {translate('todoGoToAddTask', currentLang)} <ArrowRight size={14} />
                  </Button>
                </div>

                {/* List of Today's Focus Tasks */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {todayTodos.length === 0 ? (
                    <div style={{
                      padding: '36px 16px',
                      textAlign: 'center',
                      borderRadius: 12,
                      background: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.01)',
                      border: isDark ? '1px dashed rgba(255, 255, 255, 0.1)' : '1px dashed #e2e8f0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8
                    }}>
                      <CheckCircle2 size={32} color="#10b981" />
                      <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#e2e8f0' : '#334155' }}>
                        {translate('todoAllDoneToday', currentLang)}
                      </div>
                      <Button
                        size="small"
                        icon={<Plus size={14} />}
                        onClick={() => openModal()}
                        style={{ borderRadius: 8, marginTop: 4 }}
                      >
                        {translate('addTodoBtn', currentLang)}
                      </Button>
                    </div>
                  ) : (
                    todayTodos.map(todo => {
                      const isCompleted = todo.status === 'completed';
                      const isOverdue = todo.status === 'pending' && isDateOverdue(todo.dueDate);

                      return (
                        <div
                          key={todo.id}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 12,
                            background: isCompleted
                              ? (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.015)')
                              : isOverdue
                                ? (isDark ? 'rgba(239, 68, 68, 0.08)' : '#fef2f2')
                                : (isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc'),
                            border: isOverdue
                              ? '1px solid rgba(239, 68, 68, 0.3)'
                              : (isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #e2e8f0'),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                            <button
                              type="button"
                              onClick={() => handleToggle(todo)}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                color: isCompleted ? '#10b981' : (isDark ? '#64748b' : '#94a3b8')
                              }}
                            >
                              {isCompleted ? <CheckSquare size={18} /> : <Square size={18} />}
                            </button>

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: isCompleted ? (isDark ? '#64748b' : '#94a3b8') : (isDark ? '#f8fafc' : '#0f172a'),
                                textDecoration: isCompleted ? 'line-through' : 'none',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>
                                {todo.title}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                {todo.priority === 'high' && (
                                  <Tag color="error" style={{ margin: 0, fontSize: 10.5, borderRadius: 6, lineHeight: '18px' }}>
                                    🔥 {translate('todoPriorityHigh', currentLang)}
                                  </Tag>
                                )}
                                {todo.dueDate && (
                                  <span style={{ fontSize: 11, color: isOverdue ? '#ef4444' : (isDark ? '#94a3b8' : '#64748b'), fontWeight: 600 }}>
                                    {formatRelativeDueDate(todo.dueDate, currentLang)}
                                  </span>
                                )}
                                {(todo.tags || []).slice(0, 2).map((tg, idx) => (
                                  <span key={idx} style={{ fontSize: 10.5, color: isDark ? '#64748b' : '#94a3b8' }}>
                                    #{tg}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {!isCompleted && (
                              <Tooltip title={translate('todoStartPomodoro', currentLang)}>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<Timer size={14} color="#0284c7" />}
                                  onClick={() => navigate('/pomodoro', { state: { taskTitle: todo.title } })}
                                  style={{ borderRadius: 6 }}
                                />
                              </Tooltip>
                            )}
                            <Button
                              type="text"
                              size="small"
                              icon={<Edit3 size={14} color={isDark ? '#94a3b8' : '#64748b'} />}
                              onClick={() => openModal(todo)}
                              style={{ borderRadius: 6 }}
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </Col>

            {/* Right: Quick Scratchpad / Memo */}
            <Col xs={24} lg={10}>
              <div className="bento-card" style={{ padding: '22px 24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      background: 'rgba(245, 158, 11, 0.12)',
                      color: '#f59e0b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <FileText size={18} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                        {translate('todoScratchpadTitle', currentLang)}
                      </h4>
                      <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                        {translate('todoScratchpadDesc', currentLang)}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Input.TextArea
                    value={scratchpadText}
                    onChange={(e) => handleScratchpadChange(e.target.value)}
                    placeholder={translate('todoScratchpadPlaceholder', currentLang)}
                    style={{
                      flex: 1,
                      minHeight: 180,
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                      resize: 'none',
                      background: isDark ? 'rgba(0, 0, 0, 0.2)' : '#ffffff',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #cbd5e1'
                    }}
                  />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<Trash2 size={13} />}
                      onClick={handleClearScratchpad}
                      disabled={!scratchpadText.trim()}
                    >
                      {translate('todoScratchpadClear', currentLang)}
                    </Button>

                    <Button
                      type="primary"
                      size="small"
                      icon={<Plus size={14} />}
                      onClick={handleConvertScratchpadToTask}
                      disabled={!scratchpadText.trim()}
                      style={{
                        borderRadius: 8,
                        fontWeight: 700,
                        background: '#0284c7'
                      }}
                    >
                      {translate('todoScratchpadConvertToTask', currentLang)}
                    </Button>
                  </div>
                </div>
              </div>
            </Col>
          </Row>

          {/* 📅 Task Activity Heatmap Calendar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color="#0284c7" />
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                  {translate('todoActivityHistoryTitle', currentLang)}
                </h4>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Segmented
                  size="small"
                  value={activityFilter}
                  onChange={(val) => setActivityFilter(val as 'completed' | 'all' | 'created')}
                  options={[
                    { label: `✓ ${translate('todoActivityCompleted', currentLang)}`, value: 'completed' },
                    { label: `⚡ ${translate('todoActivityAll', currentLang)}`, value: 'all' },
                    { label: `+ ${translate('todoActivityCreated', currentLang)}`, value: 'created' },
                  ]}
                  style={{
                    borderRadius: 8,
                    background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(241, 245, 249, 0.9)',
                  }}
                />

                <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                  {totalActivityCount} {translate('todoActivitiesThisYear', currentLang)}
                </span>
              </div>
            </div>

            <div className="bento-card hover-lift" style={{ padding: '24px 20px', overflowX: 'auto' }}>
              <div style={{ minWidth: 800, display: 'flex', justifyContent: 'center' }}>
                {activityCalendarData.length > 0 && (
                  <ActivityCalendar 
                    data={activityCalendarData} 
                    theme={{
                      light: ['#f1f5f9', '#bae6fd', '#38bdf8', '#0284c7', '#0369a1'],
                      dark: ['#1e293b', '#0369a1', '#0284c7', '#38bdf8', '#bae6fd'],
                    }}
                    labels={{
                      totalCount: translate('todoActivitiesInPastYear', currentLang, { count: '{{count}}' }),
                    }}
                    renderBlock={(block, activity) => (
                      <Tooltip title={translate('todoTasksOn', currentLang, { count: activity.count, date: activity.date })}>
                        {block}
                      </Tooltip>
                    )}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Deep Analytics Row: Priority Distribution + Tag Breakdown + Recent History */}
          <Row gutter={[20, 20]}>
            {/* Priority Distribution */}
            <Col xs={24} md={8}>
              <div className="bento-card" style={{ padding: '20px 22px', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <Zap size={16} color="#ef4444" />
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {translate('todoPriorityDistribution', currentLang)}
                  </h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      <span style={{ color: '#ef4444' }}>🔥 {translate('todoPriorityHigh', currentLang)}</span>
                      <span>{stats.highPriority} tasks</span>
                    </div>
                    <Progress 
                      percent={stats.pending > 0 ? Math.round((stats.highPriority / stats.pending) * 100) : 0} 
                      strokeColor="#ef4444" 
                      size="small" 
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      <span style={{ color: '#f59e0b' }}>⚡ {translate('todoPriorityMedium', currentLang)}</span>
                      <span>{stats.mediumPriority} tasks</span>
                    </div>
                    <Progress 
                      percent={stats.pending > 0 ? Math.round((stats.mediumPriority / stats.pending) * 100) : 0} 
                      strokeColor="#f59e0b" 
                      size="small" 
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      <span style={{ color: '#10b981' }}>🌱 {translate('todoPriorityLow', currentLang)}</span>
                      <span>{stats.lowPriority} tasks</span>
                    </div>
                    <Progress 
                      percent={stats.pending > 0 ? Math.round((stats.lowPriority / stats.pending) * 100) : 0} 
                      strokeColor="#10b981" 
                      size="small" 
                    />
                  </div>
                </div>
              </div>
            </Col>

            {/* Category / Tags Distribution */}
            <Col xs={24} md={8}>
              <div className="bento-card" style={{ padding: '20px 22px', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <TagIcon size={16} color="#0284c7" />
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {translate('todoTagsDistribution', currentLang)}
                  </h4>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tagDistribution.length === 0 ? (
                    <div style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8' }}>Chưa có thẻ nào</div>
                  ) : (
                    tagDistribution.map(([tg, count]) => (
                      <span
                        key={tg}
                        onClick={() => {
                          setSearchQuery(tg);
                          setActiveTab('tasks');
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: isDark ? 'rgba(14, 165, 233, 0.15)' : '#f0f9ff',
                          color: '#0284c7',
                          border: isDark ? '1px solid rgba(14, 165, 233, 0.3)' : '1px solid #bae6fd'
                        }}
                      >
                        #{tg}
                        <span style={{
                          padding: '0 5px',
                          borderRadius: 6,
                          fontSize: 10.5,
                          background: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(2, 132, 199, 0.15)',
                          color: '#0284c7'
                        }}>
                          {count}
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </Col>

            {/* Recently Completed Log */}
            <Col xs={24} md={8}>
              <div className="bento-card" style={{ padding: '20px 22px', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <CheckCircle2 size={16} color="#10b981" />
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {translate('todoRecentCompleted', currentLang)}
                  </h4>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentCompletedTodos.length === 0 ? (
                    <div style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8' }}>
                      {translate('todoNoRecentCompleted', currentLang)}
                    </div>
                  ) : (
                    recentCompletedTodos.map(todo => (
                      <div
                        key={todo.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                          fontSize: 12
                        }}
                      >
                        <span style={{
                          color: isDark ? '#94a3b8' : '#475569',
                          textDecoration: 'line-through',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                          marginRight: 8
                        }}>
                          {todo.title}
                        </span>
                        <span style={{ fontSize: 10.5, color: '#10b981', fontWeight: 600 }}>
                          ✓ Done
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Col>
          </Row>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📝 TAB 2: TASKS & PLANNER (DANH SÁCH NHIỆM VỤ GỌN GÀNG, TẬP TRUNG)          */}
      {/* ========================================================================= */}
      {activeTab === 'tasks' && (
        <div style={{ animation: 'fadeIn 0.22s ease-in-out' }}>
          {/* 🔍 Filters & Search Bar */}
          <div 
            className="bento-card" 
            style={{ 
              padding: '14px 18px', 
              marginBottom: 18, 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              flexWrap: 'wrap', 
              gap: 12 
            }}
          >
            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[
                { key: 'all', label: translate('todoFilterAll', currentLang), count: stats.total },
                { key: 'today', label: translate('todoFilterToday', currentLang), count: stats.dueToday },
                { key: 'pending', label: translate('todoFilterPending', currentLang), count: stats.pending },
                { key: 'overdue', label: translate('todoFilterOverdue', currentLang), count: stats.overdue },
                { key: 'upcoming', label: translate('todoFilterUpcoming', currentLang) },
                { key: 'completed', label: translate('todoFilterCompleted', currentLang), count: stats.completed },
              ].map(f => {
                const isActive = filterType === f.key;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilterType(f.key as TodoFilterType)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 8,
                      fontSize: 12.5,
                      fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer',
                      border: isActive ? '1px solid #0284c7' : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0'),
                      background: isActive 
                        ? '#0284c7' 
                        : (isDark ? 'rgba(255, 255, 255, 0.03)' : '#ffffff'),
                      color: isActive ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>{f.label}</span>
                    {f.count !== undefined && (
                      <span style={{
                        padding: '1px 5px',
                        borderRadius: 6,
                        fontSize: 10.5,
                        background: isActive ? 'rgba(255, 255, 255, 0.25)' : (isDark ? 'rgba(255, 255, 255, 0.08)' : '#f1f5f9'),
                        color: isActive ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569')
                      }}>
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Right side: Clean, sleek rounded search bar */}
            <div style={{ display: 'flex', alignItems: 'center', minWidth: 240, maxWidth: 320, flex: '1 1 240px', justifyContent: 'flex-end' }}>
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={translate('todoSearchPlaceholder', currentLang)}
                prefix={<Search size={14} color={isDark ? '#38bdf8' : '#0284c7'} style={{ marginRight: 6 }} />}
                allowClear
                style={{ 
                  borderRadius: 20,
                  height: 34,
                  fontSize: 13,
                  width: '100%',
                  background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f8fafc',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                  boxShadow: 'none',
                }}
              />
            </div>
          </div>

          {/* 📋 Interactive Task & Notes Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredTodos.length === 0 ? (
              <div 
                className="bento-card" 
                style={{ 
                  padding: '48px 24px', 
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12
                }}
              >
                <div style={{ 
                  width: 56, 
                  height: 56, 
                  borderRadius: 16, 
                  background: 'rgba(2, 132, 199, 0.1)', 
                  color: '#0284c7', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}>
                  <CheckCircle2 size={30} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 4px 0', fontSize: 16, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {translate('todoNoTasksTitle', currentLang)}
                  </h4>
                  <p style={{ margin: 0, fontSize: 13, color: isDark ? '#94a3b8' : '#64748b', maxWidth: 420 }}>
                    {translate('todoNoTasksDesc', currentLang)}
                  </p>
                </div>
                <Button 
                  type="primary"
                  icon={<Plus size={14} />}
                  onClick={() => openModal()}
                  style={{
                    height: 32,
                    padding: '0 14px',
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    background: '#0284c7'
                  }}
                >
                  {translate('addTodoBtn', currentLang)}
                </Button>
              </div>
            ) : (
              filteredTodos.map((todo) => {
                const isCompleted = todo.status === 'completed';
                const isOverdue = todo.status === 'pending' && isDateOverdue(todo.dueDate);
                const isToday = isDateToday(todo.dueDate);

                return (
                  <div 
                    key={todo.id}
                    className="bento-card hover-lift"
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 14,
                      opacity: isCompleted ? 0.65 : 1,
                      borderLeft: isOverdue 
                        ? '4px solid #ef4444' 
                        : (isToday ? '4px solid #f59e0b' : undefined),
                      transition: 'all 0.18s ease'
                    }}
                  >
                    {/* Left: Checkbox + Title + Description + Badges */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flex: 1 }}>
                      {/* Interactive Animated Checkbox */}
                      <button
                        type="button"
                        onClick={() => handleToggle(todo)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          margin: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isCompleted ? '#10b981' : (isDark ? '#64748b' : '#94a3b8'),
                          marginTop: 2,
                          transition: 'transform 0.15s ease'
                        }}
                      >
                        {isCompleted ? (
                          <CheckSquare size={20} color="#10b981" />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: isCompleted ? (isDark ? '#94a3b8' : '#94a3b8') : (isDark ? '#f8fafc' : '#0f172a'),
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            lineHeight: 1.3
                          }}>
                            {todo.title}
                          </span>

                          {/* Priority Tag */}
                          {todo.priority === 'high' && (
                            <Tag color="error" style={{ borderRadius: 6, fontWeight: 700, margin: 0, fontSize: 11 }}>
                              🔥 {translate('todoPriorityHigh', currentLang)}
                            </Tag>
                          )}
                          {todo.priority === 'medium' && (
                            <Tag color="warning" style={{ borderRadius: 6, fontWeight: 600, margin: 0, fontSize: 11 }}>
                              ⚡ {translate('todoPriorityMedium', currentLang)}
                            </Tag>
                          )}
                          {todo.priority === 'low' && (
                            <Tag color="default" style={{ borderRadius: 6, fontWeight: 500, margin: 0, fontSize: 11 }}>
                              🌱 {translate('todoPriorityLow', currentLang)}
                            </Tag>
                          )}
                        </div>

                        {/* Description */}
                        {todo.description && (
                          <p style={{
                            margin: '6px 0 0 0',
                            fontSize: 13,
                            color: isDark ? '#94a3b8' : '#64748b',
                            lineHeight: 1.4,
                            whiteSpace: 'pre-wrap'
                          }}>
                            {todo.description}
                          </p>
                        )}

                        {/* Metadata tags: Due date, Reminder, Tags */}
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {/* Due date badge */}
                          {todo.dueDate && (
                            <span style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: isOverdue 
                                ? (isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2')
                                : (isToday 
                                    ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#fef3c7')
                                    : (isDark ? 'rgba(255, 255, 255, 0.05)' : '#f1f5f9')),
                              color: isOverdue ? '#ef4444' : (isToday ? '#d97706' : (isDark ? '#94a3b8' : '#64748b')),
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              <Calendar size={12} />
                              {formatRelativeDueDate(todo.dueDate, currentLang)}
                            </span>
                          )}

                          {/* Reminder badge */}
                          {todo.reminderAt && (
                            <span style={{
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: isDark ? 'rgba(139, 92, 246, 0.15)' : '#f3e8ff',
                              color: '#8b5cf6',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}>
                              <Bell size={12} />
                              {formatRelativeDueDate(todo.reminderAt, currentLang)}
                            </span>
                          )}

                          {/* Tags */}
                          {(todo.tags || []).map((tag, tIdx) => (
                            <span
                              key={tIdx}
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                padding: '1px 6px',
                                borderRadius: 6,
                                background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                                color: isDark ? '#64748b' : '#94a3b8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3
                              }}
                            >
                              <TagIcon size={10} /> {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Start Pomodoro for task */}
                      {!isCompleted && (
                        <Tooltip title={translate('todoStartPomodoro', currentLang)}>
                          <Button
                            type="text"
                            size="small"
                            icon={<Timer size={15} color="#0284c7" />}
                            onClick={() => navigate('/pomodoro', { state: { taskTitle: todo.title } })}
                            style={{
                              borderRadius: 8,
                              height: 32,
                              width: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: isDark ? 'rgba(2, 132, 199, 0.15)' : 'rgba(2, 132, 199, 0.08)'
                            }}
                          />
                        </Tooltip>
                      )}

                      {/* Edit */}
                      <Tooltip title={currentLang === 'vi' ? 'Chỉnh sửa' : 'Edit'}>
                        <Button
                          type="text"
                          size="small"
                          icon={<Edit3 size={15} color={isDark ? '#94a3b8' : '#64748b'} />}
                          onClick={() => openModal(todo)}
                          style={{
                            borderRadius: 8,
                            height: 32,
                            width: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        />
                      </Tooltip>

                      {/* Delete */}
                      <Popconfirm
                        title={translate('todoDeleteConfirm', currentLang)}
                        onConfirm={() => handleDelete(todo.id)}
                        okText={currentLang === 'vi' ? 'Xóa' : 'Delete'}
                        cancelText={currentLang === 'vi' ? 'Hủy' : 'Cancel'}
                        okButtonProps={{ danger: true, style: { borderRadius: 6 } }}
                        cancelButtonProps={{ style: { borderRadius: 6 } }}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<Trash2 size={15} color="#ef4444" />}
                          style={{
                            borderRadius: 8,
                            height: 32,
                            width: 32,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        />
                      </Popconfirm>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 📝 Modal: Add or Edit Task (Shared across both views) */}
      <Modal
        title={editingTodo ? (currentLang === 'vi' ? 'Chỉnh sửa nhiệm vụ' : 'Edit Task') : (currentLang === 'vi' ? 'Thêm nhiệm vụ mới' : 'Add New Task')}
        open={isModalOpen}
        onOk={handleSaveModal}
        onCancel={() => setIsModalOpen(false)}
        confirmLoading={modalLoading}
        okText={currentLang === 'vi' ? 'Lưu nhiệm vụ' : 'Save Task'}
        cancelText={currentLang === 'vi' ? 'Hủy' : 'Cancel'}
        okButtonProps={{ style: { borderRadius: 8, background: '#0284c7' } }}
        cancelButtonProps={{ style: { borderRadius: 8 } }}
        width={540}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          {/* Quick Presets row inside modal for convenience */}
          {!editingTodo && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b', marginBottom: 6 }}>
                <Sparkles size={12} color="#0284c7" /> {translate('todoStudyPresets', currentLang)}:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STUDY_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleApplyPresetToModal(preset)}
                    style={{
                      background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(2, 132, 199, 0.08)',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(2, 132, 199, 0.2)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: isDark ? '#e2e8f0' : '#0369a1',
                      cursor: 'pointer'
                    }}
                  >
                    + {currentLang === 'vi' ? preset.titleVi : preset.titleEn}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {translate('todoTitleLabel', currentLang)} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <Input 
              value={modalTitle}
              onChange={(e) => setModalTitle(e.target.value)}
              placeholder={translate('todoTitlePlaceholder', currentLang)}
              style={{ borderRadius: 8, height: 38 }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {translate('todoDescLabel', currentLang)}
            </label>
            <Input.TextArea 
              value={modalDesc}
              onChange={(e) => setModalDesc(e.target.value)}
              placeholder={translate('todoDescPlaceholder', currentLang)}
              rows={3}
              style={{ borderRadius: 8 }}
            />
          </div>

          {/* Priority & Due Date Row */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {translate('todoPriorityLabel', currentLang)}
              </label>
              <Select
                value={modalPriority}
                onChange={setModalPriority}
                style={{ width: '100%', height: 38 }}
                options={[
                  { value: 'high', label: `🔥 ${translate('todoPriorityHigh', currentLang)}` },
                  { value: 'medium', label: `⚡ ${translate('todoPriorityMedium', currentLang)}` },
                  { value: 'low', label: `🌱 ${translate('todoPriorityLow', currentLang)}` },
                ]}
              />
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                {translate('todoDueDateLabel', currentLang)}
              </label>
              <Input 
                type="date"
                value={modalDueDate.slice(0, 10)}
                onChange={(e) => setModalDueDate(e.target.value)}
                style={{ height: 38, borderRadius: 8 }}
              />
            </div>
          </div>

          {/* Reminder Date Time */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Bell size={13} color="#8b5cf6" /> {translate('todoReminderLabel', currentLang)}
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setQuickReminderTime(1)}
                  style={{
                    fontSize: 11,
                    background: 'none',
                    border: '1px solid #c4b5fd',
                    borderRadius: 6,
                    padding: '1px 6px',
                    color: '#8b5cf6',
                    cursor: 'pointer'
                  }}
                >
                  +1h
                </button>
                <button
                  type="button"
                  onClick={() => setQuickReminderTime(3)}
                  style={{
                    fontSize: 11,
                    background: 'none',
                    border: '1px solid #c4b5fd',
                    borderRadius: 6,
                    padding: '1px 6px',
                    color: '#8b5cf6',
                    cursor: 'pointer'
                  }}
                >
                  +3h
                </button>
              </div>
            </div>
            <Input 
              type="datetime-local"
              value={modalReminderAt}
              onChange={(e) => setModalReminderAt(e.target.value)}
              style={{ height: 38, borderRadius: 8 }}
            />
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
              {translate('todoTagsLabel', currentLang)}
            </label>
            <Input 
              value={modalTagsStr}
              onChange={(e) => setModalTagsStr(e.target.value)}
              placeholder="General, Work, Notes, Ideas..."
              style={{ borderRadius: 8, height: 38 }}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
