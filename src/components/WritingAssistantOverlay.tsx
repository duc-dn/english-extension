import React, { useEffect, useState } from 'react';
import { Sparkles, Check, Copy, X, ArrowRight, Wand2, RefreshCw } from 'lucide-react';
import type { WritingTone, WritingPolishResult } from '../lib/translator';

export const WritingAssistantOverlay: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tone, setTone] = useState<WritingTone>('professional');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WritingPolishResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [replaced, setReplaced] = useState(false);

  // Check setting
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get({ enable_writing_assistant: true }, (items) => {
        setEnabled(items.enable_writing_assistant !== false);
      });

      const onStorageChanged = (changes: any, area: string) => {
        if (area === 'sync' && changes.enable_writing_assistant !== undefined) {
          setEnabled(changes.enable_writing_assistant.newValue !== false);
        }
      };
      chrome.storage.onChanged.addListener(onStorageChanged);
    }
  }, []);

  const getElementText = (el: HTMLElement): string => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value || '';
    }
    if (el.isContentEditable) {
      return el.innerText || el.textContent || '';
    }
    return '';
  };

  const updateFabPosition = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 100 || rect.height < 24) {
      setFabPos(null);
      return;
    }

    const text = getElementText(el);
    if (text.trim().length < 5) {
      setFabPos(null);
      return;
    }

    setFabPos({
      x: Math.max(10, rect.right - 96),
      y: Math.max(10, rect.bottom - 28),
    });
  };

  useEffect(() => {
    if (!enabled) {
      setFabPos(null);
      setIsOpen(false);
      return;
    }

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (target.closest('#eng-ext-root')) return;

      const isInput = target instanceof HTMLInputElement && target.type !== 'password' && target.type !== 'hidden' && target.type !== 'file';
      const isTextArea = target instanceof HTMLTextAreaElement;
      const isEditable = target.isContentEditable;

      if (isInput || isTextArea || isEditable) {
        setActiveEl(target);
        updateFabPosition(target);
      }
    };

    const handleInput = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target === activeEl) {
        updateFabPosition(target);
      }
    };

    const handleScrollOrResize = () => {
      if (activeEl && !isOpen) {
        updateFabPosition(activeEl);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('input', handleInput);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('input', handleInput);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [enabled, activeEl, isOpen]);

  const handlePolish = (selectedTone: WritingTone = tone) => {
    if (!activeEl) return;
    const text = getElementText(activeEl);
    if (!text.trim()) return;

    setLoading(true);
    setErrorMsg('');
    setResult(null);
    setReplaced(false);

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(
        { action: 'POLISH_WRITING', payload: { text, tone: selectedTone } },
        (res) => {
          setLoading(false);
          if (res && res.ok && res.result) {
            setResult(res.result);
          } else {
            setErrorMsg(res?.error || 'Không thể kết nối AI để nâng cấp câu văn.');
          }
        }
      );
    }
  };

  const openPolishModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(true);
    handlePolish(tone);
  };

  const handleToneChange = (newTone: WritingTone) => {
    setTone(newTone);
    handlePolish(newTone);
  };

  const handleReplaceText = () => {
    if (!activeEl || !result) return;
    const newText = result.improvedText;

    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
      activeEl.value = newText;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
      activeEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (activeEl.isContentEditable) {
      activeEl.innerText = newText;
      activeEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    setReplaced(true);
    setTimeout(() => {
      setIsOpen(false);
      setFabPos(null);
    }, 700);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.improvedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!enabled) return null;

  return (
    <>
      {/* Floating Action Badge on Active Input */}
      {fabPos && !isOpen && (
        <div
          onClick={openPolishModal}
          style={{
            position: 'fixed',
            left: fabPos.x,
            top: fabPos.y,
            zIndex: 2147483646,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
            color: '#ffffff',
            fontSize: 11,
            fontWeight: 800,
            padding: '3px 8px',
            borderRadius: 12,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            userSelect: 'none',
            fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
            letterSpacing: '0.3px',
            transition: 'transform 0.15s ease',
          }}
          title="Nâng cấp tiếng Anh với AI (Grammar & Polish)"
        >
          <Sparkles size={11} />
          AI Polish
        </div>
      )}

      {/* Floating Writing Polish Modal */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 24,
            width: 380,
            maxHeight: '80vh',
            overflowY: 'auto',
            background: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            borderRadius: 18,
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.45)',
            zIndex: 2147483647,
            padding: 18,
            color: '#ffffff',
            fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
            fontSize: 13,
            lineHeight: 1.45,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ 
                background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)', 
                color: '#fff', 
                padding: '4px 8px', 
                borderRadius: 8, 
                display: 'flex', 
                alignItems: 'center', 
                gap: 4, 
                fontSize: 11, 
                fontWeight: 800 
              }}>
                <Wand2 size={12} /> AI WRITING ASSISTANT
              </span>
            </div>

            <div 
              onClick={() => setIsOpen(false)}
              style={{ cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex' }}
            >
              <X size={16} />
            </div>
          </div>

          {/* Tone Selector Pills */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { id: 'professional', label: '👔 Professional' },
              { id: 'concise', label: '⚡ Concise' },
              { id: 'casual', label: '☕ Casual' },
              { id: 'grammar_only', label: '🔍 Grammar' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => handleToneChange(t.id as WritingTone)}
                disabled={loading}
                style={{
                  background: tone === t.id ? '#8b5cf6' : 'rgba(255, 255, 255, 0.08)',
                  color: tone === t.id ? '#ffffff' : '#cbd5e1',
                  border: `1px solid ${tone === t.id ? '#a855f7' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: 14,
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Body Content */}
          {loading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#c084fc' }}>
              <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 8px auto', display: 'block' }} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>AI đang soát lỗi và nâng cấp câu văn...</div>
            </div>
          ) : errorMsg ? (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.12)', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: 10, 
              padding: 10, 
              color: '#f87171',
              fontSize: 12,
              marginBottom: 10
            }}>
              {errorMsg}
            </div>
          ) : result ? (
            <div>
              {/* Improved Text Box */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.06)', 
                border: '1px solid rgba(139, 92, 246, 0.3)', 
                borderRadius: 12, 
                padding: 12, 
                marginBottom: 12 
              }}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Bản nâng cấp ({tone}):
                </div>
                <div style={{ fontSize: 14, color: '#ffffff', fontWeight: 600, lineHeight: 1.5 }}>
                  {result.improvedText}
                </div>
              </div>

              {/* Corrections & Diff */}
              {result.corrections && result.corrections.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>
                    Điểm sửa đổi:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                    {result.corrections.map((corr, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          background: 'rgba(255, 255, 255, 0.03)', 
                          padding: '6px 8px', 
                          borderRadius: 8, 
                          fontSize: 11 
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ color: '#f87171', textDecoration: 'line-through' }}>{corr.original}</span>
                          <ArrowRight size={10} color="#94a3b8" />
                          <span style={{ color: '#34d399', fontWeight: 700 }}>{corr.replacement}</span>
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 10 }}>{corr.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Explanation Note */}
              {result.explanation && (
                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginBottom: 14 }}>
                  💡 {result.explanation}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleReplaceText}
                  style={{
                    flex: 1,
                    background: replaced ? '#10b981' : 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 10,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Check size={14} />
                  {replaced ? 'Đã thay thế!' : 'Thay thế văn bản'}
                </button>

                <button
                  onClick={handleCopy}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                  title="Sao chép"
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  {copied ? 'Đã chép' : 'Chép'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
};
