import React, { useEffect, useState } from 'react';
import { 
  Sparkles, Check, Copy, X, ArrowRight, RefreshCw, 
  ChevronDown, ChevronUp, Volume2, Briefcase, 
  Zap, MessageSquare, CheckCheck, Lightbulb, Eye, EyeOff
} from 'lucide-react';
import type { WritingTone, WritingPolishResult } from '../lib/translator';
import { hasRuntimeError, isExtensionContextValid } from '../lib/extensionContext';

interface ToneOption {
  id: WritingTone;
  label: string;
  sub: string;
  icon: React.ComponentType<{ size?: number; color?: string; style?: React.CSSProperties }>;
  accent: string;
  tooltip: string;
}

const TONES: ToneOption[] = [
  { 
    id: 'professional', 
    label: 'Công sở', 
    sub: 'Pro', 
    icon: Briefcase, 
    accent: '#818cf8', 
    tooltip: 'Lịch sự, trang trọng cho email, ticket & đối tác' 
  },
  { 
    id: 'concise', 
    label: 'Súc tích', 
    sub: 'Gọn', 
    icon: Zap, 
    accent: '#fbbf24', 
    tooltip: 'Ngắn gọn, trực diện cho Slack, PR, commit' 
  },
  { 
    id: 'casual', 
    label: 'Tự nhiên', 
    sub: 'Bản xứ', 
    icon: MessageSquare, 
    accent: '#34d399', 
    tooltip: 'Thân thiện, tự nhiên như người bản ngữ giao tiếp' 
  },
  { 
    id: 'grammar_only', 
    label: 'Ngữ pháp', 
    sub: 'Chuẩn', 
    icon: CheckCheck, 
    accent: '#38bdf8', 
    tooltip: 'Giữ nguyên câu từ, chỉ sửa lỗi ngữ pháp & chính tả' 
  },
];

export const WritingAssistantOverlay: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [activeEl, setActiveEl] = useState<HTMLElement | null>(null);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [fabHovered, setFabHovered] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [tone, setTone] = useState<WritingTone>('professional');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WritingPolishResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [replaced, setReplaced] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

  // Check setting from chrome sync storage
  useEffect(() => {
    if (isExtensionContextValid() && chrome.storage?.sync) {
      try {
        chrome.storage.sync.get({ enable_writing_assistant: true }, (items) => {
          if (hasRuntimeError()) return;
          setEnabled(items.enable_writing_assistant !== false);
        });

        const onStorageChanged = (changes: any, area: string) => {
          if (!isExtensionContextValid()) return;
          if (area === 'sync' && changes.enable_writing_assistant !== undefined) {
            setEnabled(changes.enable_writing_assistant.newValue !== false);
          }
        };
        chrome.storage.onChanged.addListener(onStorageChanged);
        return () => {
          try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* extension reloaded */ }
        };
      } catch { /* extension reloaded */ }
    }
  }, []);

  const isWritingTarget = (el: HTMLElement | null): boolean => {
    if (!el) return false;
    if (el.closest('#eng-ext-root')) return false;

    // Iframe editor (like Jira Visual, TinyMCE)
    if (el instanceof HTMLIFrameElement) return true;

    // Rich text / WYSIWYG editors
    if (el.isContentEditable) return true;

    // Textarea (comments, posts, descriptions)
    if (el instanceof HTMLTextAreaElement) {
      return !el.readOnly && !el.disabled;
    }

    // Single-line inputs: only true writing fields, ignore search/query/login/filter boxes
    if (el instanceof HTMLInputElement) {
      if (el.readOnly || el.disabled) return false;

      const type = (el.type || 'text').toLowerCase();
      // Only standard text inputs
      if (type !== 'text') return false;

      // Ignore searchbox, combobox, or role="search"
      const role = (el.getAttribute('role') || '').toLowerCase();
      if (['searchbox', 'search', 'combobox'].includes(role)) return false;

      // Ignore if inside a search form or search container (YouTube, Google, Amazon, etc.)
      if (el.closest('form[role="search"], [role="search"], ytd-searchbox, #search, #searchform, .search-container, .search-box')) {
        return false;
      }

      // Check name, id, placeholder, aria-label for search keywords
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const placeholder = (el.placeholder || '').toLowerCase();
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const className = (typeof el.className === 'string' ? el.className : '').toLowerCase();

      const searchTerms = ['search', 'tìm kiếm', 'tim kiem', 'query', 'keyword', 'filter'];
      if (searchTerms.some(term => 
        name.includes(term) || 
        id.includes(term) || 
        placeholder.includes(term) || 
        ariaLabel.includes(term) || 
        className.includes('search')
      )) {
        return false;
      }

      // Ignore credentials, numbers, codes
      const autocomplete = (el.autocomplete || '').toLowerCase();
      if (['username', 'current-password', 'new-password', 'one-time-code', 'tel', 'email'].includes(autocomplete)) {
        return false;
      }

      return true;
    }

    return false;
  };

  const getElementText = (el: HTMLElement): string => {
    if (el instanceof HTMLIFrameElement) {
      try {
        const doc = el.contentDocument;
        return doc?.body?.innerText || doc?.body?.textContent || '';
      } catch {
        return '';
      }
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value || '';
    }
    if (el.isContentEditable) {
      return el.innerText || el.textContent || '';
    }
    return '';
  };

  const updateFabPosition = (el: HTMLElement) => {
    if (!isWritingTarget(el)) {
      setFabPos(null);
      return;
    }

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

    const isSingleLine = rect.height < 45;
    const posY = isSingleLine
      ? rect.top + Math.max(0, (rect.height - 26) / 2)
      : rect.bottom - 32;

    setFabPos({
      x: Math.max(10, rect.right - 34),
      y: Math.max(10, posY),
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

      if (!isWritingTarget(target)) {
        if (target !== activeEl) {
          setFabPos(null);
        }
        return;
      }

      setActiveEl(target);
      updateFabPosition(target);
    };

    const handleInput = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target === activeEl) {
        if (!isWritingTarget(target)) {
          setFabPos(null);
          return;
        }
        updateFabPosition(target);
      }
    };

    const handleScrollOrResize = () => {
      if (activeEl && !isOpen) {
        updateFabPosition(activeEl);
      }
    };

    const checkIframe = (iframe: HTMLIFrameElement) => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || (iframe as any).__engAttached) return;
        (iframe as any).__engAttached = true;

        const onIframeFocus = () => {
          setActiveEl(iframe);
          updateFabPosition(iframe);
        };
        const onIframeInput = () => {
          if (activeEl === iframe) {
            updateFabPosition(iframe);
          }
        };

        doc.addEventListener('focusin', onIframeFocus);
        doc.addEventListener('input', onIframeInput);
        doc.addEventListener('keyup', onIframeInput);
      } catch {
        // Cross-origin iframe
      }
    };

    const attachIframes = () => {
      document.querySelectorAll('iframe').forEach(checkIframe);
    };

    attachIframes();
    const iframeObserver = new MutationObserver(() => attachIframes());
    iframeObserver.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('input', handleInput);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      iframeObserver.disconnect();
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('input', handleInput);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [enabled, activeEl, isOpen]);

  const handlePolish = (selectedTone: WritingTone = tone, promptText: string = customPrompt) => {
    if (!activeEl) return;
    const text = getElementText(activeEl);
    if (!text.trim()) return;

    setLoading(true);
    setErrorMsg('');
    setResult(null);
    setReplaced(false);
    setShowOriginal(false);
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
    }

    if (isExtensionContextValid()) {
      try {
        chrome.runtime.sendMessage(
          {
            action: 'POLISH_WRITING',
            payload: {
              text,
              tone: selectedTone,
              customInstruction: promptText.trim() || undefined
            }
          },
          (res) => {
            setLoading(false);
            if (hasRuntimeError()) {
              setErrorMsg('Không thể kết nối tiện ích. Hãy F5 tải lại trang web.');
              return;
            }
            if (res && res.ok && res.result) {
              setResult(res.result);
            } else {
              setErrorMsg(res?.error || 'Không thể kết nối AI để nâng cấp câu văn.');
            }
          }
        );
      } catch {
        setLoading(false);
        setErrorMsg('Tiện ích đã cập nhật. Hãy F5 tải lại trang web.');
      }
    } else {
      setLoading(false);
      setErrorMsg('Tiện ích đã cập nhật. Hãy F5 tải lại trang web.');
    }
  };

  const openPolishModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsOpen(true);
    handlePolish(tone, customPrompt);
  };

  const handleToneChange = (newTone: WritingTone) => {
    setTone(newTone);
    handlePolish(newTone, customPrompt);
  };

  const handleSpeak = (text: string) => {
    if (!window.speechSynthesis) return;
    if (isPlayingAudio) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.onstart = () => setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleReplaceText = () => {
    if (!activeEl || !result) return;
    const newText = result.improvedText;

    try {
      activeEl.focus();

      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        const proto = activeEl instanceof HTMLInputElement
          ? window.HTMLInputElement.prototype
          : window.HTMLTextAreaElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

        if (nativeSetter) {
          nativeSetter.call(activeEl, newText);
        } else {
          activeEl.value = newText;
        }

        activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        activeEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (activeEl.isContentEditable) {
        let replacedViaExec = false;
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(activeEl);
          selection?.removeAllRanges();
          selection?.addRange(range);
          replacedViaExec = document.execCommand('insertText', false, newText);
        } catch {
          replacedViaExec = false;
        }

        if (!replacedViaExec) {
          activeEl.innerText = newText;
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (activeEl instanceof HTMLIFrameElement) {
        try {
          const doc = activeEl.contentDocument;
          if (doc && doc.body) {
            const body = doc.body;
            body.focus();
            let replacedViaExec = false;
            try {
              const win = doc.defaultView || window;
              const selection = win.getSelection();
              const range = doc.createRange();
              range.selectNodeContents(body);
              selection?.removeAllRanges();
              selection?.addRange(range);
              replacedViaExec = doc.execCommand('insertText', false, newText);
            } catch {
              replacedViaExec = false;
            }

            if (!replacedViaExec) {
              body.innerText = newText;
              body.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        } catch (err) {
          console.warn('Replace text in iframe error:', err);
        }
      }
    } catch (err) {
      console.warn('Replace text error:', err);
    }

    setReplaced(true);
    setTimeout(() => {
      setIsOpen(false);
      setFabPos(null);
    }, 600);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.improvedText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Keyboard navigation & shortcuts inside modal
  useEffect(() => {
    if (!isOpen) {
      if (isPlayingAudio && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        setIsPlayingAudio(false);
      }
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputActive = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
      if (isInputActive) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsOpen(false);
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleReplaceText();
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C')) {
        handleCopy();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === '1') handleToneChange('professional');
        else if (e.key === '2') handleToneChange('concise');
        else if (e.key === '3') handleToneChange('casual');
        else if (e.key === '4') handleToneChange('grammar_only');
        else if (e.key === 'p' || e.key === 'P') {
          if (result) handleSpeak(result.improvedText);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, result, tone, isPlayingAudio, customPrompt]);

  if (!enabled) return null;

  const currentToneObj = TONES.find((t) => t.id === tone) || TONES[0];

  return (
    <>
      {/* Self-contained styling for animations and isolation */}
      <style>{`
        @keyframes engFabGlow {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4), 0 4px 12px rgba(79, 70, 229, 0.4);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(99, 102, 241, 0.15), 0 6px 16px rgba(79, 70, 229, 0.6);
          }
        }
        @keyframes engModalIn {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes engSoundPulse {
          0%, 100% { height: 4px; }
          50% { height: 13px; }
        }
        @keyframes engSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .eng-spin-fast {
          animation: engSpin 0.8s linear infinite;
        }
      `}</style>

      {/* Floating Action Badge on Active Input (Minimal Circular Icon) */}
      {fabPos && !isOpen && (
        <div
          onClick={openPolishModal}
          onMouseEnter={() => setFabHovered(true)}
          onMouseLeave={() => setFabHovered(false)}
          style={{
            position: 'fixed',
            left: fabPos.x,
            top: fabPos.y,
            zIndex: 2147483646,
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#ffffff',
            cursor: 'pointer',
            animation: 'engFabGlow 2.5s infinite ease-in-out',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            transform: fabHovered ? 'scale(1.12)' : 'scale(1)',
            transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s ease',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxSizing: 'border-box',
          }}
          title="Nâng cấp tiếng Anh với AI (Grammar & Polish)"
        >
          <Sparkles size={13} color="#ffffff" />
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
            width: 360,
            maxHeight: '86vh',
            overflowY: 'auto',
            background: 'linear-gradient(175deg, rgba(15, 23, 42, 0.97) 0%, rgba(10, 15, 29, 0.99) 100%)',
            backdropFilter: 'blur(28px) saturate(190%)',
            WebkitBackdropFilter: 'blur(28px) saturate(190%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 16,
            boxShadow: '0 24px 56px -10px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(99, 102, 241, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.18)',
            zIndex: 2147483647,
            padding: 16,
            color: '#ffffff',
            fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12,
            lineHeight: 1.45,
            animation: 'engModalIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            boxSizing: 'border-box',
          }}
        >
          {/* Ambient Top Glow */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 30,
              right: 30,
              height: 2,
              background: `linear-gradient(90deg, transparent, ${currentToneObj.accent}, transparent)`,
              opacity: 0.9,
              borderRadius: '2px 2px 0 0',
            }}
          />

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%)',
                  border: '1px solid rgba(168, 85, 247, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sparkles size={12} color="#c084fc" />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#f8fafc', letterSpacing: '0.2px', display: 'flex', alignItems: 'center', gap: 5 }}>
                  AI Writing Copilot
                  <span style={{ 
                    fontSize: 9.5, 
                    fontWeight: 700, 
                    color: currentToneObj.accent, 
                    background: 'rgba(255, 255, 255, 0.06)',
                    padding: '1px 5px',
                    borderRadius: 4,
                    border: `1px solid ${currentToneObj.accent}40`
                  }}>
                    {currentToneObj.sub}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600 }}>Esc</span>
              <div 
                onClick={() => setIsOpen(false)}
                style={{ 
                  cursor: 'pointer', 
                  color: '#94a3b8', 
                  padding: 4, 
                  display: 'flex',
                  borderRadius: 6,
                  transition: 'background 0.15s ease, color 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#94a3b8';
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Đóng (Esc)"
              >
                <X size={15} />
              </div>
            </div>
          </div>

          {/* Tone Selector: Interactive Segmented Pill Bar */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: 4, 
            marginBottom: 12,
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            padding: 3,
            borderRadius: 10
          }}>
            {TONES.map((t, idx) => {
              const Icon = t.icon;
              const isSelected = tone === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleToneChange(t.id)}
                  disabled={loading}
                  style={{
                    background: isSelected 
                      ? 'linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(79, 70, 229, 0.95) 100%)' 
                      : 'transparent',
                    color: isSelected ? '#ffffff' : '#94a3b8',
                    border: isSelected ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent',
                    boxShadow: isSelected ? '0 2px 8px rgba(79, 70, 229, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)' : 'none',
                    borderRadius: 7,
                    padding: '6px 4px',
                    fontSize: 10.5,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 3,
                    transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.color = '#f1f5f9';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                  title={`${t.label}: ${t.tooltip} (Phím [${idx + 1}])`}
                >
                  <Icon size={12} color={isSelected ? '#ffffff' : t.accent} />
                  <span style={{ lineHeight: 1 }}>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Custom Prompt Input Bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid ' + (customPrompt.trim() ? 'rgba(129, 140, 248, 0.5)' : 'rgba(255, 255, 255, 0.1)'),
              borderRadius: 8,
              padding: '3px 6px 3px 9px',
              transition: 'all 0.2s ease',
              boxShadow: customPrompt.trim() ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
            }}>
              <Sparkles size={12} color={customPrompt.trim() ? '#818cf8' : '#94a3b8'} style={{ flexShrink: 0 }} />
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePolish(tone, customPrompt);
                  }
                }}
                placeholder="Yêu cầu riêng (vd: thêm cảm ơn, deadline, lịch thiệp hơn...)"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#ffffff',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  padding: '4px 0',
                }}
              />
              {customPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomPrompt('');
                    handlePolish(tone, '');
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    borderRadius: 4,
                  }}
                  title="Xóa yêu cầu riêng"
                >
                  <X size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => handlePolish(tone, customPrompt)}
                disabled={loading}
                style={{
                  background: customPrompt.trim()
                    ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)'
                    : 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: 5,
                  padding: '3px 7px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  fontSize: 10,
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                }}
                title="Gửi prompt tùy chỉnh (Enter)"
              >
                <ArrowRight size={11} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          {loading ? (
            <div style={{ 
              padding: '28px 16px', 
              textAlign: 'center', 
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: 12,
              marginBottom: 8
            }}>
              <RefreshCw size={20} color="#818cf8" className="eng-spin-fast" style={{ margin: '0 auto 10px auto', display: 'block' }} />
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.2px' }}>
                Đang nâng cấp câu văn...
              </div>
              <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 4 }}>
                Phong cách: <span style={{ color: currentToneObj.accent, fontWeight: 600 }}>{currentToneObj.label}</span>
              </div>
            </div>
          ) : errorMsg ? (
            <div style={{ 
              background: 'rgba(239, 68, 68, 0.12)', 
              border: '1px solid rgba(239, 68, 68, 0.3)', 
              borderRadius: 10, 
              padding: '10px 12px', 
              color: '#fca5a5',
              fontSize: 11.5,
              marginBottom: 10,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8
            }}>
              <div style={{ flex: 1 }}>{errorMsg}</div>
              <button
                onClick={() => handlePolish(tone)}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap'
                }}
              >
                Thử lại
              </button>
            </div>
          ) : result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Polished Result Showcase Card */}
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.04)', 
                border: '1px solid rgba(255, 255, 255, 0.1)', 
                borderRadius: 12, 
                padding: '12px 14px',
                position: 'relative',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)'
              }}>
                {/* Meta Bar inside Card: Mode & Quick Tools */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ 
                      fontSize: 10, 
                      fontWeight: 700, 
                      color: showOriginal ? '#fbbf24' : currentToneObj.accent,
                      background: showOriginal ? 'rgba(251, 191, 36, 0.12)' : `${currentToneObj.accent}18`,
                      padding: '2px 7px',
                      borderRadius: 5,
                      border: `1px solid ${showOriginal ? 'rgba(251, 191, 36, 0.3)' : currentToneObj.accent + '35'}`,
                      letterSpacing: '0.2px'
                    }}>
                      {showOriginal 
                        ? '📝 Câu gốc ban đầu' 
                        : customPrompt.trim() 
                          ? `✦ ${currentToneObj.label} • Theo prompt riêng` 
                          : `✦ Chuẩn ${currentToneObj.label}`}
                    </span>
                  </div>

                  {/* Micro Tool Actions (Audio, Toggle Original, Re-roll) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {/* Audio pronunciation button */}
                    <button
                      onClick={() => handleSpeak(showOriginal ? result.originalText : result.improvedText)}
                      style={{
                        background: isPlayingAudio ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid ' + (isPlayingAudio ? 'rgba(99, 102, 241, 0.5)' : 'rgba(255, 255, 255, 0.1)'),
                        color: isPlayingAudio ? '#a5b4fc' : '#cbd5e1',
                        borderRadius: 6,
                        padding: '4px 6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        fontWeight: 600,
                        transition: 'all 0.15s ease',
                      }}
                      title="Nghe phát âm chuẩn bản ngữ (Phím P)"
                    >
                      {isPlayingAudio ? (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <div style={{ width: 2, height: 8, background: '#a5b4fc', animation: 'engSoundPulse 0.4s infinite alternate' }} />
                            <div style={{ width: 2, height: 12, background: '#a5b4fc', animation: 'engSoundPulse 0.6s infinite alternate' }} />
                            <div style={{ width: 2, height: 6, background: '#a5b4fc', animation: 'engSoundPulse 0.5s infinite alternate' }} />
                          </div>
                          <span>Dừng</span>
                        </>
                      ) : (
                        <>
                          <Volume2 size={11} />
                          <span>Nghe</span>
                        </>
                      )}
                    </button>

                    {/* View original toggle button */}
                    <button
                      onClick={() => setShowOriginal(!showOriginal)}
                      style={{
                        background: showOriginal ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid ' + (showOriginal ? 'rgba(251, 191, 36, 0.35)' : 'rgba(255, 255, 255, 0.1)'),
                        color: showOriginal ? '#fde047' : '#cbd5e1',
                        borderRadius: 6,
                        padding: '4px 6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3.5,
                        fontSize: 10,
                        fontWeight: 600,
                        transition: 'all 0.15s ease',
                      }}
                      title={showOriginal ? 'Xem câu đã sửa' : 'So sánh với câu gốc'}
                    >
                      {showOriginal ? <EyeOff size={11} /> : <Eye size={11} />}
                      <span>{showOriginal ? 'Bản sửa' : 'Câu gốc'}</span>
                    </button>

                    {/* Re-roll button */}
                    <button
                      onClick={() => handlePolish(tone, customPrompt)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#cbd5e1',
                        borderRadius: 6,
                        padding: '4px 5px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.15s ease',
                      }}
                      title="Làm mới câu văn"
                    >
                      <RefreshCw size={11} />
                    </button>
                  </div>
                </div>

                {/* The Sentence Text */}
                <div style={{ 
                  fontSize: 13.5, 
                  color: showOriginal ? '#cbd5e1' : '#ffffff', 
                  fontWeight: 600, 
                  lineHeight: 1.5,
                  letterSpacing: '0.1px',
                  userSelect: 'text',
                  fontStyle: showOriginal ? 'italic' : 'normal'
                }}>
                  {showOriginal ? result.originalText : result.improvedText}
                </div>

                {/* Compact Action Toolbar directly inside the edited text card */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end', 
                  gap: 6,
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: '1px solid rgba(255, 255, 255, 0.07)'
                }}>
                  {/* Copy Button (Icon only) */}
                  <button
                    onClick={handleCopy}
                    style={{
                      background: copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
                      color: copied ? '#34d399' : '#cbd5e1',
                      border: '1px solid ' + (copied ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.12)'),
                      borderRadius: 6,
                      padding: '5px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.18s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.12)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = copied ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)';
                    }}
                    title={copied ? 'Đã sao chép vào clipboard!' : 'Sao chép nội dung (⌘C / Ctrl+C)'}
                  >
                    {copied ? <Check size={13} color="#34d399" strokeWidth={2.5} /> : <Copy size={13} />}
                  </button>

                  {/* Apply Button (Icon only with enter hint) */}
                  <button
                    onClick={handleReplaceText}
                    style={{
                      background: replaced 
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                        : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      borderRadius: 6,
                      padding: '5px 9px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4,
                      boxShadow: replaced 
                        ? '0 2px 8px rgba(16, 185, 129, 0.4)' 
                        : '0 2px 10px rgba(99, 102, 241, 0.35)',
                      transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.filter = 'brightness(1.08)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.filter = 'brightness(1)';
                    }}
                    title={replaced ? 'Đã áp dụng vào ô nhập!' : 'Áp dụng vào ô nhập (Phím Enter)'}
                  >
                    <Check size={13} strokeWidth={2.5} />
                    <span style={{ 
                      background: 'rgba(255, 255, 255, 0.2)', 
                      padding: '0 3.5px', 
                      borderRadius: 3, 
                      fontSize: 9, 
                      fontWeight: 800,
                    }}>
                      ↵
                    </span>
                  </button>
                </div>
              </div>

              {/* Collapsible Details: Diffs & Explanations */}
              {((result.corrections && result.corrections.length > 0) || result.explanation) && (
                <div style={{ 
                  marginTop: 4, 
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)', 
                  paddingTop: 8 
                }}>
                  <div
                    onClick={() => setShowDetails(!showDetails)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: showDetails ? '#f8fafc' : '#94a3b8',
                      padding: '5px 6px',
                      borderRadius: 6,
                      background: showDetails ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                      userSelect: 'none',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      if (!showDetails) e.currentTarget.style.color = '#cbd5e1';
                    }}
                    onMouseLeave={(e) => {
                      if (!showDetails) e.currentTarget.style.color = '#94a3b8';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ 
                        background: 'rgba(99, 102, 241, 0.2)', 
                        color: '#c7d2fe', 
                        padding: '1px 6px', 
                        borderRadius: 10, 
                        fontSize: 9.5, 
                        fontWeight: 800 
                      }}>
                        {result.corrections?.length || 1}
                      </span>
                      <span style={{ fontWeight: 600 }}>
                        {result.corrections?.length ? `Xem ${result.corrections.length} điểm tối ưu & giải thích` : 'Xem giải thích chi tiết'}
                      </span>
                    </div>
                    {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </div>

                  {showDetails && (
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: 6, 
                      marginTop: 8, 
                      maxHeight: 180, 
                      overflowY: 'auto',
                      paddingRight: 2 
                    }}>
                      {result.corrections?.map((corr, idx) => (
                        <div 
                          key={idx} 
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.03)', 
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                            padding: '8px 10px', 
                            borderRadius: 8, 
                            fontSize: 11 
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ 
                              color: '#f87171', 
                              textDecoration: 'line-through',
                              background: 'rgba(239, 68, 68, 0.1)',
                              padding: '1px 5px',
                              borderRadius: 4
                            }}>
                              {corr.original}
                            </span>
                            <ArrowRight size={10} color="#94a3b8" />
                            <span style={{ 
                              color: '#34d399', 
                              fontWeight: 700,
                              background: 'rgba(16, 185, 129, 0.12)',
                              padding: '1px 5px',
                              borderRadius: 4
                            }}>
                              {corr.replacement}
                            </span>
                          </div>
                          <div style={{ color: '#94a3b8', fontSize: 10.5, lineHeight: 1.4 }}>
                            {corr.reason}
                          </div>
                        </div>
                      ))}

                      {result.explanation && (
                        <div style={{ 
                          fontSize: 11, 
                          color: '#e2e8f0', 
                          background: 'rgba(99, 102, 241, 0.08)',
                          padding: '8px 10px', 
                          borderRadius: 8, 
                          borderLeft: '3px solid #818cf8',
                          lineHeight: 1.45,
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6
                        }}>
                          <Lightbulb size={13} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
                          <div>{result.explanation}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Pro Keyboard Tip Footer */}
              <div style={{ 
                marginTop: 2, 
                padding: '4px 2px', 
                fontSize: 9.5, 
                color: '#64748b', 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>💡 Phím [1-4]: Đổi tone</span>
                <span>[Enter]: Áp dụng</span>
                <span>[P]: Nghe đọc</span>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </>
  );
};
