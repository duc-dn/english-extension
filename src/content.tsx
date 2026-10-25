import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Volume2, Check, Bookmark, Copy } from 'lucide-react';
import { fetchBasicMeaning, translateSentence, translateSentenceWithAI, explainWord } from './lib/translator';
import { getSettings, isAIConfigured } from './lib/settings';
import { PassiveHighlightManager } from './components/PassiveHighlightManager';
import { WritingAssistantOverlay } from './components/WritingAssistantOverlay';
import { FloatingPomodoroOverlay } from './components/FloatingPomodoroOverlay';
import { hasRuntimeError, isExtensionContextValid } from './lib/extensionContext';
import { GoogleDocsSelectionTracker } from './lib/googleDocsA11y';

const isGoogleDocsEditor = () => window.location.hostname === 'docs.google.com' &&
  window.location.pathname.startsWith('/document/');

const isDocsEditingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return !!target.closest('.kix-appview-editor, .docs-texteventtarget-iframe, .docs-texteventtarget');
};

let lastDocsPasteAt = 0;
const MAX_TRANSLATION_SELECTION_LENGTH = 5000;

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'GET_GOOGLE_DOCS_PASTE_TIME') {
    sendResponse({ lastPasteAt: lastDocsPasteAt });
  }
});

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
  const [hasAiProvider, setHasAiProvider] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [copiedAi, setCopiedAi] = useState(false);
  const [currentContext, setCurrentContext] = useState('');

  const handleCopyAi = () => {
    if (!aiResult) return;
    try {
      navigator.clipboard.writeText(aiResult).then(() => {
        setCopiedAi(true);
        setTimeout(() => setCopiedAi(false), 2000);
      });
    } catch {
      // fallback
      try {
        const t = document.createElement('textarea');
        t.value = aiResult;
        t.style.position = 'fixed';
        t.style.left = '-9999px';
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
        setCopiedAi(true);
        setTimeout(() => setCopiedAi(false), 2000);
      } catch (e) {
        // ignore
      }
    }
  };

  interface SelectionRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  }

  const getSelectionDimensions = (selection: Selection | null): SelectionRect | null => {
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const clientRects = Array.from(range.getClientRects()).filter(r => r.width > 0 && r.height > 0);
    
    if (clientRects.length > 0) {
      const minLeft = Math.min(...clientRects.map(r => r.left));
      const maxRight = Math.max(...clientRects.map(r => r.right));
      const minTop = Math.min(...clientRects.map(r => r.top));
      const maxBottom = Math.max(...clientRects.map(r => r.bottom));
      
      return {
        left: minLeft,
        top: minTop,
        right: maxRight,
        bottom: maxBottom,
        width: Math.max(maxRight - minLeft, 10),
        height: Math.max(maxBottom - minTop, 10)
      };
    }
    
    const bRect = range.getBoundingClientRect();
    if (bRect && (bRect.width > 0 || bRect.height > 0)) {
      return {
        left: bRect.left,
        top: bRect.top,
        right: bRect.right,
        bottom: bRect.bottom,
        width: bRect.width,
        height: bRect.height
      };
    }
    return null;
  };

  const [triggerPosition, setTriggerPosition] = useState<{ x: number, y: number } | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [pendingRect, setPendingRect] = useState<SelectionRect | null>(null);
  const showTriggerIconRef = useRef(true);
  const lastDocsPointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (isExtensionContextValid() && chrome.storage?.sync) {
      try {
        getSettings().then((settings) => {
          if (!isExtensionContextValid()) return;
          const lang = settings.language || 'vi';
          setCurrentLang(lang === 'en' ? 'en' : 'vi');
          setHasAiProvider(isAIConfigured(settings));
          showTriggerIconRef.current = settings.show_trigger_icon !== false;
        });

        const listener = (changes: any, areaName: string) => {
          if (!isExtensionContextValid()) return;
          if (areaName === 'sync') {
            if (changes.language) {
              const newVal = changes.language.newValue;
              setCurrentLang(newVal === 'en' ? 'en' : 'vi');
            }
            if (changes.show_trigger_icon) {
              const show = changes.show_trigger_icon.newValue !== false;
              showTriggerIconRef.current = show;
              if (!show) {
                setTriggerPosition(null);
              }
            }
            if (changes.ai_provider || changes.antigravity_model || changes.gemini_api_key || changes.openai_api_key || changes.chatgpt_access_token || changes.ollama_url || changes.deepseek_api_key || changes.deepseek_web_token || changes.deepseek_auth_type || changes.deepseek_proxy_url) {
              try {
                getSettings().then((settings) => {
                  if (isExtensionContextValid()) setHasAiProvider(isAIConfigured(settings));
                });
              } catch { /* extension reloaded */ }
            }
          }
        };
        chrome.storage.onChanged.addListener(listener);
        return () => {
          try { chrome.storage.onChanged.removeListener(listener); } catch { /* extension reloaded */ }
        };
      } catch { /* extension reloaded before the effect ran */ }
    }
  }, []);

  const triggerTranslation = async (text: string, rect: SelectionRect) => {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const phrase = wordCount > 1;
    setIsPhrase(phrase);

    // Calculate width to match the selected text width accurately
    let width = 280;
    if (phrase) {
      // For phrases / sentences, match the width of the selected text
      const textWidth = Math.round(rect.width);
      // Min 220px for controls, Max 650px or viewport width - 32px
      width = Math.max(textWidth, 220);
      width = Math.min(width, Math.min(window.innerWidth - 32, 650));
    } else {
      // For single words, make it compact around 240px - 320px
      width = Math.min(Math.max(rect.width + 80, 240), 320);
    }
    setPopupWidth(width);

    // Calculate left position (x)
    let x = rect.left + window.scrollX;
    // For single word or small text, center under the selection
    if (!phrase || rect.width < width) {
      x = rect.left + window.scrollX + (rect.width / 2) - (width / 2);
    }

    // Ensure within screen bounds
    if (x < window.scrollX + 12) {
      x = window.scrollX + 12;
    }
    if (x + width > window.innerWidth + window.scrollX - 12) {
      x = window.innerWidth + window.scrollX - width - 12;
    }

    let y = rect.bottom + window.scrollY + 8;
    let showBelowText = true;

    // If near bottom of viewport, position above selection
    if (rect.bottom + 140 > window.innerHeight && rect.top > 140) {
      y = rect.top + window.scrollY - 8;
      showBelowText = false;
    }

    setTriggerPosition(null);
    setPosition({ x, y });
    setShowBelow(showBelowText);
    setSelectedText(text);
    setLoading(true);

    // Extract surrounding sentence/context for accurate contextual translation
    let surroundingContext = '';
    try {
      const selection = window.getSelection();
      if (selection && selection.anchorNode) {
        const fullText = selection.anchorNode.textContent || '';
        const sentences = fullText.split(/(?<=[.!?])\s+|\n+/);
        const matchedSentence = sentences.find(s => s.toLowerCase().includes(text.toLowerCase()));
        surroundingContext = matchedSentence ? matchedSentence.trim() : (fullText.trim().slice(0, 300));
      }
    } catch (e) {
      // ignore
    }
    setCurrentContext(surroundingContext);

    try {
      if (isExtensionContextValid() && chrome.storage?.local) {
        chrome.storage.local.set({ 
          shiftSelectedText: text,
          selectedSentenceContext: surroundingContext 
        });
      }
    } catch (e) {
      console.warn('Context is invalidated, cannot set storage:', e);
    }
    setPhonetic('');
    setMeaning('');
    setPartOfSpeech('');
    setIsSaved(false);
    setAiResult('');
    setAiLoading(false);

    try {
      if (!phrase) {
        const res = await fetchBasicMeaning(text, surroundingContext);
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
      
      const translated = await translateSentence(text, surroundingContext);
      setMeaning(translated);
      setPartOfSpeech('PHRASE');
    } catch (err) {
      console.error("Error translating phrase:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerClick = () => {
    if (pendingText && pendingRect) {
      triggerTranslation(pendingText, pendingRect);
    }
  };

  useEffect(() => {
    const docsSelection = new GoogleDocsSelectionTracker();
    let docsPublishTimer: number | null = null;
    let selectionPublishTimer: number | null = null;
    const getDocsSelectionRect = (): SelectionRect | null => {
      const overlayRect = Array.from(document.querySelectorAll('.kix-selection-overlay, .kix-canvas-tile-selection rect'))
        .map(el => el.getBoundingClientRect())
        .find(rect => rect.width > 0 && rect.height > 0);
      if (!overlayRect) return null;
      return {
        left: overlayRect.left, top: overlayRect.top,
        right: overlayRect.right, bottom: overlayRect.bottom,
        width: overlayRect.width, height: overlayRect.height,
      };
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (!isExtensionContextValid()) {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }
      if (e.key === 'Shift') {
        if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || !document.hasFocus()) return;
        const docsTarget = isGoogleDocsEditor() &&
          (isDocsEditingTarget(e.target) || isDocsEditingTarget(document.activeElement));
        const eventDocument = e.target instanceof Node ? e.target.ownerDocument : null;
        const frameSelection = docsTarget && eventDocument && eventDocument !== document
          ? eventDocument.getSelection() : null;
        const selection = frameSelection?.toString().trim() ? frameSelection : window.getSelection();
        const text = docsTarget ? docsSelection.text : selection?.toString().trim() || '';
        
        if (text && /[a-zA-Z]/.test(text) && text.length <= MAX_TRANSLATION_SELECTION_LENGTH) {
          let dims = docsTarget ? getDocsSelectionRect() || getSelectionDimensions(selection)
            : getSelectionDimensions(selection);
          if (!dims && docsTarget) {
            const pointer = lastDocsPointerRef.current;
            const x = pointer?.x ?? window.innerWidth / 2;
            const y = pointer?.y ?? window.innerHeight / 2;
            dims = { left: x, top: y - 20, right: x + 24, bottom: y, width: 24, height: 20 };
          }
          if (dims) {
            triggerTranslation(text, dims);
          }
        }
      }
    };

    const handleDocsPaste = () => { lastDocsPasteAt = Date.now(); };

    const handleDocsCopy = (e: ClipboardEvent) => {
      if (!isExtensionContextValid()) return;
      if (!isGoogleDocsEditor() || !showTriggerIconRef.current) return;
      const active = document.activeElement;
      if (!isDocsEditingTarget(e.target) && !isDocsEditingTarget(active)) return;

      // Docs renders its selection outside the normal DOM Selection API. Read
      // the result of the user's own Copy action after Docs fills the clipboard.
      window.setTimeout(async () => {
        if (!isExtensionContextValid()) return;
        if (!document.hasFocus() || !navigator.clipboard?.readText) return;
        try {
          const text = (await navigator.clipboard.readText()).trim();
          if (!text || !/[a-zA-Z]/.test(text) || text.length > MAX_TRANSLATION_SELECTION_LENGTH) return;

          const overlayRect = getDocsSelectionRect();
          const pointer = lastDocsPointerRef.current;
          const rect: SelectionRect = overlayRect || {
                left: pointer?.x ?? window.innerWidth / 2,
                top: pointer?.y ?? window.innerHeight / 2,
                right: (pointer?.x ?? window.innerWidth / 2) + 24,
                bottom: (pointer?.y ?? window.innerHeight / 2) + 20,
                width: 24, height: 20,
              };

          setPendingText(text);
          setPendingRect(rect);
          setTriggerPosition({
            x: Math.max(10, Math.min(rect.right - 14 + window.scrollX, window.scrollX + window.innerWidth - 38)),
            y: Math.max(10, rect.top - 36 + window.scrollY),
          });
        } catch {
          // Clipboard access can be blocked by browser or site policy.
        }
      }, 50);
    };

    const handleDocsPointer = (e: PointerEvent) => {
      if (isGoogleDocsEditor() && isDocsEditingTarget(e.target)) {
        lastDocsPointerRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isExtensionContextValid()) {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }

      // Short delay to let selection settle
      setTimeout(() => {
        if (!isExtensionContextValid()) return;
        const selection = window.getSelection();
        const text = selection?.toString().trim() || '';
        if (isGoogleDocsEditor()) scheduleDocsPublish();
        else publishChatSelection();

        // Prevent triggering inside inputs or editable elements (except Google Docs)
        const activeEl = document.activeElement;
        const isGoogleDocs = isGoogleDocsEditor();
        if (!isGoogleDocs && activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
          return;
        }

        if (!text || !/[a-zA-Z]/.test(text) || text.length > MAX_TRANSLATION_SELECTION_LENGTH) {
          const target = e.target as HTMLElement;
          if (!target.closest('#eng-ext-floating-btn') && !target.closest('#eng-ext-trigger-btn')) {
            setTriggerPosition(null);
            setPosition(null);
            setSelectedText('');
          }
          return;
        }

        const target = e.target as HTMLElement;
        if (target.closest('#eng-ext-floating-btn') || target.closest('#eng-ext-trigger-btn')) {
          return;
        }

        if (showTriggerIconRef.current) {
          let dims = getSelectionDimensions(selection);
          if (!dims && isGoogleDocs && text) {
            dims = {
              left: e.clientX,
              top: e.clientY - 20,
              right: e.clientX + 30,
              bottom: e.clientY,
              width: 30,
              height: 20
            };
          }
          if (dims) {
            const x = dims.left + window.scrollX + (dims.width / 2) - 14;
            const y = dims.top + window.scrollY - 36;
            setTriggerPosition({ x, y });
            setPendingText(text);
            setPendingRect(dims);
          }
        }
      }, 10);
    };

    const publishChatSelection = () => {
      if (!isExtensionContextValid()) return;
      const text = isGoogleDocsEditor()
        ? docsSelection.text
        : (window.getSelection()?.toString() || '').trim();
      if (text.length > 12000) return;
      try {
        chrome.runtime.sendMessage({ action: 'SET_CHAT_SELECTION', text });
      } catch { /* extension was reloaded */ }
    };

    const handleSelectionChange = () => {
      if (isGoogleDocsEditor()) return;
      if (selectionPublishTimer !== null) window.clearTimeout(selectionPublishTimer);
      selectionPublishTimer = window.setTimeout(publishChatSelection, 50);
    };

    const scheduleDocsPublish = () => {
      if (docsPublishTimer !== null) window.clearTimeout(docsPublishTimer);
      docsPublishTimer = window.setTimeout(publishChatSelection, 180);
    };

    const handleSelectionKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift' || (e.shiftKey && e.key.startsWith('Arrow'))) {
        if (isGoogleDocsEditor()) scheduleDocsPublish();
        else window.setTimeout(publishChatSelection, 30);
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isExtensionContextValid()) {
        document.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }
      const target = e.target as HTMLElement;
      if (isGoogleDocsEditor() && isDocsEditingTarget(target)) {
        docsSelection.reset();
        scheduleDocsPublish();
      }
      if (!target.closest('#eng-ext-floating-btn') && !target.closest('#eng-ext-trigger-btn')) {
        setTriggerPosition(null);
        setPosition(null);
        setSelectedText('');
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keyup', handleSelectionKeyUp);
    document.addEventListener('copy', handleDocsCopy);
    document.addEventListener('paste', handleDocsPaste, true);
    document.addEventListener('pointerup', handleDocsPointer);

    // Docs sends keyboard and Copy events from its same-origin editing iframe.
    const attachedDocsFrames = new Set<Document>();
    let docsFrameObserver: MutationObserver | null = null;
    let docsSelectionObserver: MutationObserver | null = null;
    let docsAnnouncementFinder: MutationObserver | null = null;
    const handleDocsFrameMouseDown = () => {
      docsSelection.reset();
      scheduleDocsPublish();
    };
    const attachDocsAnnouncements = () => {
      const announcements = document.querySelector('#docs-aria-speakable');
      if (!announcements || docsSelectionObserver) return;
      docsSelectionObserver = new MutationObserver(records => {
        const candidates = new Set<Node>();
        records.forEach(record => {
          if (record.target !== announcements) candidates.add(record.target.nodeType === Node.TEXT_NODE
            ? record.target.parentNode || record.target : record.target);
          record.addedNodes.forEach(node => candidates.add(node.nodeType === Node.TEXT_NODE
            ? node.parentNode || node : node));
        });
        let changed = false;
        candidates.forEach(node => { if (docsSelection.accept(node)) changed = true; });
        if (changed) scheduleDocsPublish();
      });
      docsSelectionObserver.observe(announcements, { childList: true, characterData: true, subtree: true });
      docsAnnouncementFinder?.disconnect();
    };
    const attachDocsFrame = () => {
      if (!isGoogleDocsEditor()) return;
      document.querySelectorAll<HTMLIFrameElement>('.docs-texteventtarget-iframe').forEach(frame => {
        try {
          const frameDoc = frame.contentDocument;
          if (frameDoc && !attachedDocsFrames.has(frameDoc)) {
            frameDoc.addEventListener('copy', handleDocsCopy);
            frameDoc.addEventListener('paste', handleDocsPaste, true);
            frameDoc.addEventListener('keydown', handleKeyDown);
            frameDoc.addEventListener('keyup', handleSelectionKeyUp);
            frameDoc.addEventListener('mousedown', handleDocsFrameMouseDown);
            attachedDocsFrames.add(frameDoc);
            docsFrameObserver?.disconnect();
          }
        } catch {
          // A cross-origin frame cannot expose its selection events.
        }
      });
    };
    if (isGoogleDocsEditor()) {
      docsFrameObserver = new MutationObserver(attachDocsFrame);
      docsFrameObserver.observe(document.body, { childList: true, subtree: true });
      attachDocsFrame();
      docsAnnouncementFinder = new MutationObserver(attachDocsAnnouncements);
      docsAnnouncementFinder.observe(document.body, { childList: true, subtree: true });
      attachDocsAnnouncements();
    }

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.removeEventListener('keyup', handleSelectionKeyUp);
      document.removeEventListener('copy', handleDocsCopy);
      document.removeEventListener('paste', handleDocsPaste, true);
      document.removeEventListener('pointerup', handleDocsPointer);
      docsFrameObserver?.disconnect();
      docsSelectionObserver?.disconnect();
      docsAnnouncementFinder?.disconnect();
      if (docsPublishTimer !== null) window.clearTimeout(docsPublishTimer);
      if (selectionPublishTimer !== null) window.clearTimeout(selectionPublishTimer);
      attachedDocsFrames.forEach(frameDoc => {
        frameDoc.removeEventListener('copy', handleDocsCopy);
        frameDoc.removeEventListener('paste', handleDocsPaste, true);
        frameDoc.removeEventListener('keydown', handleKeyDown);
        frameDoc.removeEventListener('keyup', handleSelectionKeyUp);
        frameDoc.removeEventListener('mousedown', handleDocsFrameMouseDown);
      });
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

  const handleAiClick = async () => {
    if (!isExtensionContextValid()) {
      setAiResult(currentLang === 'vi' ? 'Lỗi: Tiện ích đã cập nhật hoặc khởi động lại. Vui lòng tải lại trang web (F5) để tiếp tục dùng AI.' : 'Error: Extension was reloaded. Please refresh the page (F5) to use AI features.');
      return;
    }
    if (aiLoading) return;
    setAiLoading(true);
    setAiResult('');
    try {
      if (isPhrase) {
        const res = await translateSentenceWithAI(selectedText, currentContext);
        setAiResult(res);
      } else {
        const res = await explainWord(selectedText, phonetic, currentContext);
        setAiResult(res);
      }
    } catch (err) {
      console.error(err);
      setAiResult(currentLang === 'vi' ? 'Lỗi khi gọi AI.' : 'AI Error.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = () => {
    if (!selectedText || isSaved) return;

    if (!isExtensionContextValid()) {
      console.warn("Extension context is invalidated. Cannot save word.");
      return;
    }

    const selection = window.getSelection();
    let context = '';
    if (selection && selection.anchorNode) {
      const fullText = selection.anchorNode.textContent || '';
      const sentences = fullText.split(/(?<=[.!?])\s+|\n+/);
      const matchedSentence = sentences.find(s => s.toLowerCase().includes(selectedText.toLowerCase()));
      context = matchedSentence ? matchedSentence.trim() : fullText.trim();
    }

    const finalContext = currentContext || context || '';
    try {
      chrome.runtime.sendMessage({
        action: 'SAVE_WORD',
        payload: {
          word: selectedText,
          phonetic: phonetic,
          meaning: meaning || selectedText,
          example: finalContext,
          contextSentence: finalContext,
          sourceUrl: window.location.href,
          sourceTitle: document.title
        }
      }, (response) => {
        if (hasRuntimeError()) return;
        if (response && response.success) {
          setIsSaved(true);
          setTimeout(() => {
            setPosition(null);
            setSelectedText('');
          }, 1200);
        }
      });
    } catch (e) {
      console.error('Failed to send SAVE_WORD message:', e);
    }
  };

  if (!position && !triggerPosition) return null;

  // Webpage popup always uses dark background with white text style for high contrast and readability
  const isDark = true;

  return (
    <>
      <style>{`
        @keyframes engExtFadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes engExtPopIn {
          from { opacity: 0; transform: scale(0.8); }
          to { opacity: 1; transform: scale(1); }
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

      {/* Small Trigger Icon */}
      {triggerPosition && (
        <div
          id="eng-ext-trigger-btn"
          onClick={handleTriggerClick}
          style={{
            position: 'absolute',
            left: triggerPosition.x,
            top: triggerPosition.y,
            zIndex: 999999,
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4), 0 1px 3px rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            animation: 'engExtPopIn 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)',
            transition: 'transform 0.1s ease',
            userSelect: 'none'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          title={currentLang === 'vi' ? 'Dịch với English Extension' : 'Translate with English Extension'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
        </div>
      )}

      {position && selectedText && (
        <div
        id="eng-ext-floating-btn"
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          transform: showBelow ? 'none' : 'translateY(-100%)',
          zIndex: 999999,
          background: isDark ? '#1e2230' : '#ffffff',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #cbd5e1',
          color: isDark ? '#ffffff' : '#1e293b',
          padding: '10px 14px',
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
          maxWidth: 'min(calc(100vw - 24px), 650px)',
          maxHeight: `${Math.max(120, showBelow ? window.innerHeight - (position.y - window.scrollY) - 12 : position.y - window.scrollY - 12)}px`,
          overflowY: 'auto',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: hasAiProvider ? '#c084fc' : '#64748b', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px' }}>
                        {hasAiProvider 
                          ? (currentLang === 'vi' ? 'DỊCH NGHĨA (AI ✨)' : 'MEANING (AI ✨)') 
                          : (currentLang === 'vi' ? 'DỊCH NGHĨA (FREE)' : 'MEANING (FREE)')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* AI Translate Button */}
                      {!aiResult && !aiLoading && (
                        <div className="eng-ext-tooltip-container">
                          <button
                            onClick={hasAiProvider ? handleAiClick : undefined}
                            disabled={!hasAiProvider}
                            style={{
                              cursor: hasAiProvider ? 'pointer' : 'not-allowed',
                              background: 'transparent',
                              border: 'none',
                              padding: '4px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '4px',
                              color: hasAiProvider ? '#c084fc' : '#64748b',
                              transition: 'all 0.2s',
                              opacity: hasAiProvider ? 1 : 0.5
                            }}
                            onMouseEnter={(e) => {
                              if (hasAiProvider) e.currentTarget.style.color = '#8b5cf6';
                            }}
                            onMouseLeave={(e) => {
                              if (hasAiProvider) e.currentTarget.style.color = '#c084fc';
                            }}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
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
                            {hasAiProvider 
                              ? (currentLang === 'vi' ? 'Dịch bằng AI ✨' : 'Translate with AI ✨')
                              : (currentLang === 'vi' ? 'Cấu hình API Key để dùng AI' : 'Configure API Key to use AI')}
                          </div>
                        </div>
                      )}

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
                  </div>
                  <span style={{ display: 'block', color: '#ffffff', fontSize: '14px', fontWeight: 400, lineHeight: '1.5', textAlign: 'justify', textAlignLast: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {meaning}
                  </span>



                  {aiLoading && (
                    <span style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic', marginTop: '4px' }}>
                      {currentLang === 'vi' ? 'AI đang dịch...' : 'AI translating...'}
                    </span>
                  )}

                  {aiResult && (
                    <div style={{ 
                      marginTop: '6px', 
                      background: 'rgba(255, 255, 255, 0.03)', 
                      padding: '8px', 
                      borderRadius: '6px', 
                      borderLeft: '2px solid #8b5cf6',
                      fontSize: '13px',
                      lineHeight: '1.45',
                      color: '#ffffff'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1, whiteSpace: 'pre-wrap', textAlign: 'justify', textAlignLast: 'left', overflowWrap: 'anywhere' }}>{aiResult}</div>
                        <button
                          onClick={handleCopyAi}
                          title={currentLang === 'vi' ? 'Sao chép kết quả' : 'Copy result'}
                          style={{
                            background: copiedAi ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid ' + (copiedAi ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.15)'),
                            borderRadius: '4px',
                            cursor: 'pointer',
                            padding: '3px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: copiedAi ? '#10b981' : '#cbd5e1',
                            fontSize: '11px',
                            flexShrink: 0
                          }}
                        >
                          {copiedAi ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                          <span>{copiedAi ? (currentLang === 'vi' ? 'Đã chép' : 'Copied') : (currentLang === 'vi' ? 'Chép' : 'Copy')}</span>
                        </button>
                      </div>
                    </div>
                  )}
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
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {/* AI Explain Button */}
                {!aiResult && !aiLoading && (
                  <div className="eng-ext-tooltip-container">
                    <button
                      onClick={hasAiProvider ? handleAiClick : undefined}
                      disabled={!hasAiProvider}
                      style={{
                        cursor: hasAiProvider ? 'pointer' : 'not-allowed',
                        background: 'transparent',
                        border: 'none',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        color: hasAiProvider ? '#c084fc' : '#64748b',
                        transition: 'all 0.2s',
                        opacity: hasAiProvider ? 1 : 0.5
                      }}
                      onMouseEnter={(e) => {
                        if (hasAiProvider) e.currentTarget.style.color = '#8b5cf6';
                      }}
                      onMouseLeave={(e) => {
                        if (hasAiProvider) e.currentTarget.style.color = '#c084fc';
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
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
                      {hasAiProvider 
                        ? (currentLang === 'vi' ? 'Giải nghĩa bằng AI ✨' : 'Explain with AI ✨')
                        : (currentLang === 'vi' ? 'Cấu hình API Key để dùng AI' : 'Configure API Key to use AI')}
                    </div>
                  </div>
                )}

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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ color: hasAiProvider ? '#c084fc' : '#64748b', fontSize: '10px', fontWeight: 800, letterSpacing: '0.5px' }}>{hasAiProvider ? (currentLang === 'vi' ? 'DỊCH NGHĨA (AI ✨)' : 'MEANING (AI ✨)') : (currentLang === 'vi' ? 'DỊCH NGHĨA (FREE)' : 'MEANING (FREE)')}</span>
                      </div>
                      <span style={{ display: 'block', color: '#ffffff', fontSize: '13px', fontWeight: 400, lineHeight: '1.4', textAlign: 'justify', textAlignLast: 'left', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                        {meaning}
                      </span>
                    </div>
                  )}

                  {!meaning && (
                    <span style={{ color: '#94a3b8', fontSize: '12px', fontStyle: 'italic' }}>
                      {currentLang === 'vi' ? 'Không tìm thấy định nghĩa trực tuyến.' : 'No online definition found.'}
                    </span>
                  )}



                  {aiLoading && (
                    <span style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic', marginTop: '4px' }}>
                      {currentLang === 'vi' ? 'AI đang phân tích...' : 'AI analyzing...'}
                    </span>
                  )}

                  {aiResult && (
                    <div style={{ 
                      marginTop: '6px', 
                      background: 'rgba(255, 255, 255, 0.03)', 
                      padding: '8px', 
                      borderRadius: '6px', 
                      borderLeft: '2px solid #8b5cf6',
                      fontSize: '12px',
                      lineHeight: '1.4',
                      color: '#cbd5e1',
                      position: 'relative'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                        <button
                          onClick={handleCopyAi}
                          title={currentLang === 'vi' ? 'Sao chép kết quả' : 'Copy result'}
                          style={{
                            background: copiedAi ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid ' + (copiedAi ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.15)'),
                            borderRadius: '4px',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: copiedAi ? '#10b981' : '#cbd5e1',
                            fontSize: '10.5px'
                          }}
                        >
                          {copiedAi ? <Check size={10} color="#10b981" /> : <Copy size={10} />}
                          <span>{copiedAi ? (currentLang === 'vi' ? 'Đã chép' : 'Copied') : (currentLang === 'vi' ? 'Chép' : 'Copy')}</span>
                        </button>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                        {aiResult}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
        </div>
      )}
    </>
  );
};

// Inject root safely into document
function initRoot() {
  if (!document.body) return;
  if (document.getElementById('eng-ext-root')) return;

  const rootElement = document.createElement('div');
  rootElement.id = 'eng-ext-root';
  document.body.appendChild(rootElement);

  const root = createRoot(rootElement);
  root.render(
    <>
      <ContentApp />
      <PassiveHighlightManager />
      <WritingAssistantOverlay />
      <FloatingPomodoroOverlay />
    </>
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRoot, { once: true });
} else {
  initRoot();
}
