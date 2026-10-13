import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Card, 
  Button, 
  Progress, 
  Slider, 
  Segmented, 
  Row, 
  Col, 
  Typography, 
  Tag, 
  Tooltip 
} from 'antd';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Flame, 
  Coffee, 
  Sparkles, 
  RefreshCw, 
  Quote, 
  BookOpen, 
  Layers, 
  CheckSquare, 
  Headphones
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { 
  usePomodoroTimer, 
  pomodoroManager, 
  formatTime, 
  type PomodoroMode 
} from '../lib/pomodoro';
import { 
  startAmbientSound, 
  stopAmbientSound, 
  setAmbientVolume, 
  getCurrentAmbientType, 
  playAudio 
} from '../lib/audio';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { db, type Word } from '../lib/db';

const { Title, Text } = Typography;

const INSPIRATIONAL_QUOTES = [
  {
    english: "Consistency is what transforms average into excellence.",
    vietnamese: "Sự kiên trì là điều biến sự bình thường thành xuất chúng.",
    author: "Tony Robbins",
  },
  {
    english: "Small daily improvements over time lead to stunning results.",
    vietnamese: "Những tiến bộ nhỏ mỗi ngày theo thời gian sẽ tạo nên kết quả phi thường.",
    author: "Robin Sharma",
  },
  {
    english: "The expert in anything was once a beginner.",
    vietnamese: "Bất kỳ chuyên gia nào cũng từng là một người mới bắt đầu.",
    author: "Helen Hayes",
  },
  {
    english: "Continuous improvement is better than delayed perfection.",
    vietnamese: "Sự cải thiện liên tục tốt hơn sự hoàn hảo bị trì hoãn.",
    author: "Mark Twain",
  },
  {
    english: "Live as if you were to die tomorrow. Learn as if you were to live forever.",
    vietnamese: "Hãy sống như thể ngày mai bạn sẽ chết. Hãy học như thể bạn sẽ sống mãi mãi.",
    author: "Mahatma Gandhi",
  },
  {
    english: "Action is the foundational key to all success.",
    vietnamese: "Hành động là chìa khóa nền tảng cho mọi thành công.",
    author: "Pablo Picasso",
  },
  {
    english: "Focus on the step in front of you, not the whole staircase.",
    vietnamese: "Hãy tập trung vào từng bước đi trước mắt, thay vì toàn bộ cầu thang.",
    author: "Unknown",
  },
];

export const PomodoroPage: React.FC = () => {
  const navigate = useNavigate();
  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const {
    mode,
    timeLeft,
    totalDuration,
    isRunning,
    cycle,
    settings: pomodoroSettings,
    todayCompletedSessions,
    todayTotalMinutes,
  } = usePomodoroTimer();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Ambient sound states
  const [ambientSound, setAmbientSound] = useState<'none' | 'rain' | 'waves' | 'cafe'>(() => getCurrentAmbientType());
  const [ambientVol, setAmbientVol] = useState(25);

  // Inspirational Quote state
  const [quoteIdx, setQuoteIdx] = useState(0);

  // Focus Word of the Session state
  const [focusWord, setFocusWord] = useState<Word | null>(null);
  const [loadingWord, setLoadingWord] = useState(false);

  // Pick random quote on mount
  useEffect(() => {
    setQuoteIdx(Math.floor(Math.random() * INSPIRATIONAL_QUOTES.length));
  }, []);

  // Fetch random word for this session from DB
  const loadRandomFocusWord = useCallback(async () => {
    setLoadingWord(true);
    try {
      const words = await db.words.toArray();
      if (words.length > 0) {
        // Prioritize learning or reviewing words
        const learningWords = words.filter(w => w.status === 'learning' || w.status === 'reviewing' || !w.status);
        const pool = learningWords.length > 0 ? learningWords : words;
        const random = pool[Math.floor(Math.random() * pool.length)];
        setFocusWord(random);
      } else {
        setFocusWord({
          id: 'demo-1',
          word: 'Perseverance',
          phonetic: '/ˌpɜː.sɪˈvɪə.rəns/',
          meaning: 'Sự kiên trì, bền bỉ theo đuổi mục tiêu dù gặp nhiều khó khăn.',
          example: 'Through perseverance and focused practice, she mastered fluent English.',
          tags: ['Inspiration', 'Mindset'],
          created_at: new Date(),
          review_level: 1,
          next_review: new Date(),
        });
      }
    } catch {
      // Fallback
    } finally {
      setLoadingWord(false);
    }
  }, []);

  useEffect(() => {
    loadRandomFocusWord();
  }, [loadRandomFocusWord]);

  // Clean up ambient audio on unmount
  useEffect(() => {
    return () => {
      stopAmbientSound();
    };
  }, []);

  // Listen to fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const percent = totalDuration > 0
    ? Math.min(100, Math.max(0, Math.round(((totalDuration - timeLeft) / totalDuration) * 100)))
    : 0;

  const currentQuote = INSPIRATIONAL_QUOTES[quoteIdx];

  const handleNextQuote = () => {
    setQuoteIdx((prev) => (prev + 1) % INSPIRATIONAL_QUOTES.length);
  };

  const handleModeSelect = (newMode: string | number) => {
    pomodoroManager.setMode(newMode as PomodoroMode);
  };

  const handlePresetSelect = (mins: number) => {
    pomodoroManager.updateSettings({ focusDuration: mins * 60 });
    pomodoroManager.setMode('focus', mins * 60);
  };

  const handleAmbientChange = (type: 'none' | 'rain' | 'waves' | 'cafe') => {
    setAmbientSound(type);
    if (type === 'none') {
      stopAmbientSound();
    } else {
      startAmbientSound(type, ambientVol / 100);
    }
  };

  const handleVolumeChange = (val: number) => {
    setAmbientVol(val);
    setAmbientVolume(val / 100);
  };

  const modeTheme = useMemo(() => {
    switch (mode) {
      case 'focus':
        return {
          color: '#f43f5e',
          colorSecondary: '#fb7185',
          bgGradient: 'radial-gradient(circle at 50% 30%, rgba(244, 63, 94, 0.12) 0%, rgba(139, 92, 246, 0.05) 50%, rgba(255, 255, 255, 0) 100%)',
          cardBg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 241, 242, 0.6) 100%)',
          border: 'rgba(244, 63, 94, 0.25)',
          btnGradient: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)',
          shadow: '0 12px 36px rgba(244, 63, 94, 0.28)',
          label: translate('pomodoroFocus', currentLang),
          tagText: 'FOCUS TIME 🚀',
          icon: <Flame size={16} color="#f43f5e" />,
          ringClass: isRunning ? 'pomodoro-ring-active-focus' : '',
        };
      case 'short_break':
        return {
          color: '#10b981',
          colorSecondary: '#34d399',
          bgGradient: 'radial-gradient(circle at 50% 30%, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.05) 50%, rgba(255, 255, 255, 0) 100%)',
          cardBg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(236, 253, 245, 0.6) 100%)',
          border: 'rgba(16, 185, 129, 0.25)',
          btnGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
          shadow: '0 12px 36px rgba(16, 185, 129, 0.28)',
          label: translate('pomodoroShortBreak', currentLang),
          tagText: 'SHORT BREAK ☕',
          icon: <Coffee size={16} color="#10b981" />,
          ringClass: isRunning ? 'pomodoro-ring-active-break' : '',
        };
      case 'long_break':
        return {
          color: '#0284c7',
          colorSecondary: '#38bdf8',
          bgGradient: 'radial-gradient(circle at 50% 30%, rgba(2, 132, 199, 0.12) 0%, rgba(99, 102, 241, 0.05) 50%, rgba(255, 255, 255, 0) 100%)',
          cardBg: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(240, 249, 255, 0.6) 100%)',
          border: 'rgba(2, 132, 199, 0.25)',
          btnGradient: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
          shadow: '0 12px 36px rgba(2, 132, 199, 0.28)',
          label: translate('pomodoroLongBreak', currentLang),
          tagText: 'LONG BREAK 🌴',
          icon: <Sparkles size={16} color="#0284c7" />,
          ringClass: isRunning ? 'pomodoro-ring-active-break' : '',
        };
    }
  }, [mode, isRunning, currentLang]);

  return (
    <div style={{ position: 'relative', minHeight: '100%', paddingBottom: 32 }}>
      {/* Ambient background glow according to mode */}
      <div 
        style={{ 
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: modeTheme.bgGradient,
          pointerEvents: 'none',
          zIndex: 0,
          transition: 'all 0.8s ease'
        }} 
      />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1040, margin: '0 auto' }}>
        {/* Top Header Bar inside page */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>🍅</span>
              <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: '-0.5px' }}>
                {translate('pomodoroPageTitle', currentLang)}
              </Title>
            </div>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
              {translate('pomodoroPageSubtitle', currentLang)}
            </Text>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Sound chime status toggle */}
            <Tooltip title={pomodoroSettings.soundEnabled ? 'Chuông thông báo đang bật' : 'Chuông thông báo đang tắt'}>
              <Button
                icon={pomodoroSettings.soundEnabled ? <Volume2 size={16} color="#10b981" /> : <VolumeX size={16} color="#94a3b8" />}
                onClick={() => pomodoroManager.updateSettings({ soundEnabled: !pomodoroSettings.soundEnabled })}
                style={{ borderRadius: 20 }}
              >
                {pomodoroSettings.soundEnabled ? 'Chime ON' : 'Chime Muted'}
              </Button>
            </Tooltip>

            {/* Fullscreen Button */}
            <Tooltip title={isFullscreen ? translate('pomodoroExitFullscreen', currentLang) : translate('pomodoroFullscreen', currentLang)}>
              <Button
                icon={isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                onClick={toggleFullscreen}
                style={{ borderRadius: 20 }}
              >
                {isFullscreen ? translate('pomodoroExitFullscreen', currentLang) : translate('pomodoroFullscreen', currentLang)}
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Hero Pomodoro Main Card */}
        <Card
          className="pomodoro-glass-hero glass-card"
          bordered={false}
          style={{
            background: modeTheme.cardBg,
            border: `1px solid ${modeTheme.border}`,
            marginBottom: 24,
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.05)',
            position: 'relative',
            overflow: 'hidden'
          }}
          bodyStyle={{ padding: '36px 24px' }}
        >
          {/* Top Segmented Mode Selector */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
            <Segmented
              size="large"
              value={mode}
              onChange={handleModeSelect}
              options={[
                {
                  label: (
                    <span style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                      <Flame size={16} color="#f43f5e" />
                      {translate('pomodoroFocus', currentLang)} (25m)
                    </span>
                  ),
                  value: 'focus',
                },
                {
                  label: (
                    <span style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                      <Coffee size={16} color="#10b981" />
                      {translate('pomodoroShortBreak', currentLang)} (5m)
                    </span>
                  ),
                  value: 'short_break',
                },
                {
                  label: (
                    <span style={{ padding: '4px 16px', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                      <Sparkles size={16} color="#0284c7" />
                      {translate('pomodoroLongBreak', currentLang)} (15m)
                    </span>
                  ),
                  value: 'long_break',
                },
              ]}
              style={{
                background: 'rgba(255, 255, 255, 0.65)',
                padding: 4,
                borderRadius: 24,
                border: '1px solid rgba(226, 232, 240, 0.8)',
              }}
            />
          </div>

          {/* Central Hero Countdown Dial */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0 24px 0' }}>
            <div 
              className={modeTheme.ringClass}
              style={{ 
                borderRadius: '50%', 
                padding: 10,
                transition: 'all 0.4s ease',
              }}
            >
              <Progress
                type="circle"
                percent={percent}
                size={270}
                strokeColor={modeTheme.color}
                strokeWidth={5}
                trailColor="rgba(226, 232, 240, 0.6)"
                format={() => (
                  <div style={{ textAlign: 'center', padding: '0 10px' }}>
                    <Tag 
                      color={modeTheme.color} 
                      style={{ 
                        borderRadius: 12, 
                        fontWeight: 800, 
                        fontSize: 11, 
                        letterSpacing: '0.8px',
                        border: 'none',
                        padding: '2px 10px',
                        marginBottom: 6
                      }}
                    >
                      {modeTheme.tagText}
                    </Tag>

                    {/* Giant Digital Monospace Clock */}
                    <div style={{ 
                      fontSize: 56, 
                      fontWeight: 800, 
                      fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace", 
                      color: '#1e293b',
                      lineHeight: 1.1,
                      letterSpacing: '-1.5px',
                      textShadow: '0 2px 10px rgba(0,0,0,0.06)'
                    }}>
                      {formatTime(timeLeft)}
                    </div>

                    {/* Cycle Tomato Dots */}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 10 }}>
                      {[1, 2, 3, 4].map((step) => (
                        <span 
                          key={step} 
                          style={{ 
                            fontSize: 14, 
                            opacity: step <= cycle ? 1 : 0.25, 
                            transform: step === cycle ? 'scale(1.2)' : 'scale(1)',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          🍅
                        </span>
                      ))}
                    </div>

                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 6 }}>
                      {translate('pomodoroCycle', currentLang)} {cycle} / 4
                    </div>
                  </div>
                )}
              />
            </div>
          </div>

          {/* Main Action Control Buttons */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <Button
              type="primary"
              size="large"
              icon={isRunning ? <Pause size={20} /> : <Play size={20} fill="white" />}
              onClick={() => (isRunning ? pomodoroManager.pause() : pomodoroManager.start())}
              style={{
                height: 52,
                minWidth: 190,
                borderRadius: 26,
                background: modeTheme.btnGradient,
                borderColor: 'transparent',
                fontWeight: 800,
                fontSize: 16,
                boxShadow: modeTheme.shadow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isRunning ? translate('pomodoroPause', currentLang) : translate('pomodoroStart', currentLang)}
            </Button>

            <Tooltip title={translate('pomodoroReset', currentLang)}>
              <Button
                size="large"
                icon={<RotateCcw size={18} color="#64748b" />}
                onClick={() => pomodoroManager.reset()}
                style={{ 
                  height: 52, 
                  width: 52, 
                  borderRadius: 26, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}
              />
            </Tooltip>

            <Tooltip title={translate('pomodoroSkip', currentLang)}>
              <Button
                size="large"
                icon={<SkipForward size={18} color="#64748b" />}
                onClick={() => pomodoroManager.skip()}
                style={{ 
                  height: 52, 
                  width: 52, 
                  borderRadius: 26, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}
              />
            </Tooltip>
          </div>

          {/* Quick Duration Presets (Only during Focus Mode) */}
          {mode === 'focus' && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginRight: 4 }}>
                Chọn thời lượng:
              </span>
              {[
                { mins: 15, label: '15m (Khởi động)' },
                { mins: 25, label: '25m (Chuẩn)' },
                { mins: 45, label: '45m (Tập trung sâu)' },
                { mins: 60, label: '60m (Marathon)' },
              ].map(({ mins, label }) => {
                const isSelected = pomodoroSettings.focusDuration === mins * 60;
                return (
                  <Button
                    key={mins}
                    size="small"
                    type={isSelected ? 'primary' : 'default'}
                    onClick={() => handlePresetSelect(mins)}
                    style={{
                      borderRadius: 14,
                      fontSize: 12,
                      fontWeight: 600,
                      borderColor: isSelected ? '#f43f5e' : undefined,
                      background: isSelected ? '#f43f5e' : 'rgba(255, 255, 255, 0.7)',
                    }}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          )}
        </Card>

        {/* Ambient White Noise Bar */}
        <Card
          className="glass-card"
          bordered={false}
          style={{
            borderRadius: 18,
            marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(248, 250, 252, 0.5) 100%)',
            border: '1px solid rgba(226, 232, 240, 0.7)'
          }}
          bodyStyle={{ padding: '16px 22px' }}
        >
          <Row gutter={[16, 12]} align="middle">
            <Col xs={24} md={6}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Headphones size={18} color="#8b5cf6" />
                <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
                  {translate('pomodoroAmbientTitle', currentLang)}
                </span>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <Segmented
                block
                value={ambientSound}
                onChange={(val) => handleAmbientChange(val as any)}
                options={[
                  { label: translate('pomodoroAmbientOff', currentLang), value: 'none' },
                  { label: translate('pomodoroAmbientRain', currentLang), value: 'rain' },
                  { label: translate('pomodoroAmbientWaves', currentLang), value: 'waves' },
                  { label: translate('pomodoroAmbientCafe', currentLang), value: 'cafe' },
                ]}
              />
            </Col>

            <Col xs={24} md={6}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Volume2 size={15} color="#94a3b8" />
                <Slider
                  min={0}
                  max={100}
                  value={ambientVol}
                  onChange={handleVolumeChange}
                  disabled={ambientSound === 'none'}
                  style={{ flex: 1, margin: 0 }}
                />
                <span style={{ fontSize: 11, color: '#94a3b8', width: 28, textAlign: 'right' }}>
                  {ambientVol}%
                </span>
              </div>
            </Col>
          </Row>
        </Card>

        {/* Two Learning Companion Columns */}
        <Row gutter={[20, 20]} style={{ marginBottom: 24 }}>
          {/* Column 1: Daily Inspirational English Quote */}
          <Col xs={24} md={12}>
            <Card
              className="pomodoro-quote-card hover-lift"
              bordered={false}
              style={{ height: '100%' }}
              bodyStyle={{ padding: 22, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: '#fef3c7', padding: '4px 8px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                      <Quote size={13} color="#d97706" />
                    </span>
                    <strong style={{ fontSize: 14, color: '#1e293b' }}>
                      {translate('pomodoroQuoteTitle', currentLang)}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', gap: 4 }}>
                    <Tooltip title="Nghe phát âm chuẩn">
                      <Button
                        type="text"
                        size="small"
                        icon={<Volume2 size={14} color="#8b5cf6" />}
                        onClick={() => playAudio(currentQuote.english)}
                      />
                    </Tooltip>
                    <Tooltip title="Đổi danh ngôn khác">
                      <Button
                        type="text"
                        size="small"
                        icon={<RefreshCw size={14} color="#64748b" />}
                        onClick={handleNextQuote}
                      />
                    </Tooltip>
                  </div>
                </div>

                <div style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontStyle: 'italic', lineHeight: 1.5, marginBottom: 8 }}>
                  "{currentQuote.english}"
                </div>

                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.4 }}>
                  {currentQuote.vietnamese}
                </div>
              </div>

              <div style={{ textAlign: 'right', marginTop: 14 }}>
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>
                  — {currentQuote.author}
                </Text>
              </div>
            </Card>
          </Col>

          {/* Column 2: Focus Word of the Session */}
          <Col xs={24} md={12}>
            <Card
              className="pomodoro-quote-card hover-lift"
              bordered={false}
              style={{ height: '100%' }}
              bodyStyle={{ padding: 22, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ background: '#ede9fe', padding: '4px 8px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
                      <BookOpen size={13} color="#8b5cf6" />
                    </span>
                    <strong style={{ fontSize: 14, color: '#1e293b' }}>
                      {translate('pomodoroWordTitle', currentLang)}
                    </strong>
                  </div>

                  <Tooltip title="Đổi từ vựng khác">
                    <Button
                      type="text"
                      size="small"
                      loading={loadingWord}
                      icon={<RefreshCw size={14} color="#64748b" />}
                      onClick={loadRandomFocusWord}
                    />
                  </Tooltip>
                </div>

                {focusWord ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: '#8b5cf6' }}>
                        {focusWord.word}
                      </span>
                      {focusWord.phonetic && (
                        <span style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>
                          {focusWord.phonetic}
                        </span>
                      )}
                      <Button
                        type="text"
                        size="small"
                        icon={<Volume2 size={13} color="#8b5cf6" />}
                        onClick={() => playAudio(focusWord.word)}
                        style={{ padding: 2 }}
                      />
                    </div>

                    <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                      {focusWord.meaning}
                    </div>

                    {focusWord.example && (
                      <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', background: 'rgba(139, 92, 246, 0.05)', padding: '6px 10px', borderRadius: 8 }}>
                        "{focusWord.example}"
                      </div>
                    )}
                  </div>
                ) : (
                  <Text type="secondary">Chưa có từ vựng nào trong sổ từ.</Text>
                )}
              </div>

              {/* Quick Learning Shortcuts */}
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Button
                  size="small"
                  icon={<Layers size={12} />}
                  onClick={() => navigate('/flashcards')}
                  style={{ borderRadius: 12, fontSize: 12, flex: 1 }}
                >
                  Ôn Flashcards
                </Button>
                <Button
                  size="small"
                  icon={<CheckSquare size={12} />}
                  onClick={() => navigate('/quizzes')}
                  style={{ borderRadius: 12, fontSize: 12, flex: 1 }}
                >
                  Làm Quiz
                </Button>
              </div>
            </Card>
          </Col>
        </Row>

        {/* Today's Focus Garden & Stats */}
        <Card
          className="glass-card"
          bordered={false}
          style={{
            borderRadius: 18,
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(248, 250, 252, 0.6) 100%)',
            border: '1px solid rgba(226, 232, 240, 0.8)'
          }}
          bodyStyle={{ padding: '18px 24px' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ 
                background: 'linear-gradient(135deg, #f43f5e 0%, #fb7185 100%)', 
                color: '#fff', 
                borderRadius: 14, 
                padding: '10px 14px', 
                fontSize: 22,
                boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)'
              }}>
                🍅
              </div>
              <div>
                <strong style={{ fontSize: 15, color: '#1e293b', display: 'block' }}>
                  Vườn Cà Chua Hôm Nay (Today's Focus Streak)
                </strong>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Mục tiêu lý tưởng: 4 phiên (100 phút học tập sâu) mỗi ngày
                </Text>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#f43f5e' }}>
                  {todayCompletedSessions} <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>phiên</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  {todayTotalMinutes} phút tập trung
                </div>
              </div>

              <div style={{ width: 120 }}>
                <Progress 
                  percent={Math.min(100, Math.round((todayCompletedSessions / 4) * 100))} 
                  size="small" 
                  strokeColor="#f43f5e" 
                />
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
