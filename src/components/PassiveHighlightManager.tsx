import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Volume2, Check, X } from 'lucide-react';
import type { Word } from '../lib/db';
import { playAudio } from '../lib/audio';
import { hasRuntimeError, isExtensionContextValid } from '../lib/extensionContext';

export const PassiveHighlightManager: React.FC = () => {
  const [learningWords, setLearningWords] = useState<Word[]>([]);
  const [activeWord, setActiveWord] = useState<Word | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const wordMapRef = useRef<Map<string, Word>>(new Map());
  const isHighlightingRef = useRef(false);

  // Load settings and words on mount
  useEffect(() => {
    if (!isExtensionContextValid()) return;

    // Check setting
    let listening = false;
    const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (!isExtensionContextValid()) return;
      if (area === 'sync') {
        if (changes.enable_passive_highlight !== undefined) {
          setEnabled(changes.enable_passive_highlight.newValue !== false);
        }
        if (changes.language !== undefined) {
          setLang(changes.language.newValue === 'en' ? 'en' : 'vi');
        }
      }
    };

    try {
      if (chrome.storage?.sync) {
        chrome.storage.sync.get({ enable_passive_highlight: true, language: 'vi' }, (items) => {
          if (hasRuntimeError()) return;
          setEnabled(items.enable_passive_highlight !== false);
          setLang(items.language === 'en' ? 'en' : 'vi');
        });
        chrome.storage.onChanged.addListener(onStorageChanged);
        listening = true;
      }

      // Fetch learning words from background
      chrome.runtime.sendMessage({ action: 'GET_LEARNING_WORDS' }, (res) => {
        if (hasRuntimeError()) return;
        if (res && res.ok && Array.isArray(res.words) && res.words.length > 0) {
          setLearningWords(res.words);
          const map = new Map<string, Word>();
          res.words.forEach((w: Word) => {
            if (w.word && w.word.trim().length > 1) {
              map.set(w.word.trim().toLowerCase(), w);
            }
          });
          wordMapRef.current = map;
        }
      });
    } catch {
      // A tab can keep this content script alive after the extension reloads.
    }

    return () => {
      if (listening) {
        try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* invalidated */ }
      }
    };
  }, []);

  // Highlight DOM nodes matching vocabulary
  const scanAndHighlight = useCallback(() => {
    if (!enabled || isHighlightingRef.current || wordMapRef.current.size === 0) return;
    isHighlightingRef.current = true;

    try {
      const words = Array.from(wordMapRef.current.keys()).sort((a, b) => b.length - a.length);
      if (words.length === 0) return;

      const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const regex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node: Node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            const tag = parent.tagName.toUpperCase();
            if (
              tag === 'SCRIPT' ||
              tag === 'STYLE' ||
              tag === 'NOSCRIPT' ||
              tag === 'CODE' ||
              tag === 'PRE' ||
              tag === 'TEXTAREA' ||
              tag === 'INPUT' ||
              parent.isContentEditable ||
              parent.closest('#eng-ext-root') ||
              parent.closest('.engext-passive-word') ||
              parent.closest('mark')
            ) {
              return NodeFilter.FILTER_REJECT;
            }

            if (!node.textContent || node.textContent.trim().length < 2) {
              return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

      const textNodes: Text[] = [];
      let currentNode: Node | null;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode as Text);
        // Limit batch to prevent page freeze on huge Wikipedia pages
        if (textNodes.length > 300) break;
      }

      textNodes.forEach((node) => {
        const text = node.textContent;
        if (!text || !regex.test(text)) return;

        regex.lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let lastIdx = 0;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const matchWord = match[0];
          const matchedItem = wordMapRef.current.get(matchWord.toLowerCase());
          if (!matchedItem) continue;

          // Append text before match
          if (match.index > lastIdx) {
            fragment.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
          }

          // Create highlight element
          const span = document.createElement('span');
          span.className = 'engext-passive-word';
          span.dataset.wordId = matchedItem.id;
          span.textContent = matchWord;
          fragment.appendChild(span);

          lastIdx = match.index + matchWord.length;
        }

        if (lastIdx < text.length) {
          fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
        }

        if (fragment.childNodes.length > 0 && node.parentNode) {
          node.parentNode.replaceChild(fragment, node);
        }
      });
    } catch (e) {
      // Ignore scanning error
    } finally {
      isHighlightingRef.current = false;
    }
  }, [enabled]);

  // Initial scan and debounced mutation observer
  useEffect(() => {
    if (!enabled || learningWords.length === 0) return;

    const timer = setTimeout(() => {
      scanAndHighlight();
    }, 800);

    let observerTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (observerTimer) clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        scanAndHighlight();
      }, 1500);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      if (observerTimer) clearTimeout(observerTimer);
      observer.disconnect();
    };
  }, [enabled, learningWords, scanAndHighlight]);

  // Handle click on highlighted words
  useEffect(() => {
    const handleMouseClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('.engext-passive-word') as HTMLElement | null;
      if (target && target.dataset.wordId) {
        const wordId = target.dataset.wordId;
        const found = learningWords.find(w => w.id === wordId);
        if (found) {
          const rect = target.getBoundingClientRect();
          setActiveWord(found);
          setTooltipPos({
            x: Math.max(10, Math.min(window.innerWidth - 300, rect.left + rect.width / 2 - 140)),
            y: rect.bottom + 8 + window.scrollY,
          });
          e.stopPropagation();
          return;
        }
      }

      // If clicked outside tooltip, close it
      const tooltipEl = document.querySelector('.engext-passive-tooltip');
      if (tooltipEl && !tooltipEl.contains(e.target as Node)) {
        setActiveWord(null);
      }
    };

    document.addEventListener('click', handleMouseClick);
    return () => document.removeEventListener('click', handleMouseClick);
  }, [learningWords]);

  const handleMarkMastered = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeWord) return;

    if (isExtensionContextValid()) {
      try {
        chrome.runtime.sendMessage({ action: 'MARK_WORD_MASTERED', payload: { id: activeWord.id } }, () => {
          if (hasRuntimeError()) return;
          // Remove highlight from page elements
          const elements = document.querySelectorAll(`[data-word-id="${activeWord.id}"]`);
          elements.forEach(el => {
            el.classList.remove('engext-passive-word');
            el.classList.add('engext-word-just-mastered');
          });
          setActiveWord(null);
        });
      } catch { /* extension reloaded */ }
    }
  };

  if (!enabled || !activeWord || !tooltipPos) return null;

  return (
    <>
      <style>{`
        .engext-passive-word {
          border-bottom: 2px dotted #8b5cf6 !important;
          background-color: rgba(139, 92, 246, 0.08) !important;
          border-radius: 2px !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          color: inherit !important;
          text-decoration: none !important;
          font-weight: 500 !important;
        }
        .engext-passive-word:hover {
          background-color: rgba(139, 92, 246, 0.22) !important;
          border-bottom: 2px solid #8b5cf6 !important;
        }
        .engext-word-just-mastered {
          background-color: rgba(34, 197, 94, 0.2) !important;
          transition: background-color 1s ease !important;
        }
      `}</style>

      <div
        className="engext-passive-tooltip"
        style={{
          position: 'absolute',
          left: tooltipPos.x,
          top: tooltipPos.y,
          width: 290,
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 14,
          padding: 14,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.35)',
          border: '1px solid rgba(79, 70, 229, 0.35)',
          zIndex: 2147483647,
          color: '#ffffff',
          fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 13,
          lineHeight: 1.4,
          animation: 'fadeIn 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ 
              background: '#4f46e5', 
              color: '#fff', 
              fontSize: 10, 
              fontWeight: 700, 
              padding: '2px 7px', 
              borderRadius: 6,
              letterSpacing: 0.3 
            }}>
              Ghi nhớ SRS
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {activeWord.status === 'learning' ? 'Đang học' : 'Từ mới'}
            </span>
          </div>

          <div 
            onClick={() => setActiveWord(null)}
            style={{ cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex' }}
          >
            <X size={14} />
          </div>
        </div>

        {/* Word, Phonetic, Audio */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
          <strong style={{ fontSize: 19, color: '#ffffff', fontFamily: '"Lora", Georgia, serif', fontWeight: 600 }}>
            {activeWord.word}
          </strong>
          {activeWord.phonetic && (
            <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
              {activeWord.phonetic}
            </span>
          )}
          <div
            onClick={(e) => {
              e.stopPropagation();
              playAudio(activeWord.word);
            }}
            style={{ cursor: 'pointer', color: '#818cf8', display: 'flex', padding: 2 }}
            title="Nghe phát âm"
          >
            <Volume2 size={14} />
          </div>
        </div>

        {/* Meaning */}
        <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 500, marginBottom: 8 }}>
          {activeWord.meaning}
        </div>

        {/* Example */}
        {activeWord.example && (
          <div style={{ 
            fontSize: 12.5, 
            color: '#e2e8f0', 
            fontStyle: 'italic', 
            fontFamily: '"Lora", Georgia, serif',
            background: 'rgba(255, 255, 255, 0.05)', 
            padding: '7px 10px', 
            borderRadius: 6,
            marginBottom: 10,
            borderLeft: '2px solid #4f46e5'
          }}>
            "{activeWord.example}"
          </div>
        )}

        {/* Mark Mastered Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
          <button
            onClick={handleMarkMastered}
            style={{
              background: '#059669',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
            }}
          >
            <Check size={12} />
            {lang === 'vi' ? 'Đã nhớ từ này' : 'Mark Mastered'}
          </button>
        </div>
      </div>
    </>
  );
};
