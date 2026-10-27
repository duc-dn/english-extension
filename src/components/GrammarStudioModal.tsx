import React, { useState, useEffect } from 'react';
import { Modal, Tabs, Button, Tag, Input, Tooltip, Progress, Spin, message, InputNumber, Segmented, Space } from 'antd';
import { 
  BookOpen, 
  CheckCircle, 
  XCircle, 
  Sparkles, 
  Volume2, 
  Copy, 
  RefreshCw, 
  ChevronRight, 
  Lightbulb, 
  PenTool, 
  HelpCircle, 
  Award,
  Info,
  BookmarkPlus,
  Check
} from 'lucide-react';
import { 
  db,
  addGrammarNote,
  type GrammarNote, 
  type GrammarExerciseMultipleChoice, 
  type GrammarExerciseTranslation,
  updateGrammarNote 
} from '../lib/db';
import { 
  generateGrammarExercisesWithAI, 
  evaluateGrammarTranslationWithAI,
  type GrammarTranslationEvaluation 
} from '../lib/translator';
import { playAudio } from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { getGrammarAnswerUpdate, getGrammarMistakeCount, isGrammarReviewDue } from '../lib/grammarPractice';

interface GrammarStudioModalProps {
  open: boolean;
  note: GrammarNote | null;
  onClose: () => void;
  onNoteUpdated?: (updated: GrammarNote) => void;
  initialTab?: string;
  autoOpenGenerator?: boolean;
  reviewMistakesOnly?: boolean;
}

export const GrammarStudioModal: React.FC<GrammarStudioModalProps> = ({
  open,
  note,
  onClose,
  onNoteUpdated,
  initialTab = 'theory',
  autoOpenGenerator = false,
  reviewMistakesOnly = false
}) => {
  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavedInDb, setIsSavedInDb] = useState(true);

  // --- AI Generator Modal State ---
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [mcCount, setMcCount] = useState<number>(5);
  const [transCount, setTransCount] = useState<number>(3);
  const [difficulty, setDifficulty] = useState<'basic' | 'intermediate' | 'advanced' | 'exam_traps'>('intermediate');
  const [genMode, setGenMode] = useState<'append' | 'replace'>('append');


  // --- Tab 2: Quiz State ---
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [quizScore, setQuizScore] = useState(0);
  const [isSavingQuiz, setIsSavingQuiz] = useState(false);
  const [quizQuestionIds, setQuizQuestionIds] = useState<string[]>([]);
  const [isMistakeReview, setIsMistakeReview] = useState(false);

  // --- Tab 3: Translation Writing State ---
  const [transIndex, setTransIndex] = useState(0);
  const [userSentence, setUserSentence] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<GrammarTranslationEvaluation | null>(null);

  // Check DB status on mount or note change
  useEffect(() => {
    if (open && note) {
      setActiveTab(initialTab);
      setQuizIndex(0);
      setSelectedOption(null);
      setIsSubmitted(false);
      setQuizScore(0);
      setIsSavingQuiz(false);
      const availableQuestions = note.exercises?.multipleChoice || [];
      const mistakeIds = new Set(note.quiz_mistake_ids || []);
      const shouldReviewMistakes = reviewMistakesOnly && availableQuestions.some(question => mistakeIds.has(question.id));
      setIsMistakeReview(shouldReviewMistakes);
      setQuizQuestionIds(availableQuestions.filter(question => !shouldReviewMistakes || mistakeIds.has(question.id)).map(question => question.id));

      setTransIndex(0);
      setUserSentence('');
      setShowHint(false);
      setEvaluation(null);

      if (note.id) {
        db.grammar_notes.get(note.id).then(found => {
          setIsSavedInDb(!!found);
        }).catch(() => setIsSavedInDb(false));
      } else {
        setIsSavedInDb(false);
      }

      if (autoOpenGenerator) {
        setIsGeneratorOpen(true);
      }
    }
  }, [open, note?.id, autoOpenGenerator, initialTab, reviewMistakesOnly]);

  if (!note) return null;

  // Extract parsed sections from note if not directly on note properties
  const formula = note.formula || (() => {
    const match = note.content.match(/\[(?:Công thức|Formula)\]:\s*([^\n]+)/i);
    return match ? match[1].trim() : '';
  })();

  const explanation = note.explanation || (() => {
    const cleaned = note.content
      .replace(/\[(?:Công thức|Formula)\]:[^\n]+/gi, '')
      .replace(/\[(?:Lưu ý|Notes)\]:[\s\S]*/gi, '')
      .replace(/\[(?:Cách dùng|Explanation)\]:/gi, '')
      .trim();
    return cleaned || note.content;
  })();

  const notesSection = note.notes || (() => {
    const match = note.content.match(/\[(?:Lưu ý|Notes)\]:\s*([\s\S]+)$/i);
    return match ? match[1].trim() : '';
  })();

  const examplesList = note.examplesList || (() => {
    if (!note.example) return [];
    return note.example.split('\n\n').filter(Boolean).map(item => {
      const parts = item.split('\n');
      const english = parts[0]?.trim() || '';
      const vietnamese = parts[1]?.replace(/[()]/g, '').trim() || '';
      return { english, vietnamese };
    });
  })();

  const multipleChoiceList: GrammarExerciseMultipleChoice[] = note.exercises?.multipleChoice || [];
  const translationList: GrammarExerciseTranslation[] = note.exercises?.translation || [];

  // 1-Click Save to Notebook
  const handleSaveToNotebook = async () => {
    try {
      const existingInDb = note.id ? await db.grammar_notes.get(note.id) : null;
      if (!existingInDb) {
        const toSave = {
          title: note.title,
          content: note.content || `[Công thức]: ${formula}\n\n[Cách dùng]: ${explanation}`,
          example: note.example || '',
          tags: note.tags || ['grammar'],
          formula,
          explanation,
          notes: notesSection,
          examplesList,
          exercises: note.exercises
        };
        const saved = await addGrammarNote(toSave);
        setIsSavedInDb(true);
        onNoteUpdated?.(saved);
        message.success(currentLang === 'vi' ? 'Đã lưu cấu trúc này vào sổ tay của bạn!' : 'Saved to your notebook!');
      }
    } catch {
      message.error('Failed to save to notebook');
    }
  };

  // Customizable AI Exercise Generation
  const handleExecuteGenerate = async () => {
    if (mcCount === 0 && transCount === 0) {
      message.warning(currentLang === 'vi' ? 'Vui lòng chọn ít nhất 1 câu hỏi trắc nghiệm hoặc bài dịch.' : 'Please select at least 1 question.');
      return;
    }

    setIsGenerating(true);
    try {
      const generated = await generateGrammarExercisesWithAI(
        note.title,
        formula,
        explanation,
        undefined,
        {
          multipleChoiceCount: mcCount,
          translationCount: transCount,
          difficulty
        }
      );

      let updatedExercises;
      if (genMode === 'replace') {
        updatedExercises = {
          multipleChoice: generated.multipleChoice || [],
          translation: generated.translation || []
        };
      } else {
        const existingMC = note.exercises?.multipleChoice || [];
        const existingTrans = note.exercises?.translation || [];
        updatedExercises = {
          multipleChoice: [...existingMC, ...(generated.multipleChoice || [])],
          translation: [...existingTrans, ...(generated.translation || [])]
        };
      }

      const updatedNote: GrammarNote = {
        ...note,
        exercises: updatedExercises,
        formula: formula || note.formula,
        explanation: explanation || note.explanation,
        notes: notesSection || note.notes,
        examplesList: examplesList.length ? examplesList : note.examplesList
      };

      const existingInDb = note.id ? await db.grammar_notes.get(note.id) : null;
      let finalNote: GrammarNote;
      if (existingInDb) {
        await updateGrammarNote(note.id, updatedNote);
        finalNote = updatedNote;
      } else {
        finalNote = await addGrammarNote(updatedNote);
        setIsSavedInDb(true);
      }

      const newMC = generated.multipleChoice || [];
      const newTrans = generated.translation || [];

      onNoteUpdated?.(finalNote);
      setIsGeneratorOpen(false);
      message.success(
        currentLang === 'vi' 
          ? `Đã tạo thành công ${newMC.length} câu trắc nghiệm & ${newTrans.length} bài dịch!`
          : `Generated ${newMC.length} quiz questions & ${newTrans.length} translations!`
      );

      if (newMC.length > 0) {
        setActiveTab('quiz');
        setIsMistakeReview(false);
        setQuizQuestionIds(updatedExercises.multipleChoice.map(question => question.id));
        setQuizIndex(genMode === 'replace' ? 0 : (note.exercises?.multipleChoice?.length || 0));
        setSelectedOption(null);
        setIsSubmitted(false);
      } else if (newTrans.length > 0) {
        setActiveTab('writing');
        setTransIndex(genMode === 'replace' ? 0 : (note.exercises?.translation?.length || 0));
        setUserSentence('');
        setEvaluation(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate exercises';
      message.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };


  // Handle Quiz actions
  const quizQuestions = quizQuestionIds.map(id => multipleChoiceList.find(question => question.id === id)).filter((question): question is GrammarExerciseMultipleChoice => Boolean(question));
  const currentQuestion = quizQuestions[quizIndex];

  const startQuiz = (mistakesOnly: boolean) => {
    const mistakes = new Set(note.quiz_mistake_ids || []);
    const selected = multipleChoiceList.filter(question => !mistakesOnly || mistakes.has(question.id));
    if (!selected.length) return;
    setQuizQuestionIds(selected.map(question => question.id));
    setIsMistakeReview(mistakesOnly);
    setQuizIndex(0);
    setSelectedOption(null);
    setIsSubmitted(false);
    setQuizScore(0);
    setActiveTab('quiz');
  };

  const handleSelectOption = (idx: number) => {
    if (isSubmitted) return;
    setSelectedOption(idx);
  };

  const handleSubmitQuizAnswer = async () => {
    if (selectedOption === null || !currentQuestion) return;
    setIsSubmitted(true);
    const correct = selectedOption === currentQuestion.correctAnswer;
    setIsSavingQuiz(true);
    if (correct) {
      setQuizScore(prev => prev + 1);
      message.success(currentLang === 'vi' ? 'Chính xác! Xuất sắc lắm!' : 'Correct! Great job!');
    } else {
      message.error(currentLang === 'vi' ? 'Chưa chính xác! Hãy đọc kỹ giải thích nhé.' : 'Not quite right! Check the explanation.');
    }
    try {
      const changes = getGrammarAnswerUpdate(note, currentQuestion.id, correct);
      const existing = await db.grammar_notes.get(note.id);
      if (existing) {
        await updateGrammarNote(note.id, changes);
        onNoteUpdated?.({ ...note, ...changes });
      }
    } catch {
      message.error(currentLang === 'vi' ? 'Không lưu được tiến độ ôn tập.' : 'Could not save review progress.');
    } finally {
      setIsSavingQuiz(false);
    }
  };

  const handleNextQuiz = () => {
    setSelectedOption(null);
    setIsSubmitted(false);
    if (quizIndex < quizQuestions.length - 1) {
      setQuizIndex(prev => prev + 1);
    }
  };

  const handleRestartQuiz = () => startQuiz(isMistakeReview && getGrammarMistakeCount(note) > 0);

  // Handle Translation Writing actions
  const currentTranslation = translationList[transIndex];

  const handleEvaluateWriting = async () => {
    if (!userSentence.trim()) {
      message.warning(currentLang === 'vi' ? 'Vui lòng gõ câu tiếng Anh của bạn trước khi chấm điểm.' : 'Please type your English sentence first.');
      return;
    }
    if (!currentTranslation) return;

    setIsEvaluating(true);
    try {
      const result = await evaluateGrammarTranslationWithAI({
        grammarTitle: note.title,
        formula,
        vietnamesePrompt: currentTranslation.vietnamese,
        userSentence: userSentence.trim(),
        suggestedEnglish: currentTranslation.suggestedEnglish
      });
      setEvaluation(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Evaluation failed';
      message.error(msg);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNextTranslation = () => {
    setUserSentence('');
    setShowHint(false);
    setEvaluation(null);
    if (transIndex < translationList.length - 1) {
      setTransIndex(prev => prev + 1);
    } else {
      setTransIndex(0);
    }
  };

  const handleCopyFormula = () => {
    if (formula) {
      navigator.clipboard.writeText(formula);
      message.success(currentLang === 'vi' ? 'Đã sao chép công thức!' : 'Formula copied!');
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={860}
      centered
      destroyOnClose
      styles={{
        body: {
          borderRadius: 20,
          padding: 0,
          overflow: 'hidden',
          background: isDark ? '#0f172a' : '#ffffff'
        }
      }}
    >
      {/* Top Header Banner */}
      <div style={{
        padding: '24px 28px 18px 28px',
        borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9',
        background: isDark 
          ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.95) 100%)' 
          : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 12
      }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{ 
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '2px 8px',
              borderRadius: 6,
              background: 'rgba(244, 63, 94, 0.12)',
              color: '#f43f5e',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.4px'
            }}>
              <BookOpen size={12} />
              {translate('grammarStudioTitle', currentLang)}
            </span>
            {(note.tags || []).map(tag => (
              <Tag color="magenta" key={tag} style={{ borderRadius: 6, fontSize: 11, margin: 0 }}>
                #{tag}
              </Tag>
            ))}
          </div>

          <h2 style={{ 
            margin: 0, 
            fontSize: 22, 
            fontWeight: 800, 
            color: isDark ? '#f8fafc' : '#0f172a',
            lineHeight: 1.3
          }}>
            {note.title}
          </h2>
        </div>

        {/* Action Buttons: Save to notebook & Customizable AI Exercises Generator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isSavedInDb ? (
            <Button
              icon={<BookmarkPlus size={14} color="#059669" />}
              onClick={handleSaveToNotebook}
              style={{
                borderRadius: 10,
                fontWeight: 600,
                height: 36,
                borderColor: '#10b981',
                color: '#059669'
              }}
            >
              {translate('grammarSaveToNotebook', currentLang)}
            </Button>
          ) : (
            <Tag color="success" style={{ borderRadius: 8, padding: '4px 10px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, margin: 0, fontSize: 12 }}>
              <Check size={13} /> {translate('grammarSavedInNotebook', currentLang)}
            </Tag>
          )}

          <Button
            type="primary"
            icon={<Sparkles size={14} />}
            onClick={() => setIsGeneratorOpen(true)}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              border: 'none',
              borderRadius: 10,
              fontWeight: 700,
              height: 36,
              padding: '0 16px',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            {translate('grammarQuickGenAI', currentLang)}
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{ padding: '0 28px 24px 28px' }}>
        {multipleChoiceList.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingTop: 16 }}>
            <div style={{ color: isDark ? '#cbd5e1' : '#475569', fontSize: 13 }}>
              {getGrammarMistakeCount(note) > 0
                ? (currentLang === 'vi' ? `${getGrammarMistakeCount(note)} câu cần luyện lại` : `${getGrammarMistakeCount(note)} questions to retry`)
                : (currentLang === 'vi' ? 'Luyện tập để theo dõi tiến độ ghi nhớ' : 'Practice to track your recall')}
              {isGrammarReviewDue(note) && isSavedInDb && (
                <Tag color="orange" style={{ marginLeft: 8 }}>{currentLang === 'vi' ? 'Đến hạn ôn' : 'Due today'}</Tag>
              )}
            </div>
            <Space wrap>
              {getGrammarMistakeCount(note) > 0 && (
                <Button size="small" onClick={() => startQuiz(true)} icon={<RefreshCw size={14} />}>
                  {currentLang === 'vi' ? 'Ôn câu sai' : 'Review mistakes'}
                </Button>
              )}
              <Button size="small" onClick={() => startQuiz(false)}>
                {currentLang === 'vi' ? 'Luyện tất cả' : 'Practice all'}
              </Button>
            </Space>
          </div>
        )}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'theory',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}>
                  <BookOpen size={15} />
                  {translate('grammarTabTheory', currentLang)}
                </span>
              ),
              children: (
                <div style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Formula Code Banner */}
                  {formula && (
                    <div style={{
                      background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(241, 245, 249, 0.9)',
                      border: isDark ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid #e2e8f0',
                      borderLeft: '4px solid #6366f1',
                      borderRadius: 12,
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12
                    }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 4 }}>
                          {translate('aiGrammarFormulaLabel', currentLang)}
                        </span>
                        <code style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#e0e7ff' : '#1e1b4b', fontFamily: 'monospace' }}>
                          {formula}
                        </code>
                      </div>
                      <Tooltip title={currentLang === 'vi' ? 'Sao chép công thức' : 'Copy formula'}>
                        <Button
                          type="text"
                          icon={<Copy size={15} color="#818cf8" />}
                          onClick={handleCopyFormula}
                          style={{ borderRadius: 8 }}
                        />
                      </Tooltip>
                    </div>
                  )}

                  {/* Explanation Section */}
                  <div style={{
                    background: isDark ? 'rgba(30, 41, 59, 0.4)' : '#f8fafc',
                    borderRadius: 12,
                    padding: '16px 18px',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid #e2e8f0'
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Info size={14} color="#0284c7" />
                      {translate('aiGrammarExplainLabel', currentLang)}
                    </div>
                    <div style={{ 
                      fontSize: 14, 
                      lineHeight: '1.7', 
                      color: isDark ? '#f1f5f9' : '#1e293b', 
                      whiteSpace: 'pre-wrap' 
                    }}>
                      {explanation}
                    </div>
                  </div>

                  {/* Examples Section */}
                  {examplesList.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#475569', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Volume2 size={14} color="#8b5cf6" />
                        {translate('aiGrammarExamplesLabel', currentLang)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {examplesList.map((ex, idx) => (
                          <div 
                            key={idx}
                            style={{
                              background: isDark ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
                              border: isDark ? '1px solid rgba(139, 92, 246, 0.2)' : '1px solid #e2e8f0',
                              borderLeft: '3px solid #8b5cf6',
                              borderRadius: 10,
                              padding: '12px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                {ex.english}
                              </div>
                              {ex.vietnamese && (
                                <div style={{ fontSize: 12.5, color: isDark ? '#94a3b8' : '#64748b', marginTop: 3 }}>
                                  {ex.vietnamese}
                                </div>
                              )}
                            </div>
                            <Button
                              type="text"
                              size="small"
                              icon={<Volume2 size={15} color="#8b5cf6" />}
                              onClick={() => playAudio(ex.english)}
                              style={{ borderRadius: 6 }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Common Pitfalls / Notes */}
                  {notesSection && (
                    <div style={{
                      background: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
                      border: isDark ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #fef3c7',
                      borderRadius: 12,
                      padding: '14px 18px',
                      color: isDark ? '#fde68a' : '#92400e',
                      fontSize: 13,
                      lineHeight: '1.6'
                    }}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Lightbulb size={15} color="#f59e0b" />
                        {translate('aiGrammarNotesLabel', currentLang)}
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>
                        {notesSection}
                      </div>
                    </div>
                  )}
                </div>
              )
            },
            {
              key: 'quiz',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}>
                  <CheckCircle size={15} />
                  {translate('grammarTabQuiz', currentLang)}
                  {multipleChoiceList.length > 0 && (
                    <Tag color="cyan" style={{ margin: 0, borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                      {multipleChoiceList.length}
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <div style={{ paddingTop: 12 }}>
                  {multipleChoiceList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                      <HelpCircle size={40} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
                      <p style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 14, maxWidth: 440, margin: '0 auto 20px auto' }}>
                        {translate('grammarNoExercisesYet', currentLang)}
                      </p>
                      <Button
                        type="primary"
                        icon={<Sparkles size={14} />}
                        onClick={() => {
                          setMcCount(5);
                          setTransCount(0);
                          setIsGeneratorOpen(true);
                        }}
                        style={{
                          borderRadius: 10,
                          fontWeight: 700,
                          height: 38,
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                        }}
                      >
                        {translate('grammarQuickGenAI', currentLang)}
                      </Button>
                    </div>
                  ) : currentQuestion ? (
                    <div>
                      {isMistakeReview && (
                        <Tag color="orange" style={{ marginBottom: 12 }}>{currentLang === 'vi' ? 'Đang ôn câu đã sai' : 'Reviewing past mistakes'}</Tag>
                      )}
                      {/* Quiz Progress & Score */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                          {currentLang === 'vi' 
                            ? `Câu hỏi ${quizIndex + 1} / ${quizQuestions.length}` 
                            : `Question ${quizIndex + 1} of ${quizQuestions.length}`}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Award size={16} color="#eab308" />
                          <span style={{ fontWeight: 800, fontSize: 14, color: isDark ? '#f8fafc' : '#0f172a' }}>
                            {quizScore} / {quizQuestions.length}
                          </span>
                        </div>
                      </div>

                      <Progress 
                        percent={Math.round(((quizIndex + (isSubmitted ? 1 : 0)) / quizQuestions.length) * 100)} 
                        showInfo={false}
                        strokeColor="#6366f1"
                        style={{ marginBottom: 20 }}
                      />

                      {/* Question Card */}
                      <div style={{
                        background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f8fafc',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                        borderRadius: 14,
                        padding: '20px',
                        marginBottom: 16
                      }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', lineHeight: 1.5 }}>
                          {currentQuestion.question}
                        </div>
                      </div>

                      {/* Options List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                        {currentQuestion.options.map((opt, optIdx) => {
                          let bgColor = isDark ? 'rgba(30, 41, 59, 0.4)' : '#ffffff';
                          let borderColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0';
                          let textColor = isDark ? '#f8fafc' : '#0f172a';

                          if (isSubmitted) {
                            if (optIdx === currentQuestion.correctAnswer) {
                              bgColor = isDark ? 'rgba(22, 163, 74, 0.2)' : '#f0fdf4';
                              borderColor = '#22c55e';
                              textColor = isDark ? '#86efac' : '#15803d';
                            } else if (optIdx === selectedOption) {
                              bgColor = isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2';
                              borderColor = '#ef4444';
                              textColor = isDark ? '#fca5a5' : '#b91c1c';
                            }
                          } else if (selectedOption === optIdx) {
                            bgColor = isDark ? 'rgba(99, 102, 241, 0.15)' : '#eef2ff';
                            borderColor = '#6366f1';
                          }

                          return (
                            <button
                              type="button"
                              disabled={isSubmitted}
                              aria-pressed={selectedOption === optIdx}
                              key={optIdx}
                              onClick={() => handleSelectOption(optIdx)}
                              style={{
                                width: '100%',
                                textAlign: 'left',
                                padding: '14px 18px',
                                borderRadius: 12,
                                background: bgColor,
                                border: `1.5px solid ${borderColor}`,
                                cursor: isSubmitted ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.2s ease',
                                fontWeight: 600,
                                fontSize: 14,
                                color: textColor
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 8,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  background: isDark ? 'rgba(255, 255, 255, 0.1)' : '#f1f5f9'
                                }}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span>{opt}</span>
                              </div>

                              {isSubmitted && optIdx === currentQuestion.correctAnswer && (
                                <CheckCircle size={18} color="#22c55e" />
                              )}
                              {isSubmitted && optIdx === selectedOption && optIdx !== currentQuestion.correctAnswer && (
                                <XCircle size={18} color="#ef4444" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Explanation Callout after Submission */}
                      {isSubmitted && currentQuestion.explanation && (
                        <div style={{
                          background: isDark ? 'rgba(99, 102, 241, 0.12)' : '#f0f4ff',
                          border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid #c7d2fe',
                          borderRadius: 12,
                          padding: '14px 18px',
                          marginBottom: 20,
                          fontSize: 13,
                          lineHeight: '1.6',
                          color: isDark ? '#c7d2fe' : '#3730a3'
                        }}>
                          <strong style={{ display: 'block', marginBottom: 4 }}>
                            {currentLang === 'vi' ? 'Giải thích chi tiết:' : 'Explanation:'}
                          </strong>
                          {currentQuestion.explanation}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        {!isSubmitted ? (
                          <Button
                            type="primary"
                            disabled={selectedOption === null}
                            onClick={handleSubmitQuizAnswer}
                            style={{
                              borderRadius: 10,
                              fontWeight: 700,
                              height: 38,
                              padding: '0 20px',
                              background: '#0284c7'
                            }}
                          >
                            {translate('grammarSubmitAnswer', currentLang)}
                          </Button>
                        ) : quizIndex < quizQuestions.length - 1 ? (
                          <Button
                            type="primary"
                            icon={<ChevronRight size={15} />}
                            onClick={handleNextQuiz}
                            loading={isSavingQuiz}
                            style={{
                              borderRadius: 10,
                              fontWeight: 700,
                              height: 38,
                              padding: '0 20px',
                              background: '#6366f1'
                            }}
                          >
                            {translate('grammarNextQuestion', currentLang)}
                          </Button>
                        ) : (
                          <Space wrap>
                            <span style={{ fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                              {currentLang === 'vi' ? `Hoàn thành: ${quizScore}/${quizQuestions.length}` : `Completed: ${quizScore}/${quizQuestions.length}`}
                            </span>
                            <Button icon={<RefreshCw size={15} />} onClick={handleRestartQuiz} disabled={isSavingQuiz}>
                              {currentLang === 'vi' ? 'Làm lại' : 'Retry'}
                            </Button>
                          </Space>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            },
            {
              key: 'writing',
              label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 14 }}>
                  <PenTool size={15} />
                  {translate('grammarTabWriting', currentLang)}
                  {translationList.length > 0 && (
                    <Tag color="purple" style={{ margin: 0, borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                      {translationList.length}
                    </Tag>
                  )}
                </span>
              ),
              children: (
                <div style={{ paddingTop: 12 }}>
                  {translationList.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 16px' }}>
                      <PenTool size={40} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
                      <p style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 14, maxWidth: 440, margin: '0 auto 20px auto' }}>
                        {translate('grammarNoExercisesYet', currentLang)}
                      </p>
                      <Button
                        type="primary"
                        icon={<Sparkles size={14} />}
                        onClick={() => {
                          setMcCount(0);
                          setTransCount(3);
                          setIsGeneratorOpen(true);
                        }}
                        style={{
                          borderRadius: 10,
                          fontWeight: 700,
                          height: 38,
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.25)'
                        }}
                      >
                        {translate('grammarQuickGenAI', currentLang)}
                      </Button>
                    </div>
                  ) : currentTranslation ? (
                    <div>
                      {/* Header with Exercise Counter */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
                          {currentLang === 'vi' 
                            ? `Bài dịch ${transIndex + 1} / ${translationList.length}` 
                            : `Exercise ${transIndex + 1} of ${translationList.length}`}
                        </span>

                        {currentTranslation.hint && (
                          <Button
                            type="link"
                            size="small"
                            icon={<Lightbulb size={13} color="#f59e0b" />}
                            onClick={() => setShowHint(!showHint)}
                            style={{ padding: 0, fontSize: 12.5 }}
                          >
                            {showHint 
                              ? (currentLang === 'vi' ? 'Ẩn gợi ý' : 'Hide hint') 
                              : (currentLang === 'vi' ? 'Xem gợi ý 💡' : 'Show hint 💡')}
                          </Button>
                        )}
                      </div>

                      {/* Vietnamese Prompt Box */}
                      <div style={{
                        background: isDark ? 'rgba(30, 41, 59, 0.7)' : '#f8fafc',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                        borderRadius: 14,
                        padding: '18px 20px',
                        marginBottom: 14
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
                          {translate('grammarTranslatePromptLabel', currentLang)}
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', lineHeight: 1.5 }}>
                          "{currentTranslation.vietnamese}"
                        </div>

                        {showHint && currentTranslation.hint && (
                          <div style={{
                            marginTop: 10,
                            padding: '8px 12px',
                            background: isDark ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
                            borderRadius: 8,
                            fontSize: 12.5,
                            color: isDark ? '#fde68a' : '#92400e'
                          }}>
                            <strong>{translate('grammarHintLabel', currentLang)}:</strong> {currentTranslation.hint}
                          </div>
                        )}
                      </div>

                      {/* User Input Text Area */}
                      <Input.TextArea
                        rows={3}
                        value={userSentence}
                        onChange={(e) => setUserSentence(e.target.value)}
                        placeholder={translate('grammarWritingPlaceholder', currentLang)}
                        style={{
                          borderRadius: 12,
                          fontSize: 14.5,
                          padding: '12px 14px',
                          marginBottom: 16
                        }}
                      />

                      {/* Submit / Evaluate Button */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 16 }}>
                        <Button
                          type="primary"
                          icon={isEvaluating ? <Spin size="small" /> : <Sparkles size={14} />}
                          onClick={handleEvaluateWriting}
                          disabled={isEvaluating || !userSentence.trim()}
                          style={{
                            borderRadius: 10,
                            fontWeight: 700,
                            height: 38,
                            padding: '0 20px',
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                          }}
                        >
                          {translate('grammarEvaluateBtn', currentLang)}
                        </Button>

                        {evaluation && (
                          <Button
                            icon={<ChevronRight size={15} />}
                            onClick={handleNextTranslation}
                            style={{ borderRadius: 10, fontWeight: 600, height: 38 }}
                          >
                            {currentLang === 'vi' ? 'Bài tiếp theo' : 'Next Exercise'}
                          </Button>
                        )}
                      </div>

                      {/* Evaluation Feedback Result */}
                      {evaluation && (
                        <div style={{
                          background: isDark ? 'rgba(17, 24, 39, 0.9)' : '#ffffff',
                          border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid #a7f3d0',
                          borderRadius: 14,
                          padding: '18px 20px',
                          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.08)',
                          animation: 'fadeIn 0.3s ease'
                        }}>
                          {/* Score Header */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderBottom: isDark ? '1px solid #1f2937' : '1px solid #f1f5f9', paddingBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {evaluation.score >= 80 ? (
                                <CheckCircle size={20} color="#10b981" />
                              ) : (
                                <Info size={20} color="#f59e0b" />
                              )}
                              <span style={{ fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                {translate('grammarScore', currentLang)}: {evaluation.score}/100
                              </span>
                            </div>

                            <Tag 
                              color={evaluation.isCorrect ? 'success' : 'warning'} 
                              style={{ borderRadius: 8, fontWeight: 700, padding: '2px 8px' }}
                            >
                              {evaluation.isCorrect 
                                ? (currentLang === 'vi' ? 'Đúng cấu trúc' : 'Grammar Correct') 
                                : (currentLang === 'vi' ? 'Cần điều chỉnh' : 'Needs Adjustment')}
                            </Tag>
                          </div>

                          {/* Grammar Feedback */}
                          <p style={{ margin: '0 0 12px 0', fontSize: 13.5, lineHeight: '1.6', color: isDark ? '#cbd5e1' : '#334155' }}>
                            {evaluation.grammarFeedback}
                          </p>

                          {/* Strengths & Improvements */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                            {evaluation.strengths && (
                              <div style={{
                                background: isDark ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4',
                                borderRadius: 8,
                                padding: '10px 12px',
                                borderLeft: '3px solid #22c55e',
                                fontSize: 12.5,
                                color: isDark ? '#86efac' : '#166534'
                              }}>
                                <strong>{translate('grammarStrengths', currentLang)}</strong>
                                <div style={{ marginTop: 2 }}>{evaluation.strengths}</div>
                              </div>
                            )}

                            {evaluation.improvements && (
                              <div style={{
                                background: isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2',
                                borderRadius: 8,
                                padding: '10px 12px',
                                borderLeft: '3px solid #ef4444',
                                fontSize: 12.5,
                                color: isDark ? '#fca5a5' : '#991b1b'
                              }}>
                                <strong>{translate('grammarImprovements', currentLang)}</strong>
                                <div style={{ marginTop: 2 }}>{evaluation.improvements}</div>
                              </div>
                            )}
                          </div>

                          {/* Native Polish Sentence */}
                          <div style={{
                            background: isDark ? '#1e293b' : '#f8fafc',
                            borderRadius: 10,
                            padding: '12px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12
                          }}>
                            <div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#818cf8', display: 'block', marginBottom: 2 }}>
                                {translate('grammarSuggestedSentence', currentLang)}
                              </span>
                              <div style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
                                {evaluation.improvedSentence}
                              </div>
                            </div>

                            <Button
                              type="text"
                              size="small"
                              icon={<Volume2 size={16} color="#8b5cf6" />}
                              onClick={() => playAudio(evaluation.improvedSentence)}
                              style={{ borderRadius: 6 }}
                            />
                          </div>

                          {/* Alternative Expressions if available */}
                          {evaluation.alternativeExpressions && evaluation.alternativeExpressions.length > 0 && (
                            <div style={{ marginTop: 10, fontSize: 12, color: isDark ? '#94a3b8' : '#64748b' }}>
                              <span style={{ fontWeight: 600 }}>{translate('grammarAlternativeExpressions', currentLang)} </span>
                              {evaluation.alternativeExpressions.join(' • ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            }
          ]}
        />
      </div>

      {/* Customizable AI Exercise Generator Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800 }}>
            <Sparkles size={18} color="#8b5cf6" />
            <span>{translate('grammarCustomGeneratorTitle', currentLang)}</span>
          </div>
        }
        open={isGeneratorOpen}
        onCancel={() => !isGenerating && setIsGeneratorOpen(false)}
        footer={null}
        width={540}
        centered
        destroyOnClose
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ margin: '0 0 16px 0', fontSize: 13, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.5 }}>
            {translate('grammarCustomGeneratorDesc', currentLang)}
          </p>

          {/* Setting 1: Multiple Choice Count */}
          <div style={{ 
            background: isDark ? '#1e293b' : '#f8fafc', 
            borderRadius: 12, 
            padding: '14px 16px', 
            marginBottom: 12,
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: isDark ? '#f8fafc' : '#0f172a' }}>
                {translate('grammarMultipleChoiceCount', currentLang)}
              </span>
              <InputNumber
                min={0}
                max={20}
                value={mcCount}
                onChange={(val) => setMcCount(val ?? 0)}
                style={{ width: 70, borderRadius: 8 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[0, 3, 5, 10, 15].map(cnt => (
                <Tag
                  key={cnt}
                  onClick={() => setMcCount(cnt)}
                  color={mcCount === cnt ? 'indigo' : undefined}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    fontWeight: mcCount === cnt ? 700 : 500,
                    padding: '3px 10px',
                    fontSize: 12
                  }}
                >
                  {cnt === 0 ? (currentLang === 'vi' ? '0 câu' : '0 qs') : `${cnt} ${currentLang === 'vi' ? 'câu' : 'qs'}`}
                  {cnt === 5 ? ' ⭐' : ''}
                </Tag>
              ))}
            </div>
          </div>

          {/* Setting 2: Translation Count */}
          <div style={{ 
            background: isDark ? '#1e293b' : '#f8fafc', 
            borderRadius: 12, 
            padding: '14px 16px', 
            marginBottom: 12,
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: isDark ? '#f8fafc' : '#0f172a' }}>
                {translate('grammarTranslationCount', currentLang)}
              </span>
              <InputNumber
                min={0}
                max={15}
                value={transCount}
                onChange={(val) => setTransCount(val ?? 0)}
                style={{ width: 70, borderRadius: 8 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[0, 2, 3, 5, 10].map(cnt => (
                <Tag
                  key={cnt}
                  onClick={() => setTransCount(cnt)}
                  color={transCount === cnt ? 'magenta' : undefined}
                  style={{
                    cursor: 'pointer',
                    borderRadius: 8,
                    fontWeight: transCount === cnt ? 700 : 500,
                    padding: '3px 10px',
                    fontSize: 12
                  }}
                >
                  {cnt === 0 ? (currentLang === 'vi' ? '0 câu' : '0 items') : `${cnt} ${currentLang === 'vi' ? 'câu' : 'items'}`}
                  {cnt === 3 ? ' ⭐' : ''}
                </Tag>
              ))}
            </div>
          </div>

          {/* Setting 3: Difficulty */}
          <div style={{ 
            background: isDark ? '#1e293b' : '#f8fafc', 
            borderRadius: 12, 
            padding: '14px 16px', 
            marginBottom: 12,
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0'
          }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10, color: isDark ? '#f8fafc' : '#0f172a' }}>
              {translate('grammarDifficulty', currentLang)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { key: 'basic', label: translate('grammarDifficultyBasic', currentLang), desc: 'B1 - Đơn giản' },
                { key: 'intermediate', label: translate('grammarDifficultyInter', currentLang), desc: 'B2 - Chuẩn thực tế ⭐' },
                { key: 'advanced', label: translate('grammarDifficultyAdvanced', currentLang), desc: 'C1 - Học thuật/IELTS' },
                { key: 'exam_traps', label: translate('grammarDifficultyTraps', currentLang), desc: 'Bẫy đề thi hay gặp' }
              ].map(d => (
                <div
                  key={d.key}
                  onClick={() => setDifficulty(d.key as any)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: difficulty === d.key ? '2px solid #6366f1' : (isDark ? '1px solid #334155' : '1px solid #e2e8f0'),
                    background: difficulty === d.key ? (isDark ? 'rgba(99, 102, 241, 0.2)' : '#eef2ff') : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: difficulty === d.key ? '#6366f1' : (isDark ? '#f8fafc' : '#0f172a') }}>
                    {d.label}
                  </div>
                  <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', marginTop: 2 }}>
                    {d.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Setting 4: Save Mode */}
          <div style={{ 
            background: isDark ? '#1e293b' : '#f8fafc', 
            borderRadius: 12, 
            padding: '12px 16px', 
            marginBottom: 20,
            border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: isDark ? '#f8fafc' : '#0f172a' }}>
              {translate('grammarMode', currentLang)}
            </span>
            <Segmented
              value={genMode}
              onChange={(val) => setGenMode(val as 'append' | 'replace')}
              options={[
                { value: 'append', label: translate('grammarModeAppend', currentLang) },
                { value: 'replace', label: translate('grammarModeReplace', currentLang) }
              ]}
              style={{ background: isDark ? '#0f172a' : '#e2e8f0' }}
            />
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
            <span style={{ fontSize: 12.5, color: '#6366f1', fontWeight: 600 }}>
              {currentLang === 'vi' 
                ? `Tổng: ${mcCount} trắc nghiệm + ${transCount} dịch câu` 
                : `Total: ${mcCount} quiz + ${transCount} translations`}
            </span>
            <Space>
              <Button onClick={() => setIsGeneratorOpen(false)} disabled={isGenerating} style={{ borderRadius: 8 }}>
                {currentLang === 'vi' ? 'Hủy' : 'Cancel'}
              </Button>
              <Button
                type="primary"
                loading={isGenerating}
                icon={<Sparkles size={14} />}
                onClick={handleExecuteGenerate}
                style={{
                  borderRadius: 8,
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
                }}
              >
                {translate('grammarGenerateBtn', currentLang)}
              </Button>
            </Space>
          </div>
        </div>
      </Modal>
    </Modal>
  );
};
