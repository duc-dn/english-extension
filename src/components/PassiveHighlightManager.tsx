import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Volume2, Check, X } from 'lucide-react';
import type { Word } from '../lib/db';
import { playAudio } from '../lib/audio';
import { hasRuntimeError, isExtensionContextValid } from '../lib/extensionContext';

const addWordVariantsToMap = (rawWord: string, item: Word, map: Map<string, Word>) => {
  const base = rawWord.trim().toLowerCase();
  if (base.length < 2) return;
  map.set(base, item);

  // For words with at least 3 letters, index common inflections
  if (base.length >= 3) {
    if (base.endsWith('e')) {
      map.set(base + 's', item); // accommodates
      map.set(base + 'd', item); // accommodated
      map.set(base.slice(0, -1) + 'ing', item); // accommodating
    } else if (base.endsWith('y') && !/[aeiou]y$/.test(base)) {
      map.set(base.slice(0, -1) + 'ies', item);
      map.set(base.slice(0, -1) + 'ied', item);
      map.set(base + 'ing', item);
    } else {
      map.set(base + 's', item);
      map.set(base + 'es', item);
      map.set(base + 'ed', item);
      map.set(base + 'ing', item);
    }
  }
};

export const PassiveHighlightManager: React.FC = () => {
  const [learningWords, setLearningWords] = useState<Word[]>([]);
  const [activeWord, setActiveWord] = useState<Word | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const wordMapRef = useRef<Map<string, Word>>(new Map());
  const isHighlightingRef = useRef(false);

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
              parent.closest('.engext-passive-word')
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
        // Process up to 1500 text nodes to ensure long articles are fully highlighted
        if (textNodes.length > 1500) break;
      }

      textNodes.forEach((node) => {
        const text = node.textContent;
        if (!text) return;

        regex.lastIndex = 0;
        if (!regex.test(text)) return;

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

  // Fetch words and re-scan
  const refreshWords = useCallback(() => {
    const map = new Map<string, Word>();
    const allWords: Word[] = [];

    // 1. Also include local quiz vocab (e.g. gcp_user_vocab from GCP Quiz App)
    try {
      const localGcpVocabRaw = window.localStorage?.getItem('gcp_user_vocab');
      if (localGcpVocabRaw) {
        const list = JSON.parse(localGcpVocabRaw);
        if (Array.isArray(list)) {
          list.forEach((item: any) => {
            if (item && item.word && typeof item.word === 'string' && item.word.trim().length > 1) {
              const wObj: Word = {
                id: item.id || `gcp_${item.word.trim().toLowerCase()}`,
                word: item.word.trim(),
                meaning: item.meaning || '',
                example: '',
                tags: ['gcp-quiz'],
                created_at: new Date(item.createdAt || Date.now()),
                review_level: 1,
                next_review: new Date(),
                status: 'learning'
              };
              allWords.push(wObj);
              addWordVariantsToMap(item.word, wObj, map);
            }
          });
        }
      }
    } catch {
      // Ignored
    }

    // 2. Fetch learning words from extension background
    if (isExtensionContextValid()) {
      try {
        chrome.runtime.sendMessage({ action: 'GET_LEARNING_WORDS' }, (res) => {
          if (hasRuntimeError()) {
            if (map.size > 0) {
              setLearningWords(allWords);
              wordMapRef.current = map;
              setTimeout(() => scanAndHighlight(), 50);
            }
            return;
          }
          if (res && res.ok && Array.isArray(res.words)) {
            res.words.forEach((w: Word) => {
              allWords.push(w);
              addWordVariantsToMap(w.word, w, map);
            });
          }
          setLearningWords(allWords);
          wordMapRef.current = map;
          if (map.size > 0) {
            setTimeout(() => {
              scanAndHighlight();
            }, 50);
          }
        });
      } catch {
        if (map.size > 0) {
          setLearningWords(allWords);
          wordMapRef.current = map;
          setTimeout(() => scanAndHighlight(), 50);
        }
      }
    } else if (map.size > 0) {
      setLearningWords(allWords);
      wordMapRef.current = map;
      setTimeout(() => scanAndHighlight(), 50);
    }
  }, [scanAndHighlight]);

  // Load settings and words on mount, listen for storage and focus
  useEffect(() => {
    let listening = false;
    const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
      if (!isExtensionContextValid()) return;
      if (area === 'sync') {
        if (changes.enable_passive_highlight !== undefined) {
          const newVal = changes.enable_passive_highlight.newValue !== false;
          setEnabled(newVal);
          if (!newVal) {
            document.querySelectorAll('.engext-passive-word').forEach(el => {
              const parent = el.parentNode;
              if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ''), el);
              }
            });
            setActiveWord(null);
          }
        }
        if (changes.language !== undefined) {
          setLang(changes.language.newValue === 'en' ? 'en' : 'vi');
        }
      }
      if (area === 'local' && changes.last_vocab_updated_at !== undefined) {
        refreshWords();
      }
    };

    try {
      let headStyle = document.getElementById('engext-passive-head-style') as HTMLStyleElement | null;
      if (!headStyle) {
        headStyle = document.createElement('style');
        headStyle.id = 'engext-passive-head-style';
        headStyle.textContent = `
          .engext-passive-word {
            border-bottom: 2px dashed #9333ea !important;
            background-color: rgba(168, 85, 247, 0.08) !important;
            border-radius: 3px !important;
            padding: 0 2px !important;
            margin: 0 !important;
            cursor: pointer !important;
            transition: all 0.2s ease !important;
            color: inherit !important;
            text-decoration: none !important;
            font-weight: 500 !important;
            box-shadow: none !important;
            display: inline !important;
          }
          .engext-passive-word:hover {
            border-bottom: 2px solid #7c3aed !important;
            background-color: rgba(168, 85, 247, 0.2) !important;
            border-radius: 3px !important;
          }
          .engext-word-just-mastered {
            background-color: rgba(34, 197, 94, 0.15) !important;
            border-bottom: none !important;
            transition: background-color 1s ease !important;
          }
        `;
        document.head.appendChild(headStyle);
      }

      if (chrome.storage?.sync) {
        chrome.storage.sync.get({ enable_passive_highlight: true, language: 'vi' }, (items) => {
          if (hasRuntimeError()) return;
          setEnabled(items.enable_passive_highlight !== false);
          setLang(items.language === 'en' ? 'en' : 'vi');
        });
        chrome.storage.onChanged.addListener(onStorageChanged);
        listening = true;
      }
    } catch {
      // Ignored
    }

    refreshWords();

    const onFocus = () => {
      refreshWords();
    };
    window.addEventListener('focus', onFocus);

    const onWindowStorage = (e: StorageEvent) => {
      if (e.key === 'gcp_user_vocab') {
        refreshWords();
      }
    };
    window.addEventListener('storage', onWindowStorage);

    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onWindowStorage);
      if (listening) {
        try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch { /* invalidated */ }
      }
    };
  }, [refreshWords]);

  // Initial scan and debounced mutation observer
  useEffect(() => {
    if (!enabled || learningWords.length === 0) return;

    const timer = setTimeout(() => {
      scanAndHighlight();
    }, 200);

    let observerTimer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (observerTimer) clearTimeout(observerTimer);
      observerTimer = setTimeout(() => {
        scanAndHighlight();
      }, 250);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timer);
      if (observerTimer) clearTimeout(observerTimer);
      observer.disconnect();
    };
  }, [enabled, learningWords, scanAndHighlight]);

  // Handle both hover and click on highlighted words
  useEffect(() => {
    let hoverTimer: ReturnType<typeof setTimeout> | null = null;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;

    const showTooltipForEl = (target: HTMLElement) => {
      const wordId = target.dataset.wordId;
      const text = target.textContent?.trim().toLowerCase() || '';
      const found = (wordId ? learningWords.find(w => w.id === wordId) : null) || wordMapRef.current.get(text);
      if (found) {
        const rect = target.getBoundingClientRect();
        setActiveWord(found);
        setTooltipPos({
          x: Math.max(10, Math.min(window.innerWidth - 300, rect.left + rect.width / 2 - 140)),
          y: rect.bottom + 8 + window.scrollY,
        });
      }
    };

    const handleMouseOver = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest('.engext-passive-tooltip')) {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = null;
        return;
      }
      const target = (e.target as HTMLElement)?.closest('.engext-passive-word') as HTMLElement | null;
      if (target && target.dataset.wordId) {
        if (leaveTimer) clearTimeout(leaveTimer);
        leaveTimer = null;
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => {
          showTooltipForEl(target);
        }, 180);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const current = e.target as HTMLElement;
      if (!current?.closest('.engext-passive-word, .engext-passive-tooltip')) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest('.engext-passive-tooltip') || related?.closest('.engext-passive-word')) {
        return;
      }
      if (hoverTimer) clearTimeout(hoverTimer);
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        setActiveWord(null);
      }, 300);
    };

    const handleMouseClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('.engext-passive-word') as HTMLElement | null;
      if (target && target.dataset.wordId) {
        if (hoverTimer) clearTimeout(hoverTimer);
        if (leaveTimer) clearTimeout(leaveTimer);
        showTooltipForEl(target);
        e.stopPropagation();
        return;
      }

      // If clicked outside tooltip, close it
      const tooltipEl = document.querySelector('.engext-passive-tooltip');
      if (tooltipEl && !tooltipEl.contains(e.target as Node)) {
        setActiveWord(null);
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('click', handleMouseClick);

    return () => {
      if (hoverTimer) clearTimeout(hoverTimer);
      if (leaveTimer) clearTimeout(leaveTimer);
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('click', handleMouseClick);
    };
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

  if (!enabled) return null;

  return (
    <>
      <style>{`
        .engext-passive-word {
          border-bottom: 2px dashed #9333ea !important;
          background-color: rgba(168, 85, 247, 0.08) !important;
          border-radius: 3px !important;
          padding: 0 2px !important;
          margin: 0 !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          color: inherit !important;
          text-decoration: none !important;
          font-weight: 500 !important;
          box-shadow: none !important;
          display: inline !important;
        }
        .engext-passive-word:hover {
          border-bottom: 2px solid #7c3aed !important;
          background-color: rgba(168, 85, 247, 0.2) !important;
          border-radius: 3px !important;
        }
        .engext-word-just-mastered {
          background-color: rgba(34, 197, 94, 0.15) !important;
          border-bottom: none !important;
          transition: background-color 1s ease !important;
        }
      `}</style>

      {activeWord && tooltipPos && (
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

        {/* Footer: Turn off quick option & Mark Mastered */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (chrome.storage?.sync) {
                chrome.storage.sync.set({ enable_passive_highlight: false });
              }
              setEnabled(false);
              document.querySelectorAll('.engext-passive-word').forEach(el => {
                const parent = el.parentNode;
                if (parent) {
                  parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                }
              });
              setActiveWord(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: 10.5,
              padding: '2px 0',
              textDecoration: 'underline',
              opacity: 0.85,
            }}
            title={lang === 'vi' ? 'Tắt tính năng tự động gạch chân từ đang học (bật lại được trong Cài đặt)' : 'Turn off passive word highlight (can re-enable in Settings)'}
          >
            {lang === 'vi' ? 'Tắt gạch chân từ' : 'Turn off highlight'}
          </button>

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
    )}
  </>
);
};
