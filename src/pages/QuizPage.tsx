import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Card, Typography, Button, notification, Progress, Space, Switch, Select, Tag, Segmented, Input } from 'antd';
import { db, type Word, incrementWrongCount } from '../lib/db';
import { 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  Volume2, 
  Award, 
  Flame, 
  Timer, 
  Filter, 
  PenTool, 
  FileQuestion, 
  Sparkles
} from 'lucide-react';
import { playAudio } from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { evaluateWritingSentence, type WritingEvaluation } from '../lib/translator';

const { Title, Text } = Typography;

export type QuizMode = 'multiple_choice' | 'fill_in_blank' | 'ai_writing';

interface QuizState {
  word: Word;
  options: string[];
  answered: boolean;
  selectedOption: string | null;
  // For Fill in the blank
  maskedSentence?: string;
  typedAnswer?: string;
  isCorrect?: boolean;
  // For AI writing
  aiWritingInput?: string;
  aiEvaluation?: WritingEvaluation | null;
}

function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function createMaskedSentence(word: string, sentence?: string): string {
  if (!sentence) return `[ _______ ] : (Hãy gõ từ tương ứng)`;
  const regex = new RegExp(`\\b${word}\\b`, 'gi');
  if (regex.test(sentence)) {
    return sentence.replace(regex, '_______');
  }
  return `"${sentence}" -> [ _______ ]`;
}

export const QuizPage: React.FC = () => {
  const [roundWords, setRoundWords] = useState<Word[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [missedInSession, setMissedInSession] = useState<Word[]>([]);
  const [isRoundOver, setIsRoundOver] = useState(false);
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [loading, setLoading] = useState(true);

  // Quiz mode: multiple_choice | fill_in_blank | ai_writing
  const [quizMode, setQuizMode] = useState<QuizMode>('multiple_choice');
  const [typedInput, setTypedInput] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Gamification & timer
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
        words.forEach(w => (w.tags || []).forEach(t => tags.add(t)));
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
        allWords = allWords.filter(w => (w.tags || []).includes(selectedTag));
      }
      setTagWordCount(allWords.length);
    };
    updateCount();
  }, [selectedTag]);

  const generateQuizForWord = useCallback((correctWord: Word, allWords: Word[]) => {
    // Pick 3 random wrong meanings
    const wrongOptions: string[] = [];
    const candidates = shuffle(allWords);
    
    for (const cand of candidates) {
      if (cand.id !== correctWord.id && cand.meaning !== correctWord.meaning) {
        if (!wrongOptions.includes(cand.meaning)) {
          wrongOptions.push(cand.meaning);
        }
      }
      if (wrongOptions.length === 3) break;
    }

    // Shuffle options
    const options = shuffle([correctWord.meaning, ...wrongOptions]);
    const masked = createMaskedSentence(correctWord.word, correctWord.contextSentence || correctWord.example);

    setQuiz({
      word: correctWord,
      options,
      answered: false,
      selectedOption: null,
      maskedSentence: masked,
      typedAnswer: '',
      aiWritingInput: '',
      aiEvaluation: null
    });
    setTypedInput('');
    setTimeLeft(15);
  }, []);

  const startNewRound = async (customPool?: Word[]) => {
    setLoading(true);
    let allWords = await db.words.toArray();

    if (selectedTag && selectedTag !== 'all' && (!customPool || customPool.length === 0)) {
      allWords = allWords.filter(w => (w.tags || []).includes(selectedTag));
    }
    
    const minRequired = quizMode === 'multiple_choice' ? 4 : 1;
    if (allWords.length < minRequired) {
      setQuiz(null);
      setLoading(false);
      return;
    }

    const pool = customPool && customPool.length > 0
      ? shuffle(customPool)
      : shuffle(allWords).slice(0, Math.min(10, allWords.length));

    setRoundWords(pool);
    setQuestionIndex(0);
    setCorrectCount(0);
    setMissedInSession([]);
    setIsRoundOver(false);
    setComboStreak(0);
    hasTimedOutRef.current = false;
    
    const fullDbWords = await db.words.toArray();
    generateQuizForWord(pool[0], fullDbWords);
    setLoading(false);
  };

  const handleTimeOut = useCallback(() => {
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
      selectedOption: ''
    });
  }, [quiz, currentLang]);

  // Timer countdown hook (only for multiple choice)
  useEffect(() => {
    if (!quiz || quiz.answered || !timerActive || isRoundOver || quizMode !== 'multiple_choice') return;

    let remaining = 15;
    const interval = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        handleTimeOut();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [quiz, timerActive, isRoundOver, quizMode, handleTimeOut]);

  // Handle multiple choice answer
  const handleAnswer = useCallback((option: string) => {
    if (!quiz || quiz.answered || hasTimedOutRef.current) return;
    hasTimedOutRef.current = true;

    const isCorrect = option === quiz.word.meaning;
    
    if (isCorrect) {
      notification.success({
        message: translate('correctAlert', currentLang),
        description: currentLang === 'vi' ? 'Tuyệt vời! 🎉' : 'Awesome! 🎉',
        placement: 'topRight',
        duration: 1.5
      });
      setCorrectCount(prev => prev + 1);
      setComboStreak(prev => prev + 1);
    } else {
      incrementWrongCount(quiz.word.id);
      notification.warning({
        message: translate('wrongAlert', currentLang),
        description: currentLang === 'vi' ? 'Gần đúng rồi! 💪' : 'Keep trying! 💪',
        placement: 'topRight',
        duration: 1.5
      });
      setMissedInSession(prev => [...prev, quiz.word]);
      setComboStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }

    setQuiz({ ...quiz, answered: true, selectedOption: option });
  }, [quiz, currentLang]);

  // Handle Fill-in-the-blank submit
  const handleFillBlankSubmit = () => {
    if (!quiz || quiz.answered) return;
    const cleanTyped = typedInput.trim().toLowerCase();
    const cleanTarget = quiz.word.word.trim().toLowerCase();

    const isCorrect = cleanTyped === cleanTarget;

    if (isCorrect) {
      notification.success({
        message: currentLang === 'vi' ? 'Chính xác 100%! 🎯' : '100% Correct! 🎯',
        description: currentLang === 'vi' ? 'Bạn đã điền đúng chính tả từ vựng!' : 'You spelled the word correctly!',
        placement: 'topRight',
        duration: 1.5
      });
      setCorrectCount(prev => prev + 1);
      setComboStreak(prev => prev + 1);
    } else {
      incrementWrongCount(quiz.word.id);
      notification.warning({
        message: currentLang === 'vi' ? 'Chưa đúng chính tả!' : 'Incorrect spelling!',
        description: `${currentLang === 'vi' ? 'Đáp án đúng là:' : 'Correct answer is:'} "${quiz.word.word}"`,
        placement: 'topRight',
        duration: 2.0
      });
      setMissedInSession(prev => [...prev, quiz.word]);
      setComboStreak(0);
      setShake(true);
      setTimeout(() => setShake(false), 400);
    }

    setQuiz({
      ...quiz,
      answered: true,
      typedAnswer: typedInput,
      isCorrect
    });
  };

  // Handle AI Writing submit
  const handleAIWritingSubmit = async () => {
    if (!quiz || !typedInput.trim()) return;
    setIsEvaluating(true);
    try {
      const evalResult = await evaluateWritingSentence(quiz.word.word, typedInput.trim());
      setQuiz({
        ...quiz,
        answered: true,
        aiWritingInput: typedInput.trim(),
        aiEvaluation: evalResult
      });
      if (evalResult.score >= 70) {
        setCorrectCount(prev => prev + 1);
        setComboStreak(prev => prev + 1);
      } else {
        setMissedInSession(prev => [...prev, quiz.word]);
      }
    } catch {
      notification.error({
        message: currentLang === 'vi' ? 'Lỗi chấm điểm AI' : 'AI Evaluation Error'
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNext = useCallback(async () => {
    const nextIndex = questionIndex + 1;
    if (nextIndex < roundWords.length) {
      setQuestionIndex(nextIndex);
      hasTimedOutRef.current = false;
      const allWords = await db.words.toArray();
      generateQuizForWord(roundWords[nextIndex], allWords);
    } else {
      setIsRoundOver(true);
    }
  }, [questionIndex, roundWords, generateQuizForWord]);

  // Keyboard shortcut listener for Quiz
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Enter' && !e.shiftKey) {
          if (quizMode === 'fill_in_blank' && quiz && !quiz.answered) {
            e.preventDefault();
            handleFillBlankSubmit();
          }
        }
        return;
      }

      if (isRoundOver || !quiz) return;

      if (!quiz.answered && quizMode === 'multiple_choice') {
        if (e.key === '1') handleAnswer(quiz.options[0]);
        else if (e.key === '2') handleAnswer(quiz.options[1]);
        else if (e.key === '3') handleAnswer(quiz.options[2]);
        else if (e.key === '4') handleAnswer(quiz.options[3]);
      } else if (quiz.answered) {
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
  }, [quiz, isRoundOver, quizMode, typedInput, handleAnswer, handleNext]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Text>{translate('loadingData', currentLang)}</Text>
      </div>
    );
  }

  if (!isStarted) {
    const minWordsNeeded = quizMode === 'multiple_choice' ? 4 : 1;
    const hasEnoughWords = tagWordCount >= minWordsNeeded;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', animation: 'fadeIn 0.5s', padding: '16px' }}>
        <Card 
          className="premium-flashcard" 
          style={{ width: 540, padding: '32px 24px', textAlign: 'center' }} 
          bordered={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            {/* Glowing Icon */}
            <div style={{ 
              width: 72, 
              height: 72, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.15) 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              <Award size={36} color="#8b5cf6" />
            </div>

            <div>
              <Title level={3} style={{ fontWeight: 800, color: '#1e293b', margin: '0 0 6px 0', fontFamily: 'Inter' }}>
                {translate('quizIntroTitle', currentLang)}
              </Title>
              <Text style={{ display: 'block', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                {translate('quizIntroDesc', currentLang)}
              </Text>
            </div>

            {/* Mode Selection */}
            <div style={{ width: '100%', textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 8 }}>
                🎯 {currentLang === 'vi' ? 'Chọn chế độ ôn luyện:' : 'Select Practice Mode:'}
              </div>
              <Segmented
                block
                value={quizMode}
                onChange={(val) => setQuizMode(val as QuizMode)}
                options={[
                  { label: currentLang === 'vi' ? 'Trắc nghiệm' : 'Multiple Choice', value: 'multiple_choice', icon: <FileQuestion size={14} /> },
                  { label: currentLang === 'vi' ? 'Điền từ khuyết' : 'Fill Blank', value: 'fill_in_blank', icon: <PenTool size={14} /> },
                  { label: currentLang === 'vi' ? 'Luyện viết AI ✨' : 'AI Writing ✨', value: 'ai_writing', icon: <Sparkles size={14} /> },
                ]}
                style={{ marginBottom: 12, padding: 4, borderRadius: 12 }}
              />
            </div>

            {/* Options Box */}
            <div style={{ width: '100%', background: 'rgba(0,0,0,0.02)', padding: '16px', borderRadius: 16, border: '1px solid rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
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

              {quizMode === 'multiple_choice' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>{translate('quizOptionTimer', currentLang)}</span>
                  <Switch checked={timerActive} onChange={checked => { setTimerActive(checked); if (checked) setTimeLeft(15); }} size="small" />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#475569', fontSize: 13 }}>{translate('quizOptionWordsAvailable', currentLang)}</span>
                <Tag color={hasEnoughWords ? "success" : "error"} style={{ fontSize: 13, borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>
                  {tagWordCount} {currentLang === 'vi' ? 'từ vựng' : 'words'}
                </Tag>
              </div>
            </div>

            {!hasEnoughWords && (
              <div className="quiz-warning-alert">
                <span className="quiz-warning-text">
                  ⚠️ {currentLang === 'vi' ? `Cần ít nhất ${minWordsNeeded} từ vựng để bắt đầu chế độ này!` : `Requires at least ${minWordsNeeded} words for this mode!`}
                </span>
              </div>
            )}

            <Button 
              type="primary" 
              size="large" 
              disabled={!hasEnoughWords}
              onClick={async () => {
                await startNewRound();
                setIsStarted(true);
              }}
              style={hasEnoughWords ? { 
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
              {translate('btnStartQuiz', currentLang)} 🚀
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const renderContent = () => {
    if (!quiz) {
      return (
        <Card className="premium-flashcard" style={{ width: 600, textAlign: 'center', padding: '40px 24px' }} bordered={false}>
          <Title level={3}>{currentLang === 'vi' ? 'Không có từ vựng phù hợp' : 'No words found'}</Title>
          <Button type="primary" onClick={() => setIsStarted(false)}>
            {translate('btnCancel', currentLang)}
          </Button>
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
          <Title level={2} style={{ fontWeight: 700, margin: 0 }}>
            {translate('quizResultTitle', currentLang)}
          </Title>
          <Text style={{ fontSize: 15, color: '#64748b', marginTop: 8, marginBottom: 24 }}>
            {translate('quizResultDesc', currentLang)}
          </Text>

          <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Progress 
              type="circle" 
              percent={accuracy} 
              strokeColor={{ '0%': '#10b981', '100%': '#3b82f6' }}
              width={120}
            />
            <Text strong style={{ fontSize: 18, marginTop: 16, color: '#1e293b' }}>
              {translate('quizScore', currentLang, { score: correctCount, total: roundWords.length })}
            </Text>
          </div>

          {missedInSession.length > 0 && (
            <Card title={<span style={{ color: '#ef4444', fontWeight: 600 }}>{translate('wrongWordsToReview', currentLang)}</span>} bordered={false} className="glass-card" style={{ width: '100%', maxWidth: 500, marginBottom: 24 }}>
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
            <Button size="large" onClick={() => setIsStarted(false)} style={{ borderRadius: 24, fontWeight: 600, height: 44, padding: '0 24px' }}>
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
              {currentLang === 'vi' ? 'ĐIỂM' : 'SCORE'}: {correctCount}
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
          {/* Mode 1: Multiple Choice */}
          {quizMode === 'multiple_choice' && (
            <>
              {timerActive && !quiz.answered && (
                <div 
                  className={timeLeft <= 5 ? 'timer-pulse-critical' : ''}
                  style={{ position: 'absolute', top: 20, right: 20, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 20, background: 'rgba(248, 250, 252, 0.8)', border: '1px solid rgba(0,0,0,0.06)' }}
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
              
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, margin: '18px 0 8px 0' }}>
                <Title level={1} style={{ fontSize: '2.8rem', margin: 0, color: '#1e293b', fontWeight: 700 }}>
                  {quiz.word.word}
                </Title>
                <Button 
                  type="text" 
                  shape="circle" 
                  icon={<Volume2 size={20} color="#6366f1" />} 
                  onClick={() => playAudio(quiz.word.word)} 
                />
              </div>
              
              {quiz.word.phonetic && (
                <Text style={{ fontSize: '1.2rem', color: '#64748b', display: 'block', marginBottom: 12, fontStyle: 'italic' }}>
                  {quiz.word.phonetic}
                </Text>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0 32px', marginTop: 16 }}>
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
            </>
          )}

          {/* Mode 2: Fill in the blank */}
          {quizMode === 'fill_in_blank' && (
            <div style={{ padding: '0 32px' }}>
              <div style={{ display: 'inline-flex', padding: 10, borderRadius: '50%', background: 'rgba(99, 102, 241, 0.1)', marginBottom: 12 }}>
                <PenTool size={28} color="#6366f1" />
              </div>
              <Title level={4} style={{ color: '#1e293b', marginBottom: 4 }}>
                {currentLang === 'vi' ? 'Điền từ còn thiếu vào câu' : 'Fill in the Missing Word'}
              </Title>
              <Text style={{ fontSize: 13, color: '#64748b' }}>
                {currentLang === 'vi' ? 'Nghĩa tiếng Việt:' : 'Meaning:'} <strong style={{ color: '#8b5cf6' }}>{quiz.word.meaning}</strong>
              </Text>

              <div style={{ 
                margin: '20px 0', 
                padding: '16px 20px', 
                background: 'rgba(99, 102, 241, 0.06)', 
                borderRadius: 14, 
                border: '1px solid rgba(99, 102, 241, 0.15)',
                fontSize: 16,
                lineHeight: 1.6,
                color: '#334155',
                fontStyle: 'italic'
              }}>
                "{quiz.maskedSentence}"
              </div>

              {!quiz.answered ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <Input 
                    placeholder={currentLang === 'vi' ? 'Gõ từ tiếng Anh vào đây...' : 'Type the English word here...'}
                    value={typedInput}
                    onChange={(e) => setTypedInput(e.target.value)}
                    size="large"
                    style={{ borderRadius: 12, fontSize: 16 }}
                    autoFocus
                  />
                  <Button 
                    type="primary" 
                    size="large" 
                    onClick={handleFillBlankSubmit}
                    disabled={!typedInput.trim()}
                    style={{ borderRadius: 12, background: '#8b5cf6', fontWeight: 600, padding: '0 24px' }}
                  >
                    {currentLang === 'vi' ? 'Kiểm tra' : 'Check'}
                  </Button>
                </div>
              ) : (
                <div style={{ 
                  marginTop: 16, 
                  padding: '12px 16px', 
                  borderRadius: 12, 
                  background: quiz.isCorrect ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${quiz.isCorrect ? '#10b981' : '#ef4444'}`,
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: quiz.isCorrect ? '#059669' : '#dc2626' }}>
                    {quiz.isCorrect 
                      ? (currentLang === 'vi' ? '🎉 Chính xác!' : '🎉 Correct!') 
                      : `${currentLang === 'vi' ? 'Đáp án đúng:' : 'Correct word:'} "${quiz.word.word}"`}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
                    {currentLang === 'vi' ? 'Bạn đã gõ:' : 'You typed:'} <em>"{quiz.typedAnswer}"</em>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode 3: AI Writing Practice */}
          {quizMode === 'ai_writing' && (
            <div style={{ padding: '0 32px', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Sparkles size={20} color="#8b5cf6" />
                <Title level={4} style={{ margin: 0, color: '#1e293b' }}>
                  {currentLang === 'vi' ? 'Luyện đặt câu với từ vựng (AI Chấm điểm)' : 'AI Sentence Writing Practice'}
                </Title>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
                  {quiz.word.word} <span style={{ fontSize: 13, color: '#64748b', fontWeight: 400 }}>{quiz.word.phonetic}</span>
                </div>
                <div style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 600, marginTop: 2 }}>
                  {quiz.word.meaning}
                </div>
              </div>

              {!quiz.answered ? (
                <>
                  <Input.TextArea
                    rows={3}
                    placeholder={currentLang === 'vi' ? `Viết 1 câu tiếng Anh có chứa từ "${quiz.word.word}"...` : `Write an English sentence with "${quiz.word.word}"...`}
                    value={typedInput}
                    onChange={(e) => setTypedInput(e.target.value)}
                    style={{ borderRadius: 12, fontSize: 14 }}
                  />
                  <div style={{ marginTop: 12, textAlign: 'right' }}>
                    <Button 
                      type="primary" 
                      size="large" 
                      loading={isEvaluating}
                      onClick={handleAIWritingSubmit}
                      disabled={!typedInput.trim()}
                      icon={<Sparkles size={16} />}
                      style={{ borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', border: 'none', fontWeight: 600 }}
                    >
                      {currentLang === 'vi' ? 'Chấm điểm AI ✨' : 'Evaluate with AI ✨'}
                    </Button>
                  </div>
                </>
              ) : (
                quiz.aiEvaluation && (
                  <div style={{ background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                        {currentLang === 'vi' ? 'Kết quả chấm điểm:' : 'AI Evaluation:'}
                      </span>
                      <Tag color={quiz.aiEvaluation.score >= 80 ? 'success' : quiz.aiEvaluation.score >= 60 ? 'warning' : 'error'} style={{ fontSize: 14, padding: '2px 10px', borderRadius: 10, fontWeight: 800 }}>
                        {quiz.aiEvaluation.score} / 100 điểm
                      </Tag>
                    </div>

                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5, marginBottom: 10 }}>
                      <strong>{currentLang === 'vi' ? 'Nhận xét:' : 'Feedback:'}</strong> {quiz.aiEvaluation.grammarFeedback}
                    </div>

                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', fontSize: 13 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 2 }}>
                        ✨ {currentLang === 'vi' ? 'Gợi ý viết tự nhiên hơn:' : 'Suggested Native Sentence:'}
                      </div>
                      <div style={{ color: '#14532d', fontStyle: 'italic' }}>
                        "{quiz.aiEvaluation.improvedSentence}"
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Next Question Button */}
          {quiz.answered && (
            <div style={{ marginTop: 24, animation: 'fadeIn 0.3s' }}>
              <Button 
                type="primary" 
                size="large" 
                onClick={handleNext} 
                style={{ borderRadius: 24, fontWeight: 600, background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', border: 'none', width: 220, height: 44 }}
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
      {/* Control Bar */}
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
        <span style={{ fontSize: 16, fontWeight: 700, color: '#475569', fontFamily: 'Inter' }}>
          {!quiz ? translate('quizTitle', currentLang) : translate('quizResultTitle', currentLang).replace('! 🏁', '')}
        </span>

        {quiz && !isRoundOver && comboStreak >= 3 && (
          <div className="flame-pop" style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff7ed', padding: '4px 12px', borderRadius: 16, border: '1px solid #fed7aa' }}>
            <Flame size={16} color="#f97316" fill="#f97316" />
            <span style={{ fontWeight: 700, color: '#ea580c', fontSize: 13 }}>{comboStreak}x Combo</span>
          </div>
        )}

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
