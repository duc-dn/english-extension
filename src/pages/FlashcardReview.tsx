import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Space, Tag, Select, notification, Progress, Card, Row, Col, List } from 'antd';
import { getWordsToReview, getAllTags, updateWordReview, getReviewIntervalMinutes, type ReviewScore, type Word } from '../lib/db';
import { Check, ArrowRight, Filter, Volume2, Award, Zap, Layers, Mic, MicOff, BookOpen, ExternalLink } from 'lucide-react';
import { playAudio } from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { VoiceRecognitionService, evaluatePronunciation, type PronunciationScore } from '../lib/speechRecognition';

const { Title, Text } = Typography;

const getIntervalLabel = (level: number, score: ReviewScore, lang: 'vi' | 'en') => {
  const minutes = getReviewIntervalMinutes(level, score);
  if (minutes < 60) return lang === 'vi' ? `${minutes} phút` : `${minutes} min`;
  if (minutes < 1440) return lang === 'vi' ? `${Math.round(minutes / 60)} giờ` : `${Math.round(minutes / 60)} hr`;
  const days = minutes / 1440;
  return lang === 'vi' ? `${days} ngày` : `${days} days`;
};

export const FlashcardReview: React.FC = () => {
  const navigate = useNavigate();
  const [reviewQueue, setReviewQueue] = useState<Word[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [promotions, setPromotions] = useState<{ word: string; oldStatus: string; newStatus: string }[]>([]);
  const isScoringRef = useRef(false);

  // Speaking evaluation state
  const [isListening, setIsListening] = useState(false);
  const [speakingResult, setSpeakingResult] = useState<PronunciationScore | null>(null);
  const voiceServiceRef = useRef<VoiceRecognitionService | null>(null);

  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    voiceServiceRef.current = new VoiceRecognitionService();
  }, []);

  const handleStartSpeaking = (targetWord: string) => {
    if (!voiceServiceRef.current || !voiceServiceRef.current.isSupported()) {
      notification.warning({
        message: currentLang === 'vi' ? 'Chưa hỗ trợ Micro' : 'Mic not supported',
        description: currentLang === 'vi' ? 'Trình duyệt chưa hỗ trợ Web Speech API.' : 'Web Speech API is not supported.'
      });
      return;
    }

    setIsListening(true);
    setSpeakingResult(null);

    voiceServiceRef.current.startListening(
      (transcript) => {
        const evalResult = evaluatePronunciation(targetWord, transcript, currentLang);
        setSpeakingResult(evalResult);
        setIsListening(false);
      },
      (err) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      },
      () => {
        setIsListening(false);
      }
    );
  };

  useEffect(() => {
    const fetchTags = async () => {
      const tags = await getAllTags();
      setAllTags(tags);
    };
    fetchTags();
  }, []);

  const [isStarted, setIsStarted] = useState(false);
  const [tagWordCount, setTagWordCount] = useState(0);

  const fetchQueue = async () => {
    const words = await getWordsToReview(selectedTag);
    setReviewQueue(words);
    setCurrentIndex(0);
    setIsFlipped(false);
    setSessionStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setPromotions([]);
  };

  useEffect(() => {
    const updateCount = async () => {
      const words = await getWordsToReview(selectedTag);
      setTagWordCount(words.length);
    };
    updateCount();
  }, [selectedTag]);

  const currentWord = reviewQueue[currentIndex];

  const handleScore = useCallback(async (score: ReviewScore) => {
    if (!currentWord || isScoringRef.current) return;
    isScoringRef.current = true;
    try {
      const result = await updateWordReview(currentWord.id, score);
      setSessionStats(prev => ({
        ...prev,
        [score]: prev[score] + 1
      }));
      if (result && result.newStatus !== result.oldStatus) {
        setPromotions(prev => [
          ...prev,
          { word: currentWord.word, oldStatus: result.oldStatus, newStatus: result.newStatus }
        ]);
      }
    } catch {
      isScoringRef.current = false;
      notification.error({ message: currentLang === 'vi' ? 'Không lưu được lượt ôn.' : 'Could not save review.' });
      return;
    }
    
    let title = '';
    let msg = '';
    if (score === 'again') { 
      title = translate('btnIncorrect', currentLang); 
      msg = currentLang === 'vi' ? 'Đừng nản lòng! 💪' : 'Keep pushing! 💪'; 
    } else if (score === 'hard') { 
      title = translate('btnHard', currentLang); 
      msg = currentLang === 'vi' ? 'Sắp được rồi! 🧗' : 'You are getting there! 🧗'; 
    } else if (score === 'good') { 
      title = translate('btnGood', currentLang); 
      msg = currentLang === 'vi' ? 'Nhớ rất tốt! 🧠' : 'Solid memory! 🧠'; 
    } else if (score === 'easy') { 
      title = translate('btnEasy', currentLang); 
      msg = currentLang === 'vi' ? 'Dễ như ăn bánh! 🍰' : 'Piece of cake! 🍰'; 
    }

    notification.success({ 
      message: `${currentLang === 'vi' ? 'Đánh giá' : 'Rating'}: ${title}`,
      description: msg,
      key: 'flashcard-score', 
      placement: 'topRight',
      duration: 1.5 
    });

    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
      isScoringRef.current = false;
    }, 300); // Wait for flip back animation before showing next card
  }, [currentWord, currentLang]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (currentIndex >= reviewQueue.length || reviewQueue.length === 0) {
        return;
      }

      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        if (!isFlipped) {
          setIsFlipped(true);
        }
      } else if (isFlipped) {
        if (e.key === '1') {
          handleScore('again');
        } else if (e.key === '2') {
          handleScore('hard');
        } else if (e.key === '3') {
          handleScore('good');
        } else if (e.key === '4') {
          handleScore('easy');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFlipped, currentIndex, reviewQueue, handleScore]);

  const renderContent = () => {
    if (reviewQueue.length === 0) {
      return (
        <Card 
          className="premium-flashcard" 
          style={{ width: 450, textAlign: 'center', padding: '40px 24px' }} 
          bordered={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Glowing checkmark container */}
            <div style={{ 
              width: 88, 
              height: 88, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(52, 211, 153, 0.12) 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: 'inset 0 0 12px rgba(16, 185, 129, 0.05)'
            }}>
              <Check size={40} color="#10b981" />
            </div>

            <div>
              <Title level={3} style={{ fontWeight: 800, color: isDark ? '#f8fafc' : '#1e293b', margin: '0 0 8px 0' }}>
                {translate('noWordsToReview', currentLang)}
              </Title>
              <Text style={{ display: 'block', fontSize: 14, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.6 }}>
                {selectedTag === 'all'
                  ? translate('noWordsToReview', currentLang)
                  : translate('noWordsToReviewTag', currentLang, { tag: selectedTag })}
              </Text>
            </div>

            <Button 
              type="primary" 
              onClick={() => navigate('/vocabulary')}
              style={{ 
                borderRadius: 8, 
                fontWeight: 600, 
                fontSize: 13,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                border: 'none', 
                height: 34, 
                padding: '0 20px',
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.25)'
              }}
            >
              {translate('btnAddNewWord', currentLang)} 🚀
            </Button>
          </div>
        </Card>
      );
    }

    if (currentIndex >= reviewQueue.length) {
      const statusColorMap: Record<string, string> = {
        new: 'blue',
        learning: 'orange',
        reviewing: 'geekblue',
        mastered: 'green'
      };

      return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', animation: 'fadeIn 0.5s' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', marginBottom: 24 }}>
            <div style={{ padding: 20, background: '#f5f3ff', borderRadius: '50%', marginBottom: 16 }}>
              <Award size={48} color="#8b5cf6" />
            </div>
            <Title level={2} style={{ fontWeight: 700, margin: 0 }}>
              {translate('sessionCompleted', currentLang)}
            </Title>
            <Text style={{ fontSize: 15, color: '#64748b', marginTop: 8 }}>
              {translate('sessionCompletedDesc', currentLang, { count: reviewQueue.length })}
            </Text>
          </div>

          <Row gutter={[16, 16]} style={{ width: '100%', maxWidth: 800, margin: '0 auto', flex: 1 }}>
            <Col xs={24} md={12}>
              <Card title={<span style={{ fontWeight: 600 }}>{translate('evaluationDistribution', currentLang)}</span>} bordered={false} className="glass-card" style={{ height: '100%' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text strong style={{ color: '#ef4444' }}>{translate('btnIncorrect', currentLang)}</Text>
                      <Text>{sessionStats.again} ({Math.round(sessionStats.again / reviewQueue.length * 100) || 0}%)</Text>
                    </div>
                    <Progress percent={Math.round(sessionStats.again / reviewQueue.length * 100) || 0} strokeColor="#ef4444" showInfo={false} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text strong style={{ color: '#f97316' }}>{translate('btnHard', currentLang)}</Text>
                      <Text>{sessionStats.hard} ({Math.round(sessionStats.hard / reviewQueue.length * 100) || 0}%)</Text>
                    </div>
                    <Progress percent={Math.round(sessionStats.hard / reviewQueue.length * 100) || 0} strokeColor="#f97316" showInfo={false} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text strong style={{ color: '#3b82f6' }}>{translate('btnGood', currentLang)}</Text>
                      <Text>{sessionStats.good} ({Math.round(sessionStats.good / reviewQueue.length * 100) || 0}%)</Text>
                    </div>
                    <Progress percent={Math.round(sessionStats.good / reviewQueue.length * 100) || 0} strokeColor="#3b82f6" showInfo={false} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text strong style={{ color: '#10b981' }}>{translate('btnEasy', currentLang)}</Text>
                      <Text>{sessionStats.easy} ({Math.round(sessionStats.easy / reviewQueue.length * 100) || 0}%)</Text>
                    </div>
                    <Progress percent={Math.round(sessionStats.easy / reviewQueue.length * 100) || 0} strokeColor="#10b981" showInfo={false} />
                  </div>
                </div>
              </Card>
            </Col>

            <Col xs={24} md={12}>
              <Card title={<span style={{ fontWeight: 600 }}>{translate('levelPromotion', currentLang)}</span>} bordered={false} className="glass-card" style={{ height: '100%' }}>
                {promotions.length === 0 ? (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: 180, flexDirection: 'column', textAlign: 'center' }}>
                    <Zap size={28} color="#94a3b8" style={{ marginBottom: 12 }} />
                    <Text type="secondary" style={{ display: 'block' }}>{translate('noPromotion', currentLang)}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{translate('continueReviewPromotion', currentLang)}</Text>
                  </div>
                ) : (
                  <List
                    itemLayout="horizontal"
                    dataSource={promotions}
                    style={{ overflowY: 'auto', maxHeight: 200 }}
                    renderItem={item => (
                      <List.Item style={{ padding: '8px 0' }}>
                        <List.Item.Meta
                          title={<span style={{ fontWeight: 600, color: '#1e293b' }}>{item.word}</span>}
                          description={
                            <Space size="small">
                              <Tag color={statusColorMap[item.oldStatus]} style={{ margin: 0, fontSize: 10 }}>{item.oldStatus.toUpperCase()}</Tag>
                              <ArrowRight size={10} color="#64748b" />
                              <Tag color={statusColorMap[item.newStatus]} style={{ margin: 0, fontSize: 10 }}>{item.newStatus.toUpperCase()}</Tag>
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Card>
            </Col>
          </Row>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, marginBottom: 16 }}>
            <Button 
              onClick={() => setIsStarted(false)} 
              style={{ borderRadius: 8, padding: '0 18px', height: 34, fontSize: 13, fontWeight: 600 }}
            >
              {translate('otherTopic', currentLang)}
            </Button>
            <Button 
              type="primary" 
              onClick={fetchQueue} 
              style={{ borderRadius: 8, padding: '0 18px', height: 34, fontSize: 13, fontWeight: 600, background: '#4f46e5', border: 'none', boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)' }}
            >
              {translate('reviewThisTopic', currentLang)}
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
        {/* Progress Bar */}
        <div style={{ width: '100%', maxWidth: 450, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px' }}>
              {translate('reviewProgressTitle', currentLang)}
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>
              {currentIndex} / {reviewQueue.length}
            </Text>
          </div>
          <Progress 
            percent={Math.round((currentIndex / reviewQueue.length) * 100)} 
            strokeColor="#4f46e5"
            showInfo={false} 
            status="active"
            style={{ margin: 0 }}
          />
        </div>

        <Text style={{ marginBottom: 16, color: '#94a3b8', fontWeight: 600, letterSpacing: '1px', fontSize: 11 }}>
          {translate('currentCardTitle', currentLang, { index: currentIndex + 1 })}
        </Text>
        
        <div 
          className={`flip-card-container hover-lift ${isFlipped ? 'flipped' : ''}`}
          style={{ width: 480, minHeight: 350, cursor: isFlipped ? 'default' : 'pointer' }}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          <div className="flip-card-inner">
            {/* Front of Card */}
            <div className="flip-card-front premium-flashcard" style={{ padding: '28px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
                <Title level={1} style={{ fontSize: '2.8rem', margin: 0, fontWeight: 700, letterSpacing: '-0.5px', color: isDark ? '#f8fafc' : '#0f172a', fontFamily: '"Lora", Georgia, serif' }}>
                  {currentWord.word}
                </Title>
                <Button 
                  type="text" 
                  shape="circle" 
                  icon={<Volume2 size={24} color="#4f46e5" />} 
                  onClick={(e) => { e.stopPropagation(); playAudio(currentWord.word); }} 
                  title="Phát âm chuẩn"
                />
                <Button 
                  type={isListening ? 'primary' : 'default'}
                  danger={isListening}
                  shape="circle" 
                  icon={isListening ? <MicOff size={20} /> : <Mic size={20} color="#8b5cf6" />} 
                  onClick={(e) => { e.stopPropagation(); handleStartSpeaking(currentWord.word); }} 
                  title="Luyện phát âm (Speaking Practice)"
                  style={{ borderColor: '#8b5cf6' }}
                />
              </div>

              {currentWord.phonetic && (
                <Text style={{ fontSize: '1.3rem', color: isDark ? '#cbd5e1' : '#64748b', marginTop: 6, display: 'block' }}>
                  {currentWord.phonetic}
                </Text>
              )}

              {/* Speaking result banner */}
              {isListening && (
                <div style={{ marginTop: 12, padding: '6px 14px', borderRadius: 20, background: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2', color: isDark ? '#fca5a5' : '#dc2626', fontSize: 13, fontWeight: 600 }}>
                  🎙️ {currentLang === 'vi' ? 'Đang lắng nghe... Hãy phát âm từ này!' : 'Listening... Say this word!'}
                </div>
              )}

              {speakingResult && (
                <div style={{
                  marginTop: 12,
                  padding: '8px 16px',
                  borderRadius: 12,
                  background: speakingResult.matched 
                    ? (isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)')
                    : (isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.1)'),
                  border: `1px solid ${speakingResult.matched ? '#10b981' : '#ef4444'}`,
                  textAlign: 'center'
                }}>
                  <div style={{ fontWeight: 700, color: speakingResult.matched ? '#10b981' : '#ef4444', fontSize: 14 }}>
                    🎯 {speakingResult.score}% • {speakingResult.feedback}
                  </div>
                  <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', marginTop: 2 }}>
                    {currentLang === 'vi' ? 'Bạn đã nói:' : 'You said:'} <em>"{speakingResult.transcript}"</em>
                  </div>
                </div>
              )}

              {currentWord.tags && currentWord.tags.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {(currentWord.tags || []).map(tag => (
                    <Tag key={tag} color="geekblue" style={{ margin: 0, borderRadius: 12 }}>#{tag}</Tag>
                  ))}
                </div>
              )}

              {/* Context preview on front */}
              {(currentWord.contextSentence || currentWord.example) && (
                <div style={{
                  marginTop: 14,
                  fontSize: 13,
                  color: isDark ? '#cbd5e1' : '#64748b',
                  fontStyle: 'italic',
                  background: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0,0,0,0.02)',
                  padding: '8px 12px',
                  borderRadius: 8,
                  maxWidth: '90%',
                  lineHeight: 1.4
                }}>
                  "{currentWord.contextSentence || currentWord.example}"
                </div>
              )}

              <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', color: isDark ? '#94a3b8' : '#64748b', gap: 8 }}>
                <Text style={{ fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>{translate('clickToFlip', currentLang)}</Text>
                <ArrowRight size={16} />
              </div>
            </div>
            
            {/* Back of Card */}
            <div className="flip-card-back premium-flashcard" style={{ padding: '28px 24px', boxSizing: 'border-box' }}>
              <Title level={2} style={{ color: isDark ? '#818cf8' : '#4f46e5', marginTop: 0, marginBottom: 8, fontSize: '2.2rem', textAlign: 'center', fontWeight: 700 }}>
                {currentWord.meaning || 'Chưa dịch'}
              </Title>

              {currentWord.description && (
                <div style={{ fontSize: '1.1rem', color: isDark ? '#cbd5e1' : '#64748b', marginBottom: 12, textAlign: 'center', whiteSpace: 'pre-wrap', maxHeight: '80px', overflowY: 'auto' }}>
                  {currentWord.description}
                </div>
              )}

              {/* Original Context & Source URL */}
              {(currentWord.contextSentence || currentWord.example) && (
                <div style={{
                  fontSize: '13px',
                  color: isDark ? '#f8fafc' : '#334155',
                  background: isDark ? 'rgba(79, 70, 229, 0.12)' : 'rgba(79, 70, 229, 0.06)',
                  border: isDark ? '1px solid rgba(79, 70, 229, 0.25)' : '1px solid rgba(79, 70, 229, 0.15)',
                  borderRadius: 10,
                  padding: '10px 14px',
                  margin: '10px 0',
                  textAlign: 'left',
                  lineHeight: 1.5,
                  width: '100%'
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? '#a5b4fc' : '#4f46e5', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <BookOpen size={13} /> {currentLang === 'vi' ? 'Ngữ cảnh gốc khi đọc web:' : 'Original Context:'}
                  </div>
                  <div style={{ fontStyle: 'italic', color: isDark ? '#f8fafc' : '#0f172a', fontFamily: '"Lora", Georgia, serif', fontSize: '14px', lineHeight: 1.6 }}>
                    "{currentWord.contextSentence || currentWord.example}"
                  </div>
                  {currentWord.sourceUrl && (
                    <div style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#64748b', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ExternalLink size={11} />
                      <a href={currentWord.sourceUrl} target="_blank" rel="noreferrer" style={{ color: isDark ? '#60a5fa' : '#2563eb', textDecoration: 'underline' }}>
                        {currentWord.sourceTitle || currentWord.sourceUrl}
                      </a>
                    </div>
                  )}
                </div>
              )}

              <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {(currentWord.tags || []).map(tag => (
                  <Tag key={tag} color={tag === 'it' || tag === 'tech' ? 'purple' : 'geekblue'} style={{ borderRadius: 16, padding: '2px 10px', border: 'none' }}>
                    #{tag}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Keyboard shortcut instructions helper */}
        <div style={{ marginTop: 16, height: 24 }}>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 500, color: '#94a3b8' }}>
            {!isFlipped 
              ? translate('shortcutFlipHint', currentLang) 
              : translate('shortcutRateHint', currentLang)}
          </Text>
        </div>

        <div style={{ marginTop: 24, height: 60 }}>
          {isFlipped && (
            <Space size="middle" style={{ animation: 'fadeIn 0.4s ease' }}>
              <button 
                className="srs-btn again"
                onClick={() => handleScore('again')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnIncorrect', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>{currentLang === 'vi' ? 'Phím' : 'Key'} [1] • {getIntervalLabel(currentWord.review_level, 'again', currentLang)}</span>
              </button>
              <button 
                className="srs-btn hard"
                onClick={() => handleScore('hard')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnHard', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>{currentLang === 'vi' ? 'Phím' : 'Key'} [2] • {getIntervalLabel(currentWord.review_level, 'hard', currentLang)}</span>
              </button>
              <button 
                className="srs-btn good"
                onClick={() => handleScore('good')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnGood', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>{currentLang === 'vi' ? 'Phím' : 'Key'} [3] • {getIntervalLabel(currentWord.review_level, 'good', currentLang)}</span>
              </button>
              <button 
                className="srs-btn easy"
                onClick={() => handleScore('easy')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnEasy', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>{currentLang === 'vi' ? 'Phím' : 'Key'} [4] • {getIntervalLabel(currentWord.review_level, 'easy', currentLang)}</span>
              </button>
            </Space>
          )}
        </div>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  };

  if (!isStarted) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', animation: 'fadeIn 0.5s' }}>
        <Card 
          className="premium-flashcard" 
          style={{ width: 480, padding: '40px 24px', textAlign: 'center' }} 
          bordered={false}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Focused Icon */}
            <div style={{ 
              width: 72, 
              height: 72, 
              borderRadius: '50%', 
              background: 'rgba(79, 70, 229, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
            }}>
              <Layers size={32} color="#4f46e5" />
            </div>

            <div>
              <Title level={3} style={{ fontWeight: 800, margin: '0 0 8px 0' }}>
                {translate('flashcardTitle', currentLang)}
              </Title>
              <Text style={{ display: 'block', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                {translate('reviewDesc', currentLang)}
              </Text>
            </div>

            <div style={{ width: '100%', padding: '16px 20px', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }} className="flashcard-selector-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{translate('reviewSelectorLabel', currentLang)}</span>
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{translate('dueForReviewToday', currentLang)}</span>
                <Tag color={tagWordCount > 0 ? "warning" : "success"} style={{ fontSize: 13, borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>
                  {tagWordCount} {currentLang === 'vi' ? 'từ' : 'words'}
                </Tag>
              </div>
            </div>

            <Button 
              type="primary" 
              disabled={tagWordCount === 0}
              onClick={async () => {
                await fetchQueue();
                setIsStarted(true);
              }}
              style={tagWordCount > 0 ? { 
                width: '100%',
                borderRadius: 8, 
                fontWeight: 600, 
                background: '#4f46e5', 
                border: 'none', 
                height: 38,
                fontSize: 14,
                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.25)',
                color: '#ffffff'
              } : {
                width: '100%',
                borderRadius: 8, 
                fontWeight: 600, 
                height: 38,
                fontSize: 14
              }}
            >
              {tagWordCount > 0 ? translate('btnStartReview', currentLang) : translate('noDueWords', currentLang)}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', animation: 'fadeIn 0.5s' }}>
      {/* Control Bar - Tag Filter */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        width: '100%', 
        maxWidth: 450, 
        marginBottom: 20, 
        padding: '0 4px',
        zIndex: 10
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#475569', fontFamily: 'Inter' }}>
          {reviewQueue.length === 0 ? (currentLang === 'vi' ? 'Không còn từ cần ôn' : 'No reviews left') : (currentIndex >= reviewQueue.length ? translate('sessionCompleted', currentLang).replace('! 🎉', '') : translate('reviewTitle', currentLang))}
        </span>
        <Space align="center" size="small">
          <Filter size={15} color="#64748b" />
          <Select 
            value={selectedTag} 
            onChange={setSelectedTag} 
            style={{ width: 140 }} 
            options={[
              { value: 'all', label: translate('filterTag', currentLang) },
              ...allTags.map(t => ({ value: t, label: `#${t}` }))
            ]} 
          />
        </Space>
      </div>

      {renderContent()}
    </div>
  );
};
