import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Typography, Space, Tag, Select, notification, Progress, Card, Row, Col, List } from 'antd';
import { getWordsToReview, getAllTags, updateWordReview, type Word } from '../lib/db';
import { Check, ArrowRight, Filter, Volume2, Award, Zap, Layers } from 'lucide-react';
import { playAudio } from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';

const { Title, Text } = Typography;

const getIntervalDays = (level: number, lang: 'vi' | 'en') => {
  const isVi = lang === 'vi';
  switch (level) {
    case 0: return isVi ? 'ngay' : 'now';
    case 1: return isVi ? '1 ngày' : '1 day';
    case 2: return isVi ? '3 ngày' : '3 days';
    case 3: return isVi ? '7 ngày' : '7 days';
    case 4: return isVi ? '14 ngày' : '14 days';
    case 5: return isVi ? '30 ngày' : '30 days';
    default: return isVi ? '90 ngày' : '90 days';
  }
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

  const settings = useSettings();
  const currentLang = settings.language || 'vi';

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

  const handleScore = async (score: 'again' | 'hard' | 'good' | 'easy') => {
    if (currentWord) {
      setSessionStats(prev => ({
        ...prev,
        [score]: prev[score] + 1
      }));

      const result = await updateWordReview(currentWord.id, score);
      if (result && result.newStatus !== result.oldStatus) {
        setPromotions(prev => [
          ...prev,
          { word: currentWord.word, oldStatus: result.oldStatus, newStatus: result.newStatus }
        ]);
      }
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
      message: `Score: ${title}`,
      description: msg,
      key: 'flashcard-score', 
      placement: 'topRight',
      duration: 1.5 
    });

    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex(prev => prev + 1);
    }, 300); // Wait for flip back animation before showing next card
  };

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
  }, [isFlipped, currentIndex, reviewQueue]);

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
              <Title level={3} style={{ fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0' }}>
                {translate('noWordsToReview', currentLang)}
              </Title>
              <Text style={{ display: 'block', fontSize: 14, color: '#64748b', lineHeight: 1.6 }}>
                {selectedTag === 'all'
                  ? translate('noWordsToReview', currentLang)
                  : translate('noWordsToReviewTag', currentLang, { tag: selectedTag })}
              </Text>
            </div>

            <Button 
              type="primary" 
              size="large" 
              onClick={() => navigate('/vocabulary')}
              style={{ 
                borderRadius: 24, 
                fontWeight: 600, 
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                border: 'none', 
                height: 44, 
                padding: '0 32px',
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.2)'
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
              size="large" 
              onClick={() => setIsStarted(false)} 
              style={{ borderRadius: 24, padding: '0 24px', height: 48, fontWeight: 600 }}
            >
              {translate('otherTopic', currentLang)}
            </Button>
            <Button 
              type="primary" 
              size="large" 
              onClick={fetchQueue} 
              style={{ borderRadius: 24, padding: '0 24px', height: 48, fontWeight: 600, background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', border: 'none' }}
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
            strokeColor="linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)"
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
          style={{ width: 450, height: 320, cursor: isFlipped ? 'default' : 'pointer' }}
          onClick={() => !isFlipped && setIsFlipped(true)}
        >
          <div className="flip-card-inner">
            {/* Front of Card */}
            <div className="flip-card-front premium-flashcard">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Title level={1} style={{ fontSize: '3.0rem', margin: 0, fontWeight: 600, letterSpacing: '-0.5px' }}>{currentWord.word}</Title>
                <Button 
                  type="text" 
                  shape="circle" 
                  icon={<Volume2 size={24} color="#6366f1" />} 
                  onClick={(e) => { e.stopPropagation(); playAudio(currentWord.word); }} 
                />
              </div>
              {currentWord.phonetic && <Text style={{ fontSize: '1.5rem', color: '#64748b', marginTop: 8 }}>{currentWord.phonetic}</Text>}
              {currentWord.tags && currentWord.tags.length > 0 && (
                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {currentWord.tags.map(tag => (
                    <Tag key={tag} color="geekblue" style={{ margin: 0, borderRadius: 12 }}>{tag}</Tag>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', color: '#94a3b8', gap: 8 }}>
                <Text>{translate('clickToFlip', currentLang)}</Text>
                <ArrowRight size={16} />
              </div>
            </div>
            
            {/* Back of Card */}
            <div className="flip-card-back premium-flashcard" style={{ padding: '24px', boxSizing: 'border-box' }}>
              <Title level={2} style={{ color: '#8b5cf6', marginTop: 0, marginBottom: 8, fontSize: '2.5rem', textAlign: 'center' }}>
                {currentWord.meaning || 'Chưa dịch'}
              </Title>
              {currentWord.description && (
                <div style={{ fontSize: '1.2rem', color: '#64748b', marginBottom: 16, textAlign: 'center', whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>
                  {currentWord.description}
                </div>
              )}
              <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                {currentWord.tags.map(tag => (
                  <Tag key={tag} color={tag === 'it' || tag === 'tech' ? 'purple' : 'geekblue'} style={{ borderRadius: 16, padding: '4px 12px', border: 'none' }}>
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
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>Phím [1] • {getIntervalDays(0, currentLang)}</span>
              </button>
              <button 
                className="srs-btn hard"
                onClick={() => handleScore('hard')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnHard', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>Phím [2] • {getIntervalDays(Math.max(0, currentWord.review_level), currentLang)}</span>
              </button>
              <button 
                className="srs-btn good"
                onClick={() => handleScore('good')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnGood', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>Phím [3] • {getIntervalDays(currentWord.review_level + 1, currentLang)}</span>
              </button>
              <button 
                className="srs-btn easy"
                onClick={() => handleScore('easy')}
              >
                <span style={{ fontWeight: 700, fontSize: 14 }}>{translate('btnEasy', currentLang)}</span>
                <span style={{ fontSize: 9, opacity: 0.8, fontWeight: 500 }}>Phím [4] • {getIntervalDays(currentWord.review_level + 2, currentLang)}</span>
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
            {/* Glowing Icon */}
            <div style={{ 
              width: 80, 
              height: 80, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(217, 70, 239, 0.12) 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              boxShadow: 'inset 0 0 12px rgba(139, 92, 246, 0.05)'
            }}>
              <Layers size={36} color="#8b5cf6" />
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
              size="large" 
              disabled={tagWordCount === 0}
              onClick={async () => {
                await fetchQueue();
                setIsStarted(true);
              }}
              style={tagWordCount > 0 ? { 
                width: '100%',
                borderRadius: 20, 
                fontWeight: 600, 
                background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', 
                border: 'none', 
                height: 48,
                boxShadow: '0 8px 20px rgba(139, 92, 246, 0.2)',
                color: '#ffffff'
              } : {
                width: '100%',
                borderRadius: 20, 
                fontWeight: 600, 
                height: 48
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
