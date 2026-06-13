import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Volume2, Check, Bookmark } from 'lucide-react';
import { fetchBasicMeaning, translateSentence } from './lib/translator';

const ContentApp: React.FC = () => {
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState<{ x: number, y: number } | null>(null);
  const [showBelow, setShowBelow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phonetic, setPhonetic] = useState('');
  const [meaning, setMeaning] = useState('');
  const [partOfSpeech, setPartOfSpeech] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [currentLang, setCurrentLang] = useState<'vi' | 'en'>('vi');
  const [isPhrase, setIsPhrase] = useState(false);
  const [popupWidth, setPopupWidth] = useState(280);

  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ language: 'vi' }, (items) => {
        const lang = (items as any).language || 'vi';
        setCurrentLang(lang === 'en' ? 'en' : 'vi');
      });

      const listener = (changes: any, areaName: string) => {
        if (areaName === 'sync' && changes.language) {
          const newVal = changes.language.newValue;
          setCurrentLang(newVal === 'en' ? 'en' : 'vi');
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        const selection = window.getSelection();
        const text = selection?.toString().trim() || '';
        
        // Do not trigger if selection is empty or doesn't contain letters
        if (text && text.length > 0 && /[a-zA-Z]/.test(text)) {
          // Cap text length for popover to avoid layout breaking
          if (text.length < 500) {
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const phrase = wordCount > 1;
            setIsPhrase(phrase);

            const range = selection?.getRangeAt(0);
            const rect = range?.getBoundingClientRect();
            
            if (rect) {
              let width = 280;
              if (phrase) {
                // Width matches selection rect.width, at least 150px to prevent narrow layout breaking
                width = Math.max(rect.width, 150);
                width = Math.min(width, window.innerWidth - 40);
              }
              setPopupWidth(width);

              let x = rect.left + window.scrollX + (rect.width / 2) - (width / 2);
              
              // Place directly below selection to avoid covering it
              let y = rect.bottom + window.scrollY + 8;
              
              let showBelowText = true;
              if (x < window.scrollX + 10) x = window.scrollX + 10;
              if (x + width > window.innerWidth + window.scrollX - 10) x = window.innerWidth + window.scrollX - width - 10;

              setPosition({ x, y });
              setShowBelow(showBelowText);
              setSelectedText(text);
              setLoading(true);
              if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ shiftSelectedText: text });
              }
              setPhonetic('');
              setMeaning('');
              setPartOfSpeech('');
              setIsSaved(false);

              try {
                if (!phrase) {
                  const res = await fetchBasicMeaning(text);
                  if (res) {
                    setPhonetic(res.phonetic || '');
                    setMeaning(res.vietnameseMeaning || '');
                    const firstMeaning = res.meanings?.[0];
                    if (firstMeaning) {
                      setPartOfSpeech(firstMeaning.partOfSpeech || '');
                    }
                    setLoading(false);
                    return;
                  }
                }
                
                // For phrases/sentences, use the unified translation function
                const translated = await translateSentence(text);
                setMeaning(translated);
                setPartOfSpeech('PHRASE');
              } catch (err) {
                console.error("Error translating phrase:", err);
              } finally {
                setLoading(false);
              }
            }
          }
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#eng-ext-floating-btn')) {
        setPosition(null);
        setSelectedText('');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const speak = (lang: 'en-US' | 'en-GB') => {
    if (!selectedText || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(selectedText);
    utterance.lang = lang;
    utterance.rate = 0.85;
    
    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => v.lang.startsWith(lang));
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
    
    window.speechSynthesis.speak(utterance);
  };

  const handleSave = () => {
    if (!selectedText || isSaved) return;

    const selection = window.getSelection();
    let context = '';
    if (selection && selection.anchorNode) {
      context = selection.anchorNode.textContent || '';
    }

    chrome.runtime.sendMessage({
      action: 'SAVE_WORD',
      payload: {
        word: selectedText,
        phonetic: phonetic,
        meaning: meaning || selectedText,
        example: context.trim()
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error saving word:', chrome.runtime.lastError);
      } else if (response && response.success) {
        setIsSaved(true);
        setTimeout(() => {
          setPosition(null);
          setSelectedText('');
        }, 1200);
      }
    });
  };

  if (!position || !selectedText) return null;

  // Webpage popup always uses dark background with white text style for high contrast and readability
  const isDark = true;

  return (
    <>
      <style>{`
        @keyframes engExtFadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .eng-ext-tooltip-container {
          position: relative;
          display: inline-block;
        }
        .eng-ext-tooltip-container:hover .eng-ext-tooltip {
          visibility: visible !important;
          opacity: 1 !important;
        }
        #eng-ext-floating-btn {
          opacity: 1 !important;
          filter: none !important;
          backdrop-filter: none !important;
          transition: none !important;
        }
        #eng-ext-floating-btn:hover {
          opacity: 1 !important;
          filter: none !important;
          backdrop-filter: none !important;
        }
        #eng-ext-floating-btn * {
          box-sizing: border-box !important;
        }
        #eng-ext-floating-btn *:hover {
          opacity: 1 !important;
          filter: none !important;
        }
      `}</style>
      <div
        id="eng-ext-floating-btn"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          zIndex: 999999,
          background: isDark ? '#1e2230' : '#ffffff',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #cbd5e1',
          color: isDark ? '#ffffff' : '#1e293b',
          padding: '10px 12px',
          borderRadius: '10px',
          boxShadow: isDark 
            ? '0 12px 30px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)' 
            : '0 12px 30px rgba(15, 23, 42, 0.15), 0 1px 3px rgba(15, 23, 42, 0.05)',
          fontFamily: '"Plus Jakarta Sans", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontSize: '13px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          width: `${popupWidth}px`,
          boxSizing: 'border-box',
          userSelect: 'none',
          animation: 'engExtFadeIn 0.15s ease-out'
        }}
      >
        {/* Triangle Pointer */}
        {showBelow ? (
          <div style={{
            position: 'absolute',
            top: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '0',
            height: '0',
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderBottom: isDark ? '8px solid #1e2230' : '8px solid #ffffff'
          }} />
        ) : (
          <div style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '0',
            height: '0',
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: isDark ? '8px solid #1e2230' : '8px solid #ffffff'
          }} />
        )}

        {isPhrase ? (
          // Phrase Mode: Show ONLY the translation meaning and the compact Save icon button.
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {loading ? (
              <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                {currentLang === 'vi' ? 'Đang dịch...' : 'Translating...'}
              </span>
            ) : (
              meaning && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px' }}>
                      {currentLang === 'vi' ? 'DỊCH NGHĨA' : 'MEANING'}
                    </span>
                    <div className="eng-ext-tooltip-container">
                      <button
                        onClick={handleSave}
                        disabled={isSaved}
                        style={{
                          cursor: isSaved ? 'default' : 'pointer',
                          background: 'transparent',
                          border: 'none',
                          padding: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                          color: isSaved ? '#10b981' : '#8b5cf6',
                          transition: 'all 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSaved) e.currentTarget.style.color = '#c084fc';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSaved) e.currentTarget.style.color = '#8b5cf6';
                        }}
                      >
                        {isSaved ? <Check size={14} /> : <Bookmark size={14} fill="currentColor" />}
                      </button>
                      <div className="eng-ext-tooltip" style={{
                        visibility: 'hidden',
                        background: isDark ? '#111827' : '#ffffff',
                        color: isDark ? '#ffffff' : '#1e293b',
                        textAlign: 'center',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        position: 'absolute',
                        zIndex: 9999999,
                        bottom: '125%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        opacity: 0,
                        transition: 'opacity 0.2s',
                        fontSize: '10px',
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                        border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                      }}>
                        {isSaved 
                          ? (currentLang === 'vi' ? 'Đã lưu cụm từ!' : 'Saved phrase!')
                          : (currentLang === 'vi' ? 'Lưu cụm từ' : 'Save Phrase')}
                      </div>
                    </div>
                  </div>
                  <span style={{ color: '#ffffff', fontSize: '14px', fontWeight: 400, lineHeight: '1.5', paddingRight: '20px' }}>
                    {meaning}
                  </span>
                </div>
              )
            )}
          </div>
        ) : (
          // Word Mode: Full details
          <>
            {/* Word, Part of Speech and Save Button */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: '18px', color: isDark ? '#ffffff' : '#1e293b', letterSpacing: '-0.5px' }}>
                  {selectedText.charAt(0).toUpperCase() + selectedText.slice(1)}
                </span>
                {partOfSpeech && (
                  <span style={{ 
                    background: isDark ? 'rgba(139, 92, 246, 0.2)' : 'rgba(139, 92, 246, 0.1)', 
                    color: isDark ? '#c084fc' : '#7c3aed', 
                    padding: '2px 8px', 
                    borderRadius: '6px', 
                    fontSize: '10px', 
                    fontWeight: 700, 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    {partOfSpeech}
                  </span>
                )}
              </div>
              
              <div className="eng-ext-tooltip-container">
                <button
                  onClick={handleSave}
                  disabled={isSaved}
                  style={{
                    cursor: isSaved ? 'default' : 'pointer',
                    background: 'transparent',
                    border: 'none',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    color: isSaved ? '#10b981' : '#8b5cf6',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSaved) e.currentTarget.style.color = '#c084fc';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSaved) e.currentTarget.style.color = '#8b5cf6';
                  }}
                >
                  {isSaved ? <Check size={14} /> : <Bookmark size={14} fill="currentColor" />}
                </button>
                <div className="eng-ext-tooltip" style={{
                  visibility: 'hidden',
                  background: isDark ? '#111827' : '#ffffff',
                  color: isDark ? '#ffffff' : '#1e293b',
                  textAlign: 'center',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  position: 'absolute',
                  zIndex: 9999999,
                  bottom: '125%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  opacity: 0,
                  transition: 'opacity 0.2s',
                  fontSize: '10px',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid #cbd5e1',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                }}>
                  {isSaved 
                    ? (currentLang === 'vi' ? 'Đã lưu thành công!' : 'Saved successfully!')
                    : (currentLang === 'vi' ? 'Lưu từ' : 'Save Word')}
                </div>
              </div>
            </div>

            {/* US/UK Pronunciation Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* UK */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, width: '20px' }}>UK</span>
                <button 
                  onClick={() => speak('en-GB')}
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    background: isDark ? '#151823' : '#f8fafc',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = isDark ? '#25293c' : '#e2e8f0')}
                  onMouseOut={(e) => (e.currentTarget.style.background = isDark ? '#151823' : '#f8fafc')}
                >
                  <Volume2 size={12} color="#a855f7" />
                </button>
                <span style={{ color: '#34d399', fontSize: '12px', fontStyle: 'italic', fontWeight: 600 }}>
                  {phonetic ? phonetic : '/.../'}
                </span>
              </div>

              {/* US */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 800, width: '20px' }}>US</span>
                <button 
                  onClick={() => speak('en-US')}
                  style={{
                    cursor: 'pointer',
                    border: 'none',
                    background: isDark ? '#151823' : '#f8fafc',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s'
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = isDark ? '#25293c' : '#e2e8f0')}
                  onMouseOut={(e) => (e.currentTarget.style.background = isDark ? '#151823' : '#f8fafc')}
                >
                  <Volume2 size={12} color="#6366f1" />
                </button>
                <span style={{ color: '#34d399', fontSize: '12px', fontStyle: 'italic', fontWeight: 600 }}>
                  {phonetic ? phonetic : '/.../'}
                </span>
              </div>
            </div>

            {/* Translation Details / Definitions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: isDark ? '1px solid rgba(255,255,255,0.06)' : '1px solid #e2e8f0', paddingTop: '10px' }}>
              {loading ? (
                <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>{currentLang === 'vi' ? 'Đang tra từ...' : 'Searching...'}</span>
              ) : (
                <>
                  {/* Vietnamese Meaning / Translation */}
                  {meaning && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ color: '#64748b', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px' }}>{currentLang === 'vi' ? 'DỊCH NGHĨA' : 'MEANING'}</span>
                      <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 400, lineHeight: '1.4' }}>
                        {meaning}
                      </span>
                    </div>
                  )}

                  {!meaning && (
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                      {currentLang === 'vi' ? 'Không tìm thấy định nghĩa trực tuyến.' : 'No online definition found.'}
                    </span>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};

// Inject root into document
const rootElement = document.createElement('div');
rootElement.id = 'eng-ext-root';
document.body.appendChild(rootElement);

const root = createRoot(rootElement);
root.render(<ContentApp />);
