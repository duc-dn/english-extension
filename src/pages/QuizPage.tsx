import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Typography, Button, notification, Progress, Space, Switch, Select, Tag } from 'antd';
import { db, type Word, incrementWrongCount } from '../lib/db';
import { CheckCircle, XCircle, RefreshCw, Volume2, Award, Flame, Timer, Filter, BookOpen, Layers } from 'lucide-react';
import { playAudio } from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';

const { Title, Text } = Typography;

interface QuizState {
  word: Word;
  options: string[];
  answered: boolean;
  selectedOption: string | null;
}

export const QuizPage: React.FC = () => {
  const navigate = useNavigate();
  const [roundWords, setRoundWords] = useState<Word[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [missedInSession, setMissedInSession] = useState<Word[]>([]);
  const [isRoundOver, setIsRoundOver] = useState(false);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [loading, setLoading] = useState(true);

  // New states for gamification & shortcuts
  const [timeLeft, setTimeLeft] = useState(15);
  const [timerActive, setTimerActive] = useState(true);
  const [comboStreak, setComboStreak] = useState(0);
  const [shake, setShake] = useState(false);

  // Tag filter states
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [isStarted, setIsStarted] = useState(false);
  const [tagWordCount, setTagWordCount] = useState(0);

  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const hasTimedOutRef = useRef(false);

  // Fetch all tags
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const words = await db.words.toArray();
        const tags = new Set<string>();
        words.forEach(w => w.tags.forEach(t => tags.add(t)));
        setAllTags(Array.from(tags).sort());
      } catch (err) {
        console.error(currentLang === 'vi' ? "Lỗi khi tải tags:" : "Error loading tags:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTags();
  }, [currentLang]);

  // Update available word count for the selected tag
  useEffect(() => {
    const updateCount = async () => {
      let allWords = await db.words.toArray();
      if (selectedTag && selectedTag !== 'all') {
        allWords = allWords.filter(w => w.tags.includes(selectedTag));
      }
      setTagWordCount(allWords.length);
    };
    updateCount();
  }, [selectedTag]);

  const generateQuizForWord = (correctWord: Word, allWords: Word[]) => {
    // Pick 3 random wrong meanings
    const wrongOptions: string[] = [];
    const candidates = [...allWords].sort(() => Math.random() - 0.5);
    
    for (const cand of candidates) {
      if (cand.id !== correctWord.id && cand.meaning !== correctWord.meaning) {
        if (!wrongOptions.includes(cand.meaning)) {
          wrongOptions.push(cand.meaning);
        }
      }
      if (wrongOptions.length === 3) break;
    }

    // Shuffle options
    const options = [correctWord.meaning, ...wrongOptions].sort(() => Math.random() - 0.5);

    setQuiz({
      word: correctWord,
      options,
      answered: false,
      selectedOption: null
    });
    setTimeLeft(15);
  };

  const startNewRound = async (customPool?: Word[]) => {
    setLoading(true);
    let allWords = await db.words.toArray();

    // Filter by selected tag if not 'all'
    if (selectedTag && selectedTag !== 'all' && (!customPool || customPool.length === 0)) {
      allWords = allWords.filter(w => w.tags.includes(selectedTag));
    }
    
    if (allWords.length < 4) {
      setQuiz(null);
      setLoading(false);
      return;
    }

    let pool: Word[] = [];
    if (customPool && customPool.length > 0) {
      pool = [...customPool].sort(() => Math.random() - 0.5);
    } else {
      pool = [...allWords].sort(() => Math.random() - 0.5).slice(0, Math.min(10, allWords.length));
    }

    setRoundWords(pool);
    setQuestionIndex(0);
    setCorrectCount(0);
    setMissedInSession([]);
    setIsRoundOver(false);
    setComboStreak(0);
    hasTimedOutRef.current = false;
    
    // We pass the full DB to draw wrong options from so we always have enough choices
    const fullDbWords = await db.words.toArray();
    generateQuizForWord(pool[0], fullDbWords);
    setLoading(false);
  };

  const handleTimeOut = () => {
    if (hasTimedOutRef.current) return;
    hasTimedOutRef.current = true;

    if (!quiz || quiz.answered) return;

    incrementWrongCount(quiz.word.id);
    setMissedInSession(prev => [...prev, quiz.word]);
    setComboStreak(0);
    setShake(true);
    setTimeout(() => setShake(false), 400);

    notification.warning({
      message: translate('timeOutMessage', currentLang),
      description: translate('timeOutDesc', currentLang),
      placement: 'topRight',
      duration: 1.5
    });

    setQuiz({
      ...quiz,
      answered: true,
      selectedOption: '' // empty indicates no selection (timeout)
    });
  };

  // Timer countdown hook
  useEffect(() => {
    if (!quiz || quiz.answered || !timerActive || isRoundOver) return;

    setTimeLeft(15);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleTimeOut();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [quiz?.word.id, quiz?.answered, timerActive, isRoundOver]);

  const handleAnswer = (option: string) => {
    if (!quiz || quiz.answered) return;

    const isCorrect = option === quiz.word.meaning;
    
    if (isCorrect) {
      const msgs = currentLang === 'vi' 
        ? ['Tuyệt vời! 🎉', 'Chuẩn không cần chỉnh! 🎯', 'Quá xuất sắc! 🌟', 'Bạn đã trả lời đúng! 🚀']
        : ['Awesome! 🎉', 'Spot on! 🎯', 'Excellent! 🌟', 'Correct answer! 🚀'];
      notification.success({
        message: translate('correctAlert', currentLang),
        description: msgs[Math.floor(Math.random() * msgs.length)],
        placement: 'topRight',
        duration: 1.5
      });
      setCorrectCount(prev => prev + 1);
      setComboStreak(prev => prev + 1);
    } else {
      incrementWrongCount(quiz.word.id);
      const msgs = currentLang === 'vi'
        ? ['Gần đúng rồi! 💪', 'Hãy thử lại nhé! 🔄', 'Đừng nản lòng! ❤️', 'Sai sót giúp ta nhớ lâu hơn! 🧠']
        : ['Almost got it! 💪', 'Try again! 🔄', 'Keep trying! ❤️', 'Mistakes help you learn! 🧠'];
      notification.warning({
        message: translate('wrongAlert', currentLang),
        description: msgs[Math.floor(Math.random() * msgs.length)],
        placement: 'topRight',
        duration: 1.5
      });
      setMissedInSession(prev => [...prev, quiz.word]);
      setComboStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }

    setQuiz({ ...quiz, answered: true, selectedOption: option });
  };

  const handleNext = async () => {
    const nextIndex = questionIndex + 1;
    if (nextIndex < roundWords.length) {
      setQuestionIndex(nextIndex);
      hasTimedOutRef.current = false;
      const allWords = await db.words.toArray();
      generateQuizForWord(roundWords[nextIndex], allWords);
    } else {
      setIsRoundOver(true);
    }
  };

  // Keyboard shortcut listener for Quiz
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (isRoundOver || !quiz) return;

      if (!quiz.answered) {
        if (e.key === '1') handleAnswer(quiz.options[0]);
        else if (e.key === '2') handleAnswer(quiz.options[1]);
        else if (e.key === '3') handleAnswer(quiz.options[2]);
        else if (e.key === '4') handleAnswer(quiz.options[3]);
      } else {
        if (e.key === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleNext();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [quiz, isRoundOver]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Text>{translate('loadingData', currentLang)}</Text>
      </div>
    );
  }

  if (!isStarted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', animation: 'fadeIn 0.5s' }}>
        <Card 
          className="premium-flashcard" 
          style={{ width: 480, padding: '40px 24px', textAlign: 'center' }} 
          bordered={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Glowing Icon */}
            <div style={{ 
              width: 80, 
              height: 80, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: 'inset 0 0 12px rgba(99, 102, 241, 0.05)'
            }}>
              <Layers size={36} color="#8b5cf6" />
            </div>

            <div>
              <Title level={3} style={{ fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0', fontFamily: 'Inter' }}>
                {translate('quizIntroTitle', currentLang)}
              </Title>
              <Text style={{ display: 'block', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                {translate('quizIntroDesc', currentLang)}
              </Text>
            </div>

            <div style={{ width: '100%', background: 'rgba(0,0,0,0.02)', padding: '16px 20px', borderRadius: 16, border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>{translate('reviewSelectorLabel', currentLang)}</span>
                <Select 
                  value={selectedTag} 
                  onChange={setSelectedTag} 
                  style={{ width: 180 }} 
                  options={[
                    { value: 'all', label: translate('reviewSelectorAll', currentLang) },
                    ...allTags.map(t => ({ value: t, label: `#${t}` }))
                  ]} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>{translate('quizOptionTimer', currentLang)}</span>
                <Switch checked={timerActive} onChange={setTimerActive} size="small" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>{translate('quizOptionWordsAvailable', currentLang)}</span>
                <Tag color={tagWordCount >= 4 ? "success" : "error"} style={{ fontSize: 13, borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>
                  {tagWordCount} {currentLang === 'vi' ? 'từ' : 'words'}
                </Tag>
              </div>
            </div>

            {tagWordCount < 4 && (
              <div className="quiz-warning-alert">
                <span className="quiz-warning-text">
                  ⚠️ {translate('noWordsForQuiz', currentLang)}
                </span>
              </div>
            )}

            <Button 
              type="primary" 
              size="large" 
              disabled={tagWordCount < 4}
              onClick={async () => {
                await startNewRound();
                setIsStarted(true);
              }}
              style={tagWordCount >= 4 ? { 
                width: '100%',
                borderRadius: 20, 
                fontWeight: 600, 
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', 
                border: 'none', 
                height: 48,
                boxShadow: '0 8px 20px rgba(99, 102, 241, 0.2)',
                color: '#ffffff'
              } : {
                width: '100%',
                borderRadius: 20, 
                fontWeight: 600, 
                height: 48
              }}
            >
              {translate('btnStartQuiz', currentLang)}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const renderContent = () => {
    if (!quiz) {
      return (
        <Card 
          className="premium-flashcard" 
          style={{ width: 600, textAlign: 'center', padding: '40px 24px' }} 
          bordered={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Beautiful glowing icon container */}
            <div style={{ 
              width: 88, 
              height: 88, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: 'inset 0 0 12px rgba(99, 102, 241, 0.05)'
            }}>
              <BookOpen size={36} color="#8b5cf6" />
            </div>

            <div>
              <Title level={3} style={{ fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0', fontFamily: 'Inter' }}>
                {currentLang === 'vi' ? 'Chưa đủ từ vựng' : 'Not enough words'}
              </Title>
              <Text style={{ display: 'block', fontSize: 14, color: '#64748b', maxWidth: 400, margin: '0 auto', lineHeight: 1.6 }}>
                {selectedTag === 'all' 
                  ? translate('noWordsForQuizDb', currentLang)
                  : translate('noWordsForQuizTag', currentLang, { tag: selectedTag })}
              </Text>
            </div>

            <Button 
              type="primary" 
              size="large" 
              onClick={() => navigate('/vocabulary')}
              style={{ 
                borderRadius: 24, 
                fontWeight: 600, 
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', 
                border: 'none', 
                height: 44, 
                padding: '0 32px',
                boxShadow: '0 8px 20px rgba(99, 102, 241, 0.2)'
              }}
            >
              {translate('btnAddNewWord', currentLang)} 🚀
            </Button>
          </div>
        </Card>
      );
    }

    if (isRoundOver) {
      const accuracy = Math.round((correctCount / roundWords.length) * 100) || 0;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', animation: 'fadeIn 0.5s' }}>
          <div style={{ padding: 20, background: '#f5f3ff', borderRadius: '50%', marginBottom: 16 }}>
            <Award size={48} color="#8b5cf6" />
          </div>
          <Title level={2} style={{ fontWeight: 700, margin: 0, fontFamily: 'Inter' }}>
            {translate('quizResultTitle', currentLang)}
          </Title>
          <Text style={{ fontSize: 15, color: '#64748b', marginTop: 8, marginBottom: 24 }}>
            {translate('quizResultDesc', currentLang)}
          </Text>

          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Progress 
              type="circle" 
              percent={accuracy} 
              strokeColor={{
                '0%': '#10b981',
                '100%': '#3b82f6',
              }}
              width={120}
            />
            <Text strong style={{ fontSize: 18, marginTop: 16, color: '#1e293b' }}>
              {translate('quizScore', currentLang, { score: correctCount, total: roundWords.length })}
            </Text>
          </div>

          {missedInSession.length > 0 ? (
            <Card 
              title={<span style={{ color: '#ef4444', fontWeight: 600 }}>{translate('wrongWordsToReview', currentLang)}</span>} 
              bordered={false} 
              className="glass-card"
              style={{ width: '100%', maxWidth: 500, marginBottom: 24 }}
            >
              <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {missedInSession.map(word => (
                  <div key={word.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
                    <div>
                      <Text strong style={{ color: '#1e293b' }}>{word.word}</Text>
                      {word.phonetic && <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>{word.phonetic}</Text>}
                    </div>
                    <Text style={{ color: '#10b981', fontWeight: 500, maxWidth: '60%', textAlign: 'right', fontSize: 13 }}>{word.meaning}</Text>
                  </div>
                ))}
              </div>
            </Card>
          ) : (
            <div style={{ margin: '16px 0 24px 0', textAlign: 'center' }}>
              <Text strong style={{ color: '#10b981', fontSize: 16 }}>
                {translate('allCorrectMessage', currentLang)}
              </Text>
            </div>
          )}

          <Space size="middle">
            {missedInSession.length > 0 && (
              <Button 
                icon={<RefreshCw size={14} />} 
                size="large" 
                onClick={() => startNewRound(missedInSession)}
                style={{ borderRadius: 24, fontWeight: 600, borderColor: '#ef4444', color: '#ef4444', height: 44 }}
              >
                {translate('btnRetryWrong', currentLang, { count: missedInSession.length })}
              </Button>
            )}
            <Button 
              size="large" 
              onClick={() => setIsStarted(false)} 
              style={{ borderRadius: 24, fontWeight: 600, height: 44, padding: '0 24px' }}
            >
              {translate('btnSelectOtherTopic', currentLang)}
            </Button>
            <Button 
              type="primary" 
              size="large" 
              onClick={() => startNewRound()}
              style={{ borderRadius: 24, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none', height: 44, padding: '0 24px' }}
            >
              {translate('btnRetryTopic', currentLang)}
            </Button>
          </Space>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', animation: 'fadeIn 0.5s' }}>
        {/* Quiz Progress */}
        <div style={{ width: '100%', maxWidth: 600, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700, letterSpacing: '0.5px' }}>
              {translate('quizQuestion', currentLang, { current: questionIndex + 1, total: roundWords.length })}
            </span>
            <span style={{ color: '#10b981', fontSize: 12, fontWeight: 800 }}>
              {currentLang === 'vi' ? 'ĐÚNG' : 'CORRECT'}: {correctCount}
            </span>
          </div>
          <Progress 
            percent={Math.round((questionIndex / roundWords.length) * 100)} 
            strokeColor="linear-gradient(90deg, #6366f1 0%, #a855f7 100%)"
            showInfo={false}
            style={{ margin: 0 }}
          />
        </div>

        <Card 
          className={`premium-flashcard ${shake ? 'shake-animation' : ''}`} 
          style={{ width: 600, textAlign: 'center', padding: '32px 0', position: 'relative' }} 
          bordered={false}
        >
          {/* Timer Badge positioned absolutely at top right */}
          {timerActive && quiz && !quiz.answered && (
            <div 
              className={timeLeft <= 5 ? 'timer-pulse-critical' : ''}
              style={{ 
                position: 'absolute', 
                top: 20, 
                right: 20, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 6, 
                padding: '6px 14px', 
                borderRadius: 20, 
                border: '1px solid rgba(0,0,0,0.06)', 
                background: 'rgba(248, 250, 252, 0.8)',
                backdropFilter: 'blur(4px)',
                transition: 'all 0.3s ease'
              }}
            >
              <Timer size={14} color={timeLeft <= 5 ? '#ef4444' : '#64748b'} />
              <span style={{ fontSize: 13, fontWeight: 800, color: timeLeft <= 5 ? '#ef4444' : '#475569' }}>
                {timeLeft}s
              </span>
            </div>
          )}

          <Text type="secondary" style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
            {translate('questionMatchWord', currentLang)}
          </Text>
          
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, margin: '20px 0 8px 0' }}>
            <Title level={1} style={{ fontSize: '3.0rem', margin: 0, color: '#1e293b', fontWeight: 600, letterSpacing: '-0.5px', fontFamily: 'Inter' }}>
              {quiz.word.word}
            </Title>
            <Button 
              type="text" 
              shape="circle" 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, background: 'rgba(99, 102, 241, 0.08)' }}
              icon={<Volume2 size={20} color="#6366f1" />} 
              onClick={() => playAudio(quiz.word.word)} 
            />
          </div>
          
          {quiz.word.phonetic && (
            <Text style={{ fontSize: '1.2rem', color: '#64748b', display: 'block', marginBottom: 12, fontStyle: 'italic' }}>
              {quiz.word.phonetic}
            </Text>
          )}
          
          {quiz.word.tags && quiz.word.tags.length > 0 && (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
              {quiz.word.tags.map(tag => (
                <span key={tag} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 12, background: 'rgba(99, 102, 241, 0.06)', color: '#6366f1', border: '1px solid rgba(99, 102, 241, 0.1)', fontWeight: 500 }}>
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 32px' }}>
            {quiz.options.map((option, idx) => {
              let statusClass = '';
              let rightIcon = null;

              if (quiz.answered) {
                if (option === quiz.word.meaning) {
                  statusClass = 'correct';
                  rightIcon = <CheckCircle size={18} color="#22c55e" />;
                } else if (option === quiz.selectedOption) {
                  statusClass = 'incorrect';
                  rightIcon = <XCircle size={18} color="#ef4444" />;
                }
              }

              return (
                <button
                  key={idx}
                  className={`quiz-option-btn ${statusClass}`}
                  onClick={() => handleAnswer(option)}
                  disabled={quiz.answered}
                >
                  <span className="quiz-option-badge">{idx + 1}</span>
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{option}</span>
                  {rightIcon}
                </button>
              );
            })}
          </div>

          {/* Keyboard shortcut hint */}
          {!quiz.answered ? (
            <div style={{ marginTop: 20 }}>
              <Text type="secondary" style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                {translate('shortcutQuizSelectHint', currentLang)}
              </Text>
            </div>
          ) : (
            <div style={{ marginTop: 20 }}>
              <Text type="secondary" style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                {translate('shortcutQuizNextHint', currentLang)}
              </Text>
            </div>
          )}

          {quiz.answered && (
            <div style={{ marginTop: 24, animation: 'fadeIn 0.3s' }}>
              <Button 
                type="primary" 
                size="large" 
                onClick={handleNext} 
                style={{ borderRadius: 24, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', border: 'none', width: 200, height: 44 }}
              >
                {questionIndex + 1 === roundWords.length ? translate('btnFinishQuiz', currentLang) : translate('btnNextQuestion', currentLang)}
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div style={{ width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', animation: 'fadeIn 0.5s' }}>
      {/* Control Bar - Tag Badge & Timer Switch */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%', 
        maxWidth: 600, 
        marginBottom: 20, 
        padding: '0 4px',
        zIndex: 10
      }}>
        {/* Left Side: Timer Mode Switch or state title */}
        {quiz && !isRoundOver ? (
          <Space align="center" size="small">
            <Timer size={15} color="#64748b" />
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{translate('timerLabel', currentLang)}</span>
            <Switch checked={timerActive} onChange={setTimerActive} size="small" />
          </Space>
        ) : (
          <span style={{ fontSize: 16, fontWeight: 700, color: '#475569', fontFamily: 'Inter' }}>
            {!quiz ? translate('quizTitle', currentLang) : translate('quizResultTitle', currentLang).replace('! 🏁', '')}
          </span>
        )}

        {/* Center: Combo Streak */}
        {quiz && !isRoundOver && comboStreak >= 3 && (
          <div className="flame-pop" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff7ed', padding: '4px 12px', borderRadius: 16, border: '1px solid #fed7aa' }}>
            <Flame size={16} color="#f97316" fill="#f97316" />
            <span style={{ fontWeight: 700, color: '#ea580c', fontSize: 13 }}>{comboStreak}x Combo</span>
          </div>
        )}

        {/* Right Side: Active Tag Badge */}
        <Space align="center" size="small">
          <Filter size={15} color="#64748b" />
          <Tag color="purple" style={{ margin: 0, borderRadius: 12, fontWeight: 600 }}>
            {selectedTag === 'all' ? translate('quizTagPlaceholder', currentLang) : `#${selectedTag}`}
          </Tag>
        </Space>
      </div>

      {renderContent()}
    </div>
  );
};
