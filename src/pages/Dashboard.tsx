import React, { useEffect, useState } from 'react';
import { Row, Col, Typography, Tooltip, Table, Tag, Progress, Button, Spin, message, Input } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  BookOpen, 
  Calendar, 
  CheckCircle, 
  AlertCircle, 
  Award, 
  Sparkles, 
  RefreshCw, 
  Timer, 
  Flame, 
  ArrowRight, 
  Volume2, 
  Layers, 
  CheckSquare, 
  Square,
  CheckCircle2,
  Plus,
  PlusCircle,
  TrendingUp,
  BrainCircuit,
  BookmarkPlus,
  Check,
  Trophy,
  Compass,
  Star
} from 'lucide-react';
import { ActivityCalendar } from 'react-activity-calendar';
import { db, getWordsToReview, getFrequentlyMissedWords, getMasteryStats, addWord, type Word, type DailyWord } from '../lib/db';
import { getOrGenerateDailyWord } from '../lib/dailyWord';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { getAIDailyInsight, type AIDailyInsight } from '../lib/translator';
import { getTodayPomodoroStats } from '../lib/pomodoro';
import { playAudio, playTaskCompleteChime } from '../lib/audio';
import { addTodo, toggleTodoStatus, isDateToday, isDateOverdue, getTodayDateString } from '../lib/todo';

const { Title } = Typography;

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}



export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [totalWords, setTotalWords] = useState(0);
  const [wordsToReview, setWordsToReview] = useState(0);
  const [activityData, setActivityData] = useState<{ date: string; count: number; level: number }[]>([]);
  const [streak, setStreak] = useState(0);
  const [todayReviews, setTodayReviews] = useState(0);
  const [missedWords, setMissedWords] = useState<Word[]>([]);
  const [masteryStats, setMasteryStats] = useState({ new: 0, learning: 0, reviewing: 0, mastered: 0, total: 0 });
  const [pomodoroStats, setPomodoroStats] = useState(() => getTodayPomodoroStats());
  const [isWotdSaved, setIsWotdSaved] = useState(false);
  const [dailyWord, setDailyWord] = useState<DailyWord | null>(null);
  const [isDailyWordLoading, setIsDailyWordLoading] = useState(false);
  const [isFromAI, setIsFromAI] = useState(false);

  // AI Daily Study Insights state
  const [aiInsight, setAiInsight] = useState<AIDailyInsight | null>(null);
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);

  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  const dailyGoal = Math.max(1, Math.min(100, settings.daily_review_goal ?? 10));

  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Live query for todos in Dashboard
  const allTodos = useLiveQuery(() => db.todos.reverse().sortBy('createdAt')) || [];
  const todayDateStr = getTodayDateString();
  const todayTodos = allTodos.filter(t => isDateToday(t.dueDate) || (t.status === 'pending' && isDateOverdue(t.dueDate)));
  const todayCompletedCount = todayTodos.filter(t => t.status === 'completed').length;
  const overdueCount = allTodos.filter(t => t.status === 'pending' && isDateOverdue(t.dueDate)).length;
  const [dashboardQuickTask, setDashboardQuickTask] = useState('');
  const [quickTaskLoading, setQuickTaskLoading] = useState(false);

  const handleDashboardQuickAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!dashboardQuickTask.trim()) return;
    setQuickTaskLoading(true);
    try {
      await addTodo({
        title: dashboardQuickTask,
        dueDate: todayDateStr,
        priority: 'medium',
        tags: ['General'],
      });
      setDashboardQuickTask('');
      message.success(translate('todoAddSuccess', currentLang));
    } catch {
      message.error('Lỗi khi thêm nhiệm vụ');
    } finally {
      setQuickTaskLoading(false);
    }
  };

  const handleDashboardToggle = async (id: string) => {
    try {
      const updated = await toggleTodoStatus(id);
      if (updated?.status === 'completed') {
        playTaskCompleteChime();
        message.success(translate('todoCompletedSuccess', currentLang));
      }
    } catch {
      message.error('Lỗi khi cập nhật trạng thái');
    }
  };

  // Daily Word of the Day loader from AI / IndexedDB cache
  const loadDailyWord = async (forceRefresh = false) => {
    setIsDailyWordLoading(true);
    try {
      const res = await getOrGenerateDailyWord(forceRefresh);
      setDailyWord(res.word);
      setIsFromAI(res.isFromAI);

      const existing = await db.words.filter(w => w.word.toLowerCase() === res.word.word.toLowerCase()).first();
      setIsWotdSaved(!!existing);

      if (forceRefresh) {
        message.success(currentLang === 'vi' ? 'Đã đổi từ vựng mới thành công!' : 'Generated a new daily word!');
      }
    } catch (e) {
      console.warn('Failed to load daily word:', e);
    } finally {
      setIsDailyWordLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setPomodoroStats(getTodayPomodoroStats());
      const total = await db.words.count();
      setTotalWords(total);

      const toReview = await getWordsToReview();
      setWordsToReview(toReview.length);

      const stats = await getMasteryStats();
      setMasteryStats(stats);

      // Generate activity data
      const words = await db.words.toArray();
      const reviews = await db.review_history.toArray();
      setTodayReviews(reviews.filter(review => localDateKey(review.reviewed_at) === localDateKey(new Date())).length);

      const counts: Record<string, number> = {};

      words.forEach(w => {
        const dateStr = localDateKey(w.created_at);
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      });

      reviews.forEach(r => {
        const dateStr = localDateKey(r.reviewed_at);
        counts[dateStr] = (counts[dateStr] || 0) + 1;
      });

      // Calculate Current Streak
      let currentStreak = 0;
      const checkDate = new Date();
      let dStr = localDateKey(checkDate);
      
      if (counts[dStr] > 0) currentStreak++;
      
      checkDate.setDate(checkDate.getDate() - 1);
      dStr = localDateKey(checkDate);
      
      if (counts[dStr] > 0 || currentStreak > 0) {
        while (true) {
          if (counts[dStr] > 0) {
            currentStreak++;
            checkDate.setDate(checkDate.getDate() - 1);
            dStr = localDateKey(checkDate);
          } else {
            break;
          }
        }
      }
      setStreak(currentStreak);

      const missed = await getFrequentlyMissedWords(5);
      setMissedWords(missed);

      // Create last 365 days of data
      const data = [];
      const today = new Date();
      for (let i = 365; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = localDateKey(d);
        const count = counts[dateStr] || 0;
        
        let level = 0;
        if (count > 0 && count <= 2) level = 1;
        else if (count > 2 && count <= 5) level = 2;
        else if (count > 5 && count <= 10) level = 3;
        else if (count > 10) level = 4;

        data.push({
          date: dateStr,
          count: count,
          level: level
        });
      }
      setActivityData(data);
    };
    
    fetchData();
    loadDailyWord(false);
  }, []);

  const loadAIInsight = async () => {
    setIsLoadingInsight(true);
    try {
      const missedNames = missedWords.map(w => w.word);
      const insight = await getAIDailyInsight({
        totalWords,
        missedWords: missedNames,
        masteredWordsCount: masteryStats.mastered
      });
      setAiInsight(insight);
    } catch {
      // ignore
    } finally {
      setIsLoadingInsight(false);
    }
  };

  const handleSaveWordOfTheDay = async () => {
    if (!dailyWord) return;
    try {
      await addWord({
        word: dailyWord.word,
        meaning: dailyWord.vietnamese,
        phonetic: dailyWord.phonetic,
        example: dailyWord.example,
        tags: ['word-of-the-day', 'daily-vocab'],
        description: dailyWord.definition
      });
      message.success(currentLang === 'vi' ? `Đã lưu "${dailyWord.word}" vào kho từ vựng!` : `Added "${dailyWord.word}" to your vocabulary!`);
      setIsWotdSaved(true);
      setTotalWords(prev => prev + 1);
    } catch {
      message.info(currentLang === 'vi' ? 'Từ này đã có trong kho từ của bạn.' : 'Word is already in your vocabulary.');
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return currentLang === 'vi' ? 'Chào buổi sáng' : 'Good morning';
    if (hour < 18) return currentLang === 'vi' ? 'Chào buổi chiều' : 'Good afternoon';
    return currentLang === 'vi' ? 'Chào buổi tối' : 'Good evening';
  };

  const getUserRank = () => {
    if (streak >= 14 || totalWords >= 200) {
      return { 
        title: currentLang === 'vi' ? 'Học giả Tinh hoa' : 'Elite Scholar', 
        tier: 'Master', 
        badgeBg: isDark ? 'rgba(168, 85, 247, 0.2)' : 'rgba(147, 51, 234, 0.1)', 
        color: '#a855f7', 
        icon: <Trophy size={13} color="#a855f7" /> 
      };
    }
    if (streak >= 7 || totalWords >= 80) {
      return { 
        title: currentLang === 'vi' ? 'Chiến binh Bền bỉ' : 'Steady Warrior', 
        tier: 'Gold', 
        badgeBg: isDark ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.12)', 
        color: '#eab308', 
        icon: <Star size={13} color="#eab308" /> 
      };
    }
    if (streak >= 3 || totalWords >= 20) {
      return { 
        title: currentLang === 'vi' ? 'Học viên Chuyên cần' : 'Active Learner', 
        tier: 'Silver', 
        badgeBg: isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)', 
        color: '#10b981', 
        icon: <Flame size={13} color="#10b981" /> 
      };
    }
    return { 
      title: currentLang === 'vi' ? 'Nhà Thám hiểm' : 'Language Explorer', 
      tier: 'Bronze', 
      badgeBg: isDark ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.12)', 
      color: '#3b82f6', 
      icon: <Compass size={13} color="#3b82f6" /> 
    };
  };

  const userRank = getUserRank();
  const goalPercent = Math.min(100, Math.round((todayReviews / dailyGoal) * 100));

  return (
    <div style={{ animation: 'fadeIn 0.35s ease', display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 36 }}>
      
      {/* 🚀 Dynamic Hero Banner (Gamified Command Center) */}
      <div 
        className="bento-card"
        style={{
          padding: '28px 32px',
          background: isDark
            ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, rgba(248, 250, 252, 0.95) 100%)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(226, 232, 240, 0.8)',
          boxShadow: isDark ? '0 12px 36px rgba(0, 0, 0, 0.45)' : '0 6px 24px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ 
                fontSize: 12, 
                fontWeight: 700, 
                color: '#4f46e5', 
                background: isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(79, 70, 229, 0.08)',
                padding: '3px 10px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <BrainCircuit size={13} /> {getGreeting()}
              </span>

              {/* User Rank Badge */}
              <span style={{ 
                fontSize: 12, 
                fontWeight: 700, 
                color: userRank.color, 
                background: userRank.badgeBg,
                padding: '3px 10px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                border: `1px solid ${userRank.color}33`
              }}>
                {userRank.icon} {userRank.title}
              </span>

              {/* Streak Badge */}
              <span style={{ 
                fontSize: 12, 
                fontWeight: 700, 
                color: '#f97316', 
                background: isDark ? 'rgba(249, 115, 22, 0.18)' : 'rgba(249, 115, 22, 0.1)',
                padding: '3px 10px',
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5
              }}>
                <Flame size={13} color="#f97316" /> {streak} {translate('days', currentLang)} streak
              </span>
            </div>

            <h1 style={{ 
              fontSize: 28, 
              fontWeight: 800, 
              margin: '6px 0 0 0', 
              color: isDark ? '#f8fafc' : '#0f172a', 
              letterSpacing: '-0.5px' 
            }}>
              {wordsToReview > 0 
                ? (currentLang === 'vi' ? `Bạn có ${wordsToReview} từ cần ôn tập hôm nay` : `You have ${wordsToReview} words due for review today`)
                : (currentLang === 'vi' ? 'Sẵn sàng chinh phục mục tiêu tiếng Anh?' : 'Ready to conquer your English goals today?')}
            </h1>
            <p style={{ margin: 0, color: isDark ? '#94a3b8' : '#64748b', fontSize: 14 }}>
              {currentLang === 'vi' 
                ? 'Duy trì thói quen 10 phút mỗi ngày để mở rộng vốn từ vựng và tự tin giao tiếp.' 
                : 'Maintain a 10-minute daily habit to expand your vocabulary and speak with confidence.'}
            </p>
          </div>

          {/* Quick Action Navigation Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button
              type="primary"
              icon={<Layers size={14} />}
              onClick={() => navigate('/flashcards')}
              style={{
                height: 34,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                border: 'none',
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                padding: '0 14px'
              }}
            >
              {currentLang === 'vi' ? 'Ôn Flashcards' : 'Review Cards'}
            </Button>

            <Button
              onClick={() => navigate('/quizzes')}
              icon={<CheckSquare size={14} color="#10b981" />}
              style={{
                height: 34,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
                color: isDark ? '#f8fafc' : '#0f172a',
                padding: '0 14px'
              }}
            >
              {currentLang === 'vi' ? 'Làm Quiz' : 'Start Quiz'}
            </Button>

            <Button
              onClick={() => navigate('/pomodoro')}
              icon={<Timer size={14} color="#f43f5e" />}
              style={{
                height: 34,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
                color: isDark ? '#f8fafc' : '#0f172a',
                padding: '0 14px'
              }}
            >
              Pomodoro
            </Button>

            <Button
              onClick={() => navigate('/vocabulary')}
              icon={<PlusCircle size={14} color="#8b5cf6" />}
              style={{
                height: 34,
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ffffff',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#cbd5e1',
                color: isDark ? '#f8fafc' : '#0f172a',
                padding: '0 14px'
              }}
            >
              {currentLang === 'vi' ? 'Kho từ vựng' : 'Vocabulary'}
            </Button>
          </div>
        </div>
      </div>

      {/* 🌟 Featured Section: Word of the Day + AI Coach */}
      <Row gutter={[20, 20]}>
        
        {/* Left Column: Word of the Day Spotlight Card */}
        <Col xs={24} lg={14}>
          <div 
            className="bento-card hover-lift"
            style={{
              padding: '24px 26px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              background: isDark 
                ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.9) 100%)' 
                : 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 250, 252, 0.95) 100%)',
              border: isDark ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.2)',
              boxShadow: isDark ? '0 8px 24px rgba(0, 0, 0, 0.3)' : '0 4px 18px rgba(139, 92, 246, 0.06)',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ 
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', 
                  color: '#ffffff', 
                  padding: '4px 10px', 
                  borderRadius: 8, 
                  fontSize: 11, 
                  fontWeight: 800,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  letterSpacing: '0.3px',
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)'
                }}>
                  <Star size={12} fill="#ffffff" /> {currentLang === 'vi' ? 'TỪ VỰNG TINH HOA HÔM NAY' : 'WORD OF THE DAY'}
                </span>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {isFromAI && (
                    <Tag color="cyan" style={{ borderRadius: 10, fontWeight: 700, margin: 0, fontSize: 11 }}>
                      ⚡ AI Generated
                    </Tag>
                  )}
                  {dailyWord && (
                    <Tag color="purple" style={{ borderRadius: 10, fontWeight: 700, margin: 0 }}>
                      {dailyWord.level}
                    </Tag>
                  )}
                </div>
              </div>

              {isDailyWordLoading && !dailyWord ? (
                <div style={{ padding: '36px 0', textAlign: 'center' }}>
                  <Spin tip={currentLang === 'vi' ? 'Đang chuẩn bị từ vựng thông minh...' : 'Loading daily word...'} />
                </div>
              ) : dailyWord ? (
                <>
                  {/* Word & Phonetic */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <h2 
                      className="font-lexical"
                      style={{ 
                        fontSize: 32, 
                        fontWeight: 800, 
                        margin: 0, 
                        color: isDark ? '#f8fafc' : '#0f172a',
                        letterSpacing: '-0.3px'
                      }}
                    >
                      {dailyWord.word}
                    </h2>
                    <span style={{ fontSize: 15, color: '#8b5cf6', fontFamily: 'monospace', fontWeight: 600 }}>
                      {dailyWord.phonetic}
                    </span>
                    <span style={{ fontSize: 13, fontStyle: 'italic', color: isDark ? '#94a3b8' : '#64748b' }}>
                      ({dailyWord.partOfSpeech})
                    </span>
                    <Button
                      type="text"
                      size="small"
                      icon={<Volume2 size={16} color="#8b5cf6" />}
                      onClick={() => playAudio(dailyWord.word)}
                      style={{
                        background: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.08)',
                        borderRadius: 8,
                        height: 28,
                        width: 28,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Nghe phát âm"
                    />
                  </div>

                  {/* Vietnamese Meaning & Definition */}
                  <div style={{ fontSize: 16, fontWeight: 700, color: isDark ? '#a5b4fc' : '#4338ca', marginBottom: 6 }}>
                    {dailyWord.vietnamese}
                  </div>
                  <p style={{ fontSize: 13.5, color: isDark ? '#94a3b8' : '#475569', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    {dailyWord.definition}
                  </p>

                  {/* Example Quote */}
                  <div 
                    className="font-lexical"
                    style={{ 
                      fontSize: 14, 
                      fontStyle: 'italic', 
                      color: isDark ? '#e2e8f0' : '#1e293b', 
                      padding: '10px 14px', 
                      background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(139, 92, 246, 0.04)', 
                      borderRadius: 10,
                      borderLeft: '3px solid #8b5cf6',
                      lineHeight: 1.5
                    }}
                  >
                    "{dailyWord.example}"
                  </div>
                </>
              ) : null}
            </div>

            {/* Action Bar */}
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button
                type="text"
                size="small"
                icon={<Sparkles size={14} color="#8b5cf6" />}
                loading={isDailyWordLoading}
                onClick={() => loadDailyWord(true)}
                style={{
                  borderRadius: 8,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: isDark ? '#c4b5fd' : '#7c3aed',
                  background: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.08)',
                }}
              >
                {currentLang === 'vi' ? 'Đổi từ khác (AI)' : 'Regenerate (AI)'}
              </Button>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {isWotdSaved ? (
                  <Button 
                    icon={<Check size={14} color="#16a34a" />} 
                    disabled
                    style={{ borderRadius: 8, height: 32, padding: '0 12px', fontSize: 13, fontWeight: 600, color: '#16a34a', borderColor: '#86efac' }}
                  >
                    {currentLang === 'vi' ? 'Đã lưu trong kho từ ✓' : 'Saved in Vocabulary ✓'}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<BookmarkPlus size={14} />}
                    onClick={handleSaveWordOfTheDay}
                    disabled={isDailyWordLoading || !dailyWord}
                    style={{
                      borderRadius: 8,
                      height: 32,
                      padding: '0 12px',
                      fontSize: 13,
                      fontWeight: 600,
                      background: '#8b5cf6',
                      border: 'none',
                      boxShadow: '0 2px 6px rgba(139, 92, 246, 0.25)'
                    }}
                  >
                    {currentLang === 'vi' ? '+ Lưu từ này vào kho' : '+ Add to Vocabulary'}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Col>

        {/* Right Column: AI Daily Study Insights Card */}
        <Col xs={24} lg={10}>
          <div 
            className="bento-card hover-lift"
            style={{
              padding: '24px 26px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              background: isDark
                ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.12) 0%, rgba(139, 92, 246, 0.08) 100%)'
                : 'linear-gradient(135deg, rgba(79, 70, 229, 0.04) 0%, rgba(139, 92, 246, 0.02) 100%)',
              border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid rgba(79, 70, 229, 0.15)',
              boxShadow: isDark ? '0 8px 24px rgba(0, 0, 0, 0.3)' : '0 4px 16px rgba(79, 70, 229, 0.04)'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ 
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', 
                  color: '#ffffff', 
                  padding: '4px 10px', 
                  borderRadius: 8, 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: 6, 
                  fontSize: 11, 
                  fontWeight: 700,
                  boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)'
                }}>
                  <Sparkles size={12} color="#ffffff" /> AI Study Coach
                </span>

                <Button
                  type="text"
                  size="small"
                  icon={<RefreshCw size={13} className={isLoadingInsight ? 'animate-spin' : ''} />}
                  loading={isLoadingInsight}
                  onClick={loadAIInsight}
                  style={{ 
                    borderRadius: 8, 
                    fontSize: 12, 
                    color: isDark ? '#a5b4fc' : '#4f46e5', 
                    fontWeight: 600,
                    padding: '4px 10px',
                    height: 28,
                    background: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(79, 70, 229, 0.06)'
                  }}
                >
                  {translate('aiCoachRefresh', currentLang)}
                </Button>
              </div>

              <div style={{ fontWeight: 800, fontSize: 16, color: isDark ? '#f8fafc' : '#1e293b', marginBottom: 8 }}>
                {translate('aiCoachTitle', currentLang)}
              </div>

              {isLoadingInsight ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <Spin size="small" />
                  <div style={{ marginTop: 10, fontSize: 13, color: '#4f46e5', fontWeight: 500 }}>
                    {translate('aiCoachLoading', currentLang)}
                  </div>
                </div>
              ) : aiInsight ? (
                <div>
                  <div style={{ fontWeight: 600, color: isDark ? '#e2e8f0' : '#334155', fontSize: 13.5, marginBottom: 6 }}>
                    {aiInsight.greeting}
                  </div>
                  <p style={{ margin: '0 0 12px 0', fontSize: 13, color: isDark ? '#cbd5e1' : '#475569', lineHeight: 1.6 }}>
                    💡 <b>Mẹo:</b> {aiInsight.tip}
                  </p>
                  
                  <div style={{ 
                    fontSize: 12, 
                    color: isDark ? '#c7d2fe' : '#4338ca', 
                    background: isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)', 
                    padding: '6px 12px', 
                    borderRadius: 8, 
                    fontWeight: 700,
                    marginBottom: 10,
                    border: isDark ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(79, 70, 229, 0.15)'
                  }}>
                    🎯 Trọng tâm: {aiInsight.recommendedFocus}
                  </div>

                  {aiInsight.example && (
                    <div 
                      className="font-lexical"
                      style={{ 
                        fontSize: 13, 
                        color: isDark ? '#94a3b8' : '#475569', 
                        fontStyle: 'italic',
                        background: isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.6)',
                        padding: '6px 12px',
                        borderRadius: 8,
                        borderLeft: '3px solid #8b5cf6'
                      }}
                    >
                      "{aiInsight.example}"
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '16px 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>
                  <p style={{ margin: '0 0 12px 0', lineHeight: 1.5 }}>
                    {currentLang === 'vi' 
                      ? 'Huấn luyện viên AI sẽ phân tích các từ bạn hay quên và đưa ra lời khuyên cá nhân hóa mỗi ngày.' 
                      : 'AI Coach analyzes your learning patterns and provides personalized tips daily.'}
                  </p>
                  <Button
                    type="primary"
                    size="small"
                    icon={<Sparkles size={13} />}
                    onClick={loadAIInsight}
                    style={{ borderRadius: 8, fontWeight: 600, background: '#4f46e5' }}
                  >
                    {currentLang === 'vi' ? 'Nhận lời khuyên hôm nay' : 'Get Daily Advice'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Col>
      </Row>

      {/* 📊 4 Bento Metric Cards (Dual-tone & High Contrast) */}
      <Row gutter={[16, 16]}>
        
        {/* Metric 1: Total Vocabulary */}
        <Col xs={24} sm={12} lg={6}>
          <div 
            className="bento-card bento-card-interactive hover-lift"
            onClick={() => navigate('/vocabulary')}
            style={{ 
              padding: '22px', 
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid rgba(79, 70, 229, 0.18)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                {translate('totalVocab', currentLang)}
              </span>
              <div style={{ 
                width: 38, 
                height: 38, 
                borderRadius: 10, 
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
              }}>
                <BookOpen size={18} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {totalWords}
              </div>
              <div style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={13} color="#10b981" />
                <span>{currentLang === 'vi' ? 'từ vựng đã lưu' : 'saved vocabulary'}</span>
              </div>
            </div>
          </div>
        </Col>

        {/* Metric 2: SRS Due Today */}
        <Col xs={24} sm={12} lg={6}>
          <div 
            className="bento-card bento-card-interactive hover-lift"
            onClick={() => navigate('/flashcards')}
            style={{ 
              padding: '22px', 
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: wordsToReview > 0 
                ? (isDark ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(245, 158, 11, 0.35)')
                : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0'),
              boxShadow: wordsToReview > 0 
                ? (isDark ? '0 8px 24px rgba(245, 158, 11, 0.15)' : '0 4px 16px rgba(245, 158, 11, 0.1)')
                : undefined
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                {translate('dueToday', currentLang)}
              </span>
              <div style={{ 
                width: 38, 
                height: 38, 
                borderRadius: 10, 
                background: wordsToReview > 0 ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)' : (isDark ? '#334155' : '#e2e8f0'), 
                color: wordsToReview > 0 ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'), 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: wordsToReview > 0 ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none'
              }}>
                <Calendar size={18} />
              </div>
            </div>
            <div>
              <div style={{ 
                fontSize: 36, 
                fontWeight: 800, 
                color: wordsToReview > 0 ? '#f59e0b' : (isDark ? '#f8fafc' : '#0f172a'), 
                letterSpacing: '-0.5px', 
                lineHeight: 1.1 
              }}>
                {wordsToReview}
              </div>
              <div style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', marginTop: 4 }}>
                {wordsToReview > 0 
                  ? (currentLang === 'vi' ? '⚡ Cần ôn tập ngay hôm nay' : '⚡ Due for SRS review')
                  : (currentLang === 'vi' ? 'Đã hoàn thành hôm nay ✓' : 'All caught up today ✓')}
              </div>
            </div>
          </div>
        </Col>

        {/* Metric 3: Active Streak */}
        <Col xs={24} sm={12} lg={6}>
          <div 
            className="bento-card bento-card-interactive hover-lift"
            style={{ 
              padding: '22px', 
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: isDark ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(16, 185, 129, 0.18)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                {translate('streak', currentLang)}
              </span>
              <div style={{ 
                width: 38, 
                height: 38, 
                borderRadius: 10, 
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}>
                <Flame size={18} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {streak} <span style={{ fontSize: 16, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>{translate('days', currentLang)}</span>
              </div>
              <div style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', marginTop: 4 }}>
                {currentLang === 'vi' ? 'chuỗi ngày học liên tục' : 'consecutive active days'}
              </div>
            </div>
          </div>
        </Col>

        {/* Metric 4: Pomodoro Focus Time */}
        <Col xs={24} sm={12} lg={6}>
          <div 
            className="bento-card bento-card-interactive hover-lift"
            onClick={() => navigate('/pomodoro')}
            style={{ 
              padding: '22px', 
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              border: isDark ? '1px solid rgba(2, 132, 199, 0.25)' : '1px solid rgba(2, 132, 199, 0.18)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                {translate('pomodoroStatsCardTitle', currentLang)}
              </span>
              <div style={{ 
                width: 38, 
                height: 38, 
                borderRadius: 10, 
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', 
                color: '#ffffff', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)'
              }}>
                <Timer size={18} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 36, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {pomodoroStats.completedSessions} <span style={{ fontSize: 16, fontWeight: 600, color: isDark ? '#94a3b8' : '#64748b' }}>{currentLang === 'vi' ? 'phiên' : 'sessions'}</span>
              </div>
              <div style={{ fontSize: 12, color: isDark ? '#64748b' : '#94a3b8', marginTop: 4 }}>
                {pomodoroStats.totalMinutes} {currentLang === 'vi' ? 'phút tập trung sâu hôm nay' : 'focused minutes today'}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      {/* 🎯 Row: Daily Review Goal & Today's Tasks Planner */}
      <Row gutter={[16, 16]}>
        {/* Left: Review Goal Progress */}
        <Col xs={24} lg={12}>
          <div 
            className="bento-card" 
            style={{ padding: '24px 28px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ 
                    width: 34, 
                    height: 34, 
                    borderRadius: 8, 
                    background: 'rgba(79, 70, 229, 0.1)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: '#4f46e5' 
                  }}>
                    <Award size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', display: 'block' }}>
                      {currentLang === 'vi' ? 'Mục tiêu ôn tập hàng ngày' : "Daily Review Goal"}
                    </span>
                    <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                      {todayReviews >= dailyGoal
                        ? (currentLang === 'vi' ? '🎉 Hoàn thành xuất sắc mục tiêu hôm nay!' : '🎉 Daily goal completed!')
                        : (currentLang === 'vi' ? `Còn ${dailyGoal - todayReviews} lượt ôn để đạt chỉ tiêu` : `${dailyGoal - todayReviews} reviews left to reach daily goal`)}
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: goalPercent >= 100 ? '#10b981' : '#4f46e5' }}>
                    {todayReviews} <span style={{ fontSize: 14, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>/ {dailyGoal}</span>
                  </span>
                  <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', display: 'block' }}>
                    ({goalPercent}%)
                  </span>
                </div>
              </div>

              <Progress 
                percent={goalPercent} 
                strokeColor={{
                  '0%': '#4f46e5',
                  '100%': '#10b981',
                }}
                strokeWidth={12}
                style={{ margin: '18px 0 14px 0' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                💡 Mỗi lượt flashcard hay quiz đều tích lũy vào tiến độ.
              </span>

              <div style={{ display: 'flex', gap: 6 }}>
                {[25, 50, 75, 100].map(milestone => (
                  <span
                    key={milestone}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: goalPercent >= milestone 
                        ? (isDark ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.12)')
                        : (isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)'),
                      color: goalPercent >= milestone ? '#10b981' : (isDark ? '#64748b' : '#94a3b8'),
                      border: goalPercent >= milestone ? '1px solid rgba(16, 185, 129, 0.3)' : 'none'
                    }}
                  >
                    {milestone}% {milestone === 100 ? '💎' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Col>

        {/* Right: Today's Tasks & Study Plan */}
        <Col xs={24} lg={12}>
          <div 
            className="bento-card" 
            style={{ 
              padding: '22px 24px', 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'space-between',
              border: overdueCount > 0 
                ? (isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(239, 68, 68, 0.25)') 
                : undefined
            }}
          >
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ 
                    width: 34, 
                    height: 34, 
                    borderRadius: 8, 
                    background: 'rgba(2, 132, 199, 0.12)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: '#0284c7' 
                  }}>
                    <CheckSquare size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', display: 'block' }}>
                      {translate('todoTodayTasksWidget', currentLang)}
                    </span>
                    <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                      {todayTodos.length > 0
                        ? (todayCompletedCount === todayTodos.length 
                            ? translate('todoAllDoneToday', currentLang)
                            : translate('todoTasksLeftToday', currentLang, { count: todayTodos.length - todayCompletedCount }))
                        : (currentLang === 'vi' ? 'Chưa có task nào cho hôm nay' : 'No tasks scheduled for today')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {overdueCount > 0 && (
                    <Tag color="error" style={{ borderRadius: 6, fontWeight: 700, margin: 0, fontSize: 11 }}>
                      {overdueCount} {translate('todoFilterOverdue', currentLang).toLowerCase()}
                    </Tag>
                  )}
                  <Button
                    type="link"
                    size="small"
                    onClick={() => navigate('/todos')}
                    style={{ fontWeight: 600, color: '#0284c7', padding: '0 4px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 2 }}
                  >
                    {translate('todoViewAll', currentLang)} <ArrowRight size={12} />
                  </Button>
                </div>
              </div>

              {/* Progress bar */}
              {todayTodos.length > 0 && (
                <Progress 
                  percent={Math.round((todayCompletedCount / todayTodos.length) * 100)} 
                  strokeColor="#10b981" 
                  size="small" 
                  style={{ marginBottom: 14 }}
                />
              )}

              {/* List of Tasks (up to 4 items) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto', marginBottom: 12 }}>
                {todayTodos.length === 0 ? (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: isDark ? '#64748b' : '#94a3b8', fontSize: 12 }}>
                    {currentLang === 'vi' ? '🎉 Bạn không có công việc tồn đọng hôm nay!' : '🎉 No pending tasks for today!'}
                  </div>
                ) : (
                  todayTodos.slice(0, 4).map(task => {
                    const isDone = task.status === 'completed';
                    const isTaskOverdue = !isDone && isDateOverdue(task.dueDate);
                    return (
                      <div
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: isDone 
                            ? (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)') 
                            : (isTaskOverdue ? (isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2') : (isDark ? 'rgba(255, 255, 255, 0.04)' : '#f8fafc')),
                          border: isTaskOverdue ? '1px solid rgba(239, 68, 68, 0.25)' : (isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #f1f5f9'),
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleDashboardToggle(task.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: isDone ? '#10b981' : (isDark ? '#64748b' : '#94a3b8') }}
                          >
                            {isDone ? <CheckCircle2 size={17} color="#10b981" /> : <Square size={17} />}
                          </button>
                          <span style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: isDone ? (isDark ? '#64748b' : '#94a3b8') : (isDark ? '#f8fafc' : '#1e293b'),
                            textDecoration: isDone ? 'line-through' : 'none',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {task.title}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          {task.priority === 'high' && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
                              🔥
                            </span>
                          )}
                          {isTaskOverdue && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444' }}>
                              {translate('todoFilterOverdue', currentLang)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Quick add input at bottom of card */}
            <form onSubmit={handleDashboardQuickAdd} style={{ marginTop: 8 }}>
              <Input
                value={dashboardQuickTask}
                onChange={(e) => setDashboardQuickTask(e.target.value)}
                placeholder={currentLang === 'vi' ? 'Thêm nhanh việc hôm nay...' : 'Quick add task for today...'}
                prefix={<Plus size={14} color="#0284c7" />}
                size="small"
                disabled={quickTaskLoading}
                style={{ borderRadius: 8, height: 32 }}
              />
            </form>
          </div>
        </Col>
      </Row>

      {/* 📈 Mastery Status Bento Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <Title level={4} style={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b', margin: 0, fontSize: 18 }}>
            {translate('masteryByLevel', currentLang)}
          </Title>
          <div style={{ minWidth: 260, flex: '1 1 auto', maxWidth: 400, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {translate('masteryRate', currentLang)}:
            </span>
            <Progress 
              percent={Math.round((masteryStats.mastered / (masteryStats.total || 1)) * 100)} 
              strokeColor="#10b981"
              status="active"
              style={{ margin: 0 }}
            />
          </div>
        </div>

        <Row gutter={[16, 16]}>
          <Col xs={12} sm={6}>
            <div 
              className="bento-card bento-card-interactive hover-lift" 
              onClick={() => navigate('/vocabulary')}
              style={{ padding: 18 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 10, background: isDark ? 'rgba(59, 130, 246, 0.18)' : '#eff6ff', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                  <BookOpen size={20} color="#3b82f6" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                    {translate('newWords', currentLang)}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b' }}>{masteryStats.new}</div>
                </div>
              </div>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div 
              className="bento-card bento-card-interactive hover-lift" 
              onClick={() => navigate('/vocabulary')}
              style={{ padding: 18 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 10, background: isDark ? 'rgba(217, 119, 6, 0.18)' : 'rgba(217, 119, 6, 0.1)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                  <Award size={20} color="#d97706" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                    {translate('learning', currentLang)}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b' }}>{masteryStats.learning}</div>
                </div>
              </div>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div 
              className="bento-card bento-card-interactive hover-lift" 
              onClick={() => navigate('/vocabulary')}
              style={{ padding: 18 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 10, background: isDark ? 'rgba(79, 70, 229, 0.18)' : 'rgba(79, 70, 229, 0.1)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                  <Calendar size={20} color="#6366f1" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                    {translate('reviewing', currentLang)}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b' }}>{masteryStats.reviewing}</div>
                </div>
              </div>
            </div>
          </Col>

          <Col xs={12} sm={6}>
            <div 
              className="bento-card bento-card-interactive hover-lift" 
              onClick={() => navigate('/vocabulary')}
              style={{ padding: 18 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: 10, background: isDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.1)', borderRadius: 10, display: 'flex', alignItems: 'center' }}>
                  <CheckCircle size={20} color="#10b981" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                    {translate('mastered', currentLang)}
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981' }}>{masteryStats.mastered}</div>
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </div>
      
      {/* 📅 Learning Heatmap Calendar */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Title level={4} style={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b', margin: 0, fontSize: 18 }}>
            {translate('learningHistory', currentLang)}
          </Title>
          <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 500 }}>
            {activityData.reduce((acc, curr) => acc + curr.count, 0)} {currentLang === 'vi' ? 'hoạt động trong năm' : 'activities this year'}
          </span>
        </div>

        <div className="bento-card hover-lift" style={{ padding: '24px 20px', overflowX: 'auto' }}>
          <div style={{ minWidth: 800, display: 'flex', justifyContent: 'center' }}>
            {activityData.length > 0 && (
              <ActivityCalendar 
                data={activityData} 
                theme={{
                  light: ['#f1f5f9', '#c7d2fe', '#818cf8', '#4f46e5', '#312e81'],
                  dark: ['#1e293b', '#3730a3', '#4f46e5', '#818cf8', '#c7d2fe'],
                }}
                labels={{
                  totalCount: currentLang === 'vi' ? '{{count}} hoạt động trong năm qua' : '{{count}} activities in the past year',
                }}
                renderBlock={(block, activity) => (
                  <Tooltip title={currentLang === 'vi' 
                    ? `${activity.count} hoạt động vào ngày ${activity.date}` 
                    : `${activity.count} activities on ${activity.date}`}>
                    {block}
                  </Tooltip>
                )}
              />
            )}
          </div>
        </div>
      </div>

      {/* ⚠️ Frequently Missed Words Challenge */}
      {missedWords.length > 0 && (
        <div>
          <Title level={4} style={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 18 }}>
            <AlertCircle color="#f43f5e" size={20} /> {translate('frequentlyMissed', currentLang)}
          </Title>
          <div className="bento-card hover-lift" style={{ padding: 0, overflow: 'hidden' }}>
            <Table 
              dataSource={missedWords} 
              pagination={false} 
              rowKey="id"
              columns={[
                { 
                  title: translate('word', currentLang), 
                  dataIndex: 'word', 
                  key: 'word', 
                  render: (t) => (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong 
                        className="font-lexical"
                        style={{ fontSize: 16, color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 700 }}
                      >
                        {t}
                      </strong>
                      <Button
                        type="text"
                        size="small"
                        icon={<Volume2 size={14} color="#6366f1" />}
                        onClick={(e) => {
                          e.stopPropagation();
                          playAudio(t);
                        }}
                        style={{ padding: '0 4px', height: 24 }}
                      />
                    </div>
                  )
                },
                { 
                  title: translate('meaning', currentLang), 
                  dataIndex: 'meaning', 
                  key: 'meaning',
                  render: (m) => <span style={{ color: isDark ? '#cbd5e1' : '#334155' }}>{m}</span>
                },
                { 
                  title: translate('missedTimes', currentLang), 
                  dataIndex: 'wrong_count', 
                  key: 'wrong_count', 
                  render: (c) => (
                    <Tag 
                      color="error" 
                      style={{ 
                        margin: 0, 
                        borderRadius: 12,
                        fontWeight: 700,
                        padding: '2px 10px'
                      }}
                    >
                      {c} {translate('times', currentLang)}
                    </Tag>
                  ) 
                },
                {
                  title: '',
                  key: 'action',
                  width: 100,
                  render: () => (
                    <Button
                      type="link"
                      size="small"
                      onClick={() => navigate('/flashcards')}
                      style={{ fontWeight: 600, color: '#4f46e5', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {currentLang === 'vi' ? 'Luyện' : 'Practice'} <ArrowRight size={13} />
                    </Button>
                  )
                }
              ]}
            />
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
