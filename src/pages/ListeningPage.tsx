import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Button, 
  Tag, 
  Input, 
  Segmented, 
  Progress, 
  Select, 
  message, 
  Spin 
} from 'antd';
import { 
  Headphones, 
  RotateCcw, 
  CheckCircle, 
  Flame, 
  Volume2, 
  Sparkles, 
  ChevronRight, 
  Lightbulb, 
  Puzzle, 
  Award 
} from 'lucide-react';
import { Video } from 'lucide-react';
import { YouTubeListening } from '../components/YouTubeListening';
import { db } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { playAudio, playTaskCompleteChime } from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { generateListeningSentencesWithAI } from '../lib/translator';

type ListeningMode = 'dictation' | 'puzzle' | 'youtube';
type SentenceSource = 'vocab' | 'grammar' | 'ai';

interface SentenceItem {
  id: string;
  english: string;
  vietnamese?: string;
  sourceLabel: string;
  phoneticNotes?: string;
}

const AI_TOPICS = [
  { label: 'Giao tiếp hàng ngày (Daily Life)', value: 'Daily conversation and friendly chats' },
  { label: 'Công sở & Công việc (Workplace)', value: 'Office meetings, emails and professional work' },
  { label: 'Công nghệ & Kỹ thuật (Tech & IT)', value: 'Software engineering, tech products and innovation' },
  { label: 'Phỏng vấn xin việc (Job Interview)', value: 'Job interviews, strengths and career goals' },
  { label: 'Du lịch & Khách sạn (Travel)', value: 'Airports, hotels, restaurants and directions' },
];

function tokenizeWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function cleanWord(word: string): string {
  return word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'’]/g, '').trim();
}

export const ListeningPage: React.FC = () => {
  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  const words = useLiveQuery(() => db.words.toArray()) || [];
  const grammarNotes = useLiveQuery(() => db.grammar_notes.toArray()) || [];

  // Mode & Source state
  const [mode, setMode] = useState<ListeningMode>('youtube');
  const [source, setSource] = useState<SentenceSource>('vocab');
  const [selectedTopic, setSelectedTopic] = useState<string>(AI_TOPICS[0].value);
  const [speed, setSpeed] = useState<number>(0.9);

  // Play session state
  const [playlist, setPlaylist] = useState<SentenceItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [streak, setStreak] = useState(0);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // --- Dictation State ---
  const [typedSentence, setTypedSentence] = useState('');
  const [hasCheckedDictation, setHasCheckedDictation] = useState(false);
  const inputRef = useRef<any>(null);

  // --- Puzzle State ---
  const [shuffledChips, setShuffledChips] = useState<{ id: string; word: string; originalIndex: number }[]>([]);
  const [selectedChips, setSelectedChips] = useState<{ id: string; word: string; originalIndex: number }[]>([]);
  const [hasCheckedPuzzle, setHasCheckedPuzzle] = useState(false);
  const [puzzleCorrect, setPuzzleCorrect] = useState(false);

  const currentSentence = playlist[currentIndex] || null;

  // Build playlist when source or DB items change
  const buildPlaylistFromDB = () => {
    let items: SentenceItem[] = [];

    if (source === 'vocab') {
      const candidates = words.filter(w => w.example && w.example.trim().length > 10);
      items = candidates.map(w => ({
        id: w.id,
        english: w.example.trim(),
        vietnamese: w.meaning,
        sourceLabel: `${w.word}`
      }));
    } else if (source === 'grammar') {
      const candidates = grammarNotes.filter(g => g.example && g.example.trim().length > 10);
      items = candidates.map(g => {
        const firstEx = g.example.split('\n\n')[0] || g.example;
        const parts = firstEx.split('\n');
        return {
          id: g.id,
          english: parts[0]?.trim() || firstEx.trim(),
          vietnamese: parts[1]?.replace(/[()]/g, '').trim() || '',
          sourceLabel: g.title
        };
      });
    }

    // Shuffle candidates
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    setPlaylist(shuffled.slice(0, 15));
    setCurrentIndex(0);
    resetQuestionState();
  };

  // Generate playlist from AI
  const handleGenerateAISentences = async () => {
    setIsGeneratingAI(true);
    try {
      const aiList = await generateListeningSentencesWithAI(selectedTopic, 'B1-B2', 6);
      const items: SentenceItem[] = aiList.map((s, idx) => ({
        id: `ai-${idx}-${Date.now()}`,
        english: s.english,
        vietnamese: s.vietnamese,
        sourceLabel: s.level,
        phoneticNotes: s.phoneticNotes
      }));
      setPlaylist(items);
      setCurrentIndex(0);
      resetQuestionState();
      message.success(currentLang === 'vi' ? 'Đã tạo danh sách câu luyện nghe mới từ AI!' : 'Generated new AI listening set!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI Generation failed';
      message.error(msg);
    } finally {
      setIsGeneratingAI(false);
    }
  };

  useEffect(() => {
    if (source === 'ai') {
      handleGenerateAISentences();
    } else {
      buildPlaylistFromDB();
    }
  }, [source]);

  // Reset state when moving to a new sentence
  const resetQuestionState = () => {
    setTypedSentence('');
    setHasCheckedDictation(false);
    setSelectedChips([]);
    setHasCheckedPuzzle(false);
    setPuzzleCorrect(false);
  };

  // Initialize Puzzle chips when current sentence changes
  useEffect(() => {
    if (!currentSentence) return;
    resetQuestionState();

    const wordsArray = tokenizeWords(currentSentence.english);
    const chips = wordsArray.map((w, idx) => ({
      id: `${w}-${idx}-${Math.random()}`,
      word: w,
      originalIndex: idx
    }));
    // Shuffle chips
    const randomized = [...chips].sort(() => Math.random() - 0.5);
    setShuffledChips(randomized);

    // Auto-play audio on new sentence
    if (mode !== 'youtube') playAudio(currentSentence.english, speed);
  }, [currentIndex, currentSentence?.id]);

  // Play audio helper
  const handlePlayAudio = (overrideSpeed?: number) => {
    if (!currentSentence) return;
    setIsPlaying(true);
    playAudio(currentSentence.english, overrideSpeed || speed);
    setTimeout(() => setIsPlaying(false), 2000);
  };

  // Keyboard shortcut listener: Space to replay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (mode === 'youtube') return;
      // Don't intercept Space if user is typing in the input
      if (e.code === 'Space' && document.activeElement !== inputRef.current?.resizableTextArea?.textArea) {
        e.preventDefault();
        handlePlayAudio();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSentence, speed, mode]);

  // --- Dictation Diff Calculation ---
  const dictationDiff = useMemo(() => {
    if (!currentSentence || !hasCheckedDictation) return null;

    const originalTokens = tokenizeWords(currentSentence.english);
    const userTokens = tokenizeWords(typedSentence);

    let correctCount = 0;
    const diffTokens = originalTokens.map((orig, i) => {
      const userWord = userTokens[i] || '';
      const isMatch = cleanWord(orig) === cleanWord(userWord);
      if (isMatch) correctCount++;
      return {
        expected: orig,
        typed: userWord,
        isMatch
      };
    });

    const accuracy = Math.round((correctCount / Math.max(1, originalTokens.length)) * 100);
    return { diffTokens, accuracy, isPerfect: accuracy >= 90 };
  }, [currentSentence, typedSentence, hasCheckedDictation]);

  const handleCheckDictation = () => {
    if (!typedSentence.trim() || !currentSentence) return;
    setHasCheckedDictation(true);

    const originalTokens = tokenizeWords(currentSentence.english);
    const userTokens = tokenizeWords(typedSentence);
    let matched = 0;
    originalTokens.forEach((t, i) => {
      if (cleanWord(t) === cleanWord(userTokens[i] || '')) matched++;
    });
    const acc = matched / originalTokens.length;

    if (acc >= 0.85) {
      setStreak(prev => prev + 1);
      playTaskCompleteChime();
      message.success(currentLang === 'vi' ? 'Tuyệt vời! Bạn nghe rất chuẩn xác.' : 'Excellent listening!');
    } else {
      setStreak(0);
    }
  };

  // --- Puzzle Logic ---
  const handleAddChip = (chip: { id: string; word: string; originalIndex: number }) => {
    if (hasCheckedPuzzle) return;
    setShuffledChips(prev => prev.filter(c => c.id !== chip.id));
    setSelectedChips(prev => [...prev, chip]);
  };

  const handleRemoveChip = (chip: { id: string; word: string; originalIndex: number }) => {
    if (hasCheckedPuzzle) return;
    setSelectedChips(prev => prev.filter(c => c.id !== chip.id));
    setShuffledChips(prev => [...prev, chip]);
  };

  const handleCheckPuzzle = () => {
    if (!currentSentence) return;
    const originalTokens = tokenizeWords(currentSentence.english);
    const assembledTokens = selectedChips.map(c => c.word);

    const isMatch = originalTokens.length === assembledTokens.length &&
      originalTokens.every((w, i) => cleanWord(w) === cleanWord(assembledTokens[i]));

    setHasCheckedPuzzle(true);
    setPuzzleCorrect(isMatch);

    if (isMatch) {
      setStreak(prev => prev + 1);
      playTaskCompleteChime();
      message.success(currentLang === 'vi' ? 'Ghép câu hoàn toàn chính xác! 🎯' : 'Perfect word order! 🎯');
    } else {
      setStreak(0);
      message.error(currentLang === 'vi' ? 'Thứ tự từ chưa chính xác! Hãy nghe kỹ lại nhé.' : 'Incorrect order, listen again.');
    }
  };

  const handleNextSentence = () => {
    if (currentIndex < playlist.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      message.info(currentLang === 'vi' ? 'Đã hoàn thành vòng luyện nghe!' : 'Listening session completed!');
      setCurrentIndex(0);
    }
  };

  // Auto-detect linking sound highlights
  const linkingSoundTips = useMemo(() => {
    if (!currentSentence) return [];
    const tokens = tokenizeWords(currentSentence.english);
    const tips: string[] = [];

    for (let i = 0; i < tokens.length - 1; i++) {
      const cur = cleanWord(tokens[i]);
      const next = cleanWord(tokens[i + 1]);
      if (!cur || !next) continue;

      const lastChar = cur[cur.length - 1];
      const firstChar = next[0];

      // Consonant to vowel linking
      if (!'aeiou'.includes(lastChar) && 'aeiou'.includes(firstChar)) {
        tips.push(`Nối âm: "${tokens[i]} ${tokens[i + 1]}" ➔ /${lastChar}${firstChar}/`);
      }

      // Reductions
      if (cur === 'going' && next === 'to') tips.push(`Giảm âm: "going to" thường nói nhanh thành "gonna"`);
      if (cur === 'want' && next === 'to') tips.push(`Giảm âm: "want to" thường nói thành "wanna"`);
      if (cur === 'kind' && next === 'of') tips.push(`Giảm âm: "kind of" ➔ "kinda"`);
    }

    if (currentSentence.phoneticNotes) {
      tips.push(currentSentence.phoneticNotes);
    }

    return Array.from(new Set(tips)).slice(0, 3);
  }, [currentSentence]);

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', animation: 'fadeIn 0.35s ease' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: 24, display: 'flex', alignItems: 'center', gap: 10, color: isDark ? '#f8fafc' : '#0f172a' }}>
            <Headphones size={26} color="#0284c7" />
            {translate('listeningTitle', currentLang)}
            {streak > 0 && (
              <Tag color="#ea580c" style={{ borderRadius: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Flame size={12} />
                {streak} {translate('listeningComboStreak', currentLang)}
              </Tag>
            )}
          </h2>
          <p style={{ margin: '6px 0 0 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: 14 }}>
            {translate('listeningDesc', currentLang)}
          </p>
        </div>

        {/* Mode Switcher */}
        <Segmented
          value={mode}
          onChange={(val) => setMode(val as ListeningMode)}
          options={[
            { value: 'dictation', icon: <Headphones size={14} />, label: translate('listeningModeDictation', currentLang) },
            { value: 'puzzle', icon: <Puzzle size={14} />, label: translate('listeningModePuzzle', currentLang) },
            { value: 'youtube', icon: <Video size={14} />, label: currentLang === 'vi' ? 'Video YouTube' : 'YouTube videos' }
          ]}
          style={{ background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#f1f5f9', fontWeight: 600 }}
        />
      </div>

      {mode === 'youtube' ? <YouTubeListening language={currentLang} /> : <>
      {/* Control Bar: Sources & Speed */}
      <div className="bento-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
          {/* Source Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#cbd5e1' : '#475569' }}>
              {currentLang === 'vi' ? 'Nguồn bài nghe:' : 'Audio Source:'}
            </span>
            <Segmented
              value={source}
              onChange={(val) => setSource(val as SentenceSource)}
              options={[
                { value: 'vocab', label: `${translate('listeningSourceVocab', currentLang)} (${words.filter(w => w.example).length})` },
                { value: 'grammar', label: `${translate('listeningSourceGrammar', currentLang)} (${grammarNotes.filter(g => g.example).length})` },
                { value: 'ai', icon: <Sparkles size={12} color="#8b5cf6" />, label: translate('listeningSourceAI', currentLang) }
              ]}
              style={{ background: isDark ? 'rgba(15, 23, 42, 0.6)' : '#e2e8f0' }}
            />

            {source === 'ai' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Select
                  value={selectedTopic}
                  onChange={(val) => setSelectedTopic(val)}
                  options={AI_TOPICS}
                  style={{ width: 220 }}
                />
                <Button
                  size="small"
                  type="primary"
                  icon={isGeneratingAI ? <Spin size="small" /> : <Sparkles size={12} />}
                  onClick={handleGenerateAISentences}
                  disabled={isGeneratingAI}
                  style={{ borderRadius: 6, fontWeight: 600, background: '#8b5cf6', border: 'none' }}
                >
                  {currentLang === 'vi' ? 'Tạo mới' : 'Generate'}
                </Button>
              </div>
            )}
          </div>

          {/* Speed Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: isDark ? '#94a3b8' : '#64748b' }}>
              {currentLang === 'vi' ? 'Tốc độ:' : 'Speed:'}
            </span>
            {[
              { val: 0.75, label: translate('listeningSpeedSlow', currentLang) },
              { val: 0.9, label: translate('listeningSpeedNormal', currentLang) },
              { val: 1.25, label: translate('listeningSpeedFast', currentLang) },
            ].map(s => (
              <Button
                key={s.val}
                size="small"
                type={speed === s.val ? 'primary' : 'default'}
                onClick={() => setSpeed(s.val)}
                style={{ borderRadius: 6, fontWeight: 600, fontSize: 12 }}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Practice Canvas */}
      {!currentSentence ? (
        <div className="bento-card" style={{ padding: 48, textAlign: 'center' }}>
          <Headphones size={48} color="#94a3b8" style={{ margin: '0 auto 16px auto' }} />
          <h3 style={{ margin: 0, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {currentLang === 'vi' ? 'Chưa có câu nào trong danh sách' : 'No sentences available'}
          </h3>
          <p style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 13.5, margin: '8px 0 20px 0' }}>
            {source === 'ai' 
              ? (currentLang === 'vi' ? 'Bấm tạo mới bên trên để AI sinh các câu luyện nghe chuẩn bản xứ.' : 'Click Generate above to create AI listening sentences.')
              : (currentLang === 'vi' ? 'Hãy thêm từ vựng hoặc cấu trúc ngữ pháp có câu ví dụ để luyện nghe nhé!' : 'Add vocabulary or grammar notes with example sentences to practice.')}
          </p>
        </div>
      ) : (
        <div className="bento-card" style={{ padding: '28px 32px' }}>
          {/* Progress Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 700 }}>
                {currentSentence.sourceLabel}
              </Tag>
              <span style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>
                {currentIndex + 1} / {playlist.length}
              </span>
            </div>

            <Progress
              percent={Math.round(((currentIndex + 1) / playlist.length) * 100)}
              showInfo={false}
              strokeColor="#0284c7"
              style={{ width: 140, margin: 0 }}
            />
          </div>

          {/* Audio Player Hub */}
          <div style={{
            background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(241, 245, 249, 0.9)',
            borderRadius: 18,
            padding: '24px 28px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {/* Primary Play / Replay Button */}
              <button
                onClick={() => handlePlayAudio()}
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  border: 'none',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 6px 18px rgba(2, 132, 199, 0.35)',
                  transition: 'all 0.2s ease',
                  transform: isPlaying ? 'scale(0.96)' : 'scale(1)'
                }}
              >
                <Volume2 size={26} />
              </button>

              <div>
                <strong style={{ fontSize: 16, color: isDark ? '#f8fafc' : '#0f172a', display: 'block' }}>
                  {translate('listeningPlayAgain', currentLang)}
                </strong>
                <span style={{ fontSize: 12.5, color: isDark ? '#94a3b8' : '#64748b' }}>
                  {currentLang === 'vi' ? 'Nhấn phím Space để nghe lại bất kỳ lúc nào' : 'Press Space to replay anytime'}
                </span>
              </div>
            </div>

            {/* Quick Slow Audio Button */}
            <Button
              icon={<RotateCcw size={14} />}
              onClick={() => handlePlayAudio(0.65)}
              style={{ borderRadius: 10, fontWeight: 600, height: 36 }}
            >
              {translate('listeningPlaySlowWord', currentLang)} (0.65x)
            </Button>
          </div>

          {/* Mode 1: Smart Dictation */}
          {mode === 'dictation' && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#cbd5e1' : '#334155' }}>
                  {currentLang === 'vi' ? 'Gõ lại những gì bạn nghe được:' : 'Type what you hear:'}
                </span>
              </div>

              <Input.TextArea
                ref={inputRef}
                rows={3}
                value={typedSentence}
                onChange={(e) => setTypedSentence(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!hasCheckedDictation) handleCheckDictation();
                  }
                }}
                disabled={hasCheckedDictation}
                placeholder={currentLang === 'vi' ? 'Nghe và gõ lại câu tiếng Anh tại đây rồi nhấn Enter...' : 'Listen and type English sentence here, then press Enter...'}
                style={{
                  borderRadius: 14,
                  fontSize: 15,
                  padding: '14px 16px',
                  marginBottom: 16
                }}
              />

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginBottom: 20 }}>
                {!hasCheckedDictation ? (
                  <Button
                    type="primary"
                    disabled={!typedSentence.trim()}
                    onClick={handleCheckDictation}
                    style={{
                      borderRadius: 10,
                      fontWeight: 700,
                      height: 38,
                      padding: '0 22px',
                      background: '#0284c7'
                    }}
                  >
                    {translate('listeningCheckBtn', currentLang)}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<ChevronRight size={15} />}
                    onClick={handleNextSentence}
                    style={{
                      borderRadius: 10,
                      fontWeight: 700,
                      height: 38,
                      padding: '0 22px',
                      background: '#6366f1'
                    }}
                  >
                    {translate('listeningNextBtn', currentLang)}
                  </Button>
                )}
              </div>

              {/* Dictation Word Diff Result */}
              {hasCheckedDictation && dictationDiff && (
                <div style={{
                  background: isDark ? 'rgba(15, 23, 42, 0.9)' : '#ffffff',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #e2e8f0',
                  borderRadius: 16,
                  padding: '20px 24px',
                  animation: 'fadeIn 0.3s ease'
                }}>
                  {/* Accuracy Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: isDark ? '1px solid #1e293b' : '1px solid #f1f5f9', paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {dictationDiff.isPerfect ? (
                        <CheckCircle size={20} color="#22c55e" />
                      ) : (
                        <Award size={20} color="#f59e0b" />
                      )}
                      <span style={{ fontSize: 16, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a' }}>
                        {translate('listeningAccuracy', currentLang)}: {dictationDiff.accuracy}%
                      </span>
                    </div>

                    <Tag 
                      color={dictationDiff.isPerfect ? 'success' : 'warning'} 
                      style={{ borderRadius: 8, fontWeight: 700 }}
                    >
                      {dictationDiff.isPerfect ? 'Xuất sắc' : 'Cần cải thiện'}
                    </Tag>
                  </div>

                  {/* Word by Word Diff Highlight */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                      {currentLang === 'vi' ? 'So sánh chi tiết từng từ:' : 'Word-by-word comparison:'}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, lineHeight: 2 }}>
                      {dictationDiff.diffTokens.map((item, idx) => (
                        <span
                          key={idx}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: 14.5,
                            background: item.isMatch 
                              ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7') 
                              : (isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'),
                            color: item.isMatch 
                              ? (isDark ? '#86efac' : '#15803d') 
                              : (isDark ? '#fca5a5' : '#b91c1c'),
                            border: item.isMatch ? '1px solid #86efac' : '1px solid #fca5a5'
                          }}
                        >
                          {item.expected}
                          {!item.isMatch && item.typed && (
                            <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4, textDecoration: 'line-through' }}>
                              ({item.typed})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Vietnamese Meaning */}
                  {currentSentence.vietnamese && (
                    <div style={{ fontSize: 13.5, color: isDark ? '#94a3b8' : '#64748b', fontStyle: 'italic', marginBottom: 12 }}>
                      Nghĩa: {currentSentence.vietnamese}
                    </div>
                  )}

                  {/* Phonetic / Linking Sounds Advice */}
                  {linkingSoundTips.length > 0 && (
                    <div style={{
                      background: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
                      border: isDark ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid #fef3c7',
                      borderRadius: 12,
                      padding: '12px 16px',
                      fontSize: 13,
                      color: isDark ? '#fde68a' : '#92400e'
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Lightbulb size={14} color="#f59e0b" />
                        {translate('listeningPhoneticTips', currentLang)}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {linkingSoundTips.map((tip, idx) => (
                          <div key={idx}>• {tip}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mode 2: Audio Word Puzzle */}
          {mode === 'puzzle' && (
            <div>
              {/* Assembled Sentence Box */}
              <div style={{
                minHeight: 80,
                background: isDark ? 'rgba(15, 23, 42, 0.6)' : '#f8fafc',
                border: isDark ? '2px dashed rgba(255, 255, 255, 0.15)' : '2px dashed #cbd5e1',
                borderRadius: 16,
                padding: '16px 20px',
                marginBottom: 20,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                alignItems: 'center'
              }}>
                {selectedChips.length === 0 ? (
                  <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontSize: 14 }}>
                    {currentLang === 'vi' ? 'Bấm vào các từ bên dưới theo đúng thứ tự vừa nghe...' : 'Click the words below in the order you heard...'}
                  </span>
                ) : (
                  selectedChips.map(chip => (
                    <span
                      key={chip.id}
                      onClick={() => handleRemoveChip(chip)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: 10,
                        background: hasCheckedPuzzle 
                          ? (puzzleCorrect ? '#22c55e' : '#ef4444')
                          : (isDark ? '#334155' : '#0284c7'),
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: 15,
                        cursor: hasCheckedPuzzle ? 'default' : 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {chip.word}
                    </span>
                  ))
                )}
              </div>

              {/* Shuffled Word Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 24, minHeight: 60 }}>
                {shuffledChips.map(chip => (
                  <button
                    key={chip.id}
                    onClick={() => handleAddChip(chip)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#ffffff',
                      border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                      color: isDark ? '#f8fafc' : '#0f172a',
                      fontWeight: 700,
                      fontSize: 14.5,
                      cursor: 'pointer',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {chip.word}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                {!hasCheckedPuzzle ? (
                  <Button
                    type="primary"
                    disabled={selectedChips.length === 0}
                    onClick={handleCheckPuzzle}
                    style={{
                      borderRadius: 10,
                      fontWeight: 700,
                      height: 38,
                      padding: '0 22px',
                      background: '#0284c7'
                    }}
                  >
                    {translate('grammarSubmitAnswer', currentLang)}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<ChevronRight size={15} />}
                    onClick={handleNextSentence}
                    style={{
                      borderRadius: 10,
                      fontWeight: 700,
                      height: 38,
                      padding: '0 22px',
                      background: '#6366f1'
                    }}
                  >
                    {translate('listeningNextBtn', currentLang)}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      </>}
    </div>
  );
};
