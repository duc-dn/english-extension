import React, { useEffect, useState, useRef } from 'react';
import { db, addWord, deleteWord, updateWord, addGrammarNote } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Search, BookOpen, Layers, BarChart2, Settings, 
  Volume2, Check, Trash2, Globe, Moon, Sun, 
  Sparkles, XCircle, ChevronRight, Plus, MessageSquare, ExternalLink,
  CheckSquare, Square, CheckCircle2, Calendar, Image as LucideImage,
  ChevronUp, ChevronDown, Copy, FileInput
} from 'lucide-react';
import { marked } from 'marked';
import { fetchBasicMeaning, translateSentence, translateSentenceWithAI, summarizeSentence, explainWord, sendChatMessage, extractGrammarNote, type ChatHistoryItem } from '../lib/translator';
import { Input, Button, Dropdown, Tag, Progress, message, ConfigProvider, Modal, theme as antdTheme, Select, Switch } from 'antd';
import { saveSettings, useSettings, isAIConfigured, getAIProviderLabel } from '../lib/settings';
import { translate } from '../lib/localization';
import { PomodoroTimerWidget } from './PomodoroTimerWidget';
import { GeometricBackground } from './GeometricBackground';
import { 
  addTodo, 
  deleteTodo, 
  toggleTodoStatus, 
  isDateToday, 
  isDateOverdue, 
  formatRelativeDueDate, 
  getTodayDateString 
} from '../lib/todo';
import { playTaskCompleteChime } from '../lib/audio';
import { markdownToClipboardHtml } from '../lib/richClipboard';

marked.setOptions({
  gfm: true,
  breaks: true,
});

const renderMarkdown = (text: string, lang: 'vi' | 'en'): string => {
  try {
    const doc = new DOMParser().parseFromString(marked.parse(text, { async: false }) as string, 'text/html');
    doc.body.querySelectorAll('pre:has(> code)').forEach(pre => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'code-copy-button';
      button.setAttribute('aria-label', lang === 'vi' ? 'Sao chép mã' : 'Copy code');
      button.title = lang === 'vi' ? 'Sao chép mã' : 'Copy code';
      button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
      pre.appendChild(button);
    });
    return doc.body.innerHTML;
  } catch (e) {
    return text;
  }
};

const contextPreview = (text: string): string => {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
};

const optimizeImageForAI = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return resolve('');
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

export const CompactView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lookup' | 'vocab' | 'flashcards' | 'stats' | 'settings' | 'aichat' | 'todos'>('aichat');
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);
  const [isPopup, setIsPopup] = useState(false);
  
  // Todo states in CompactView
  const allTodos = useLiveQuery(() => db.todos.reverse().sortBy('createdAt')) || [];
  const pendingTodos = allTodos.filter(t => t.status === 'pending');
  const pendingTodosCount = pendingTodos.length;
  const overdueTodosCount = pendingTodos.filter(t => isDateOverdue(t.dueDate)).length;
  const [todoQuickText, setTodoQuickText] = useState('');
  const [todoPriority, setTodoPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [todoFilter, setTodoFilter] = useState<'all' | 'pending' | 'completed' | 'today'>('pending');
  
  // Lookup states
  const [manualQuery, setManualQuery] = useState('');
  const [manualResult, setManualResult] = useState<any | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const [isManualSaved, setIsManualSaved] = useState(false);
  const [wordExplanation, setWordExplanation] = useState('');
  const [wordExplanationLoading, setWordExplanationLoading] = useState(false);
  
  // Selected paragraph states (from side panel bôi đen)
  const [selectedParagraph, setSelectedParagraph] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [aiMode, setAiMode] = useState<'translation' | 'summary' | null>(null);

  // Q&A states
  const [qaQuery, setQaQuery] = useState('');
  const [qaResult, setQaResult] = useState('');

  // AI Chat states
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const latestQuestionIndex = React.useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].sender === 'user') return i;
    }
    return -1;
  }, [chatHistory]);
  const [chatInput, setChatInput] = useState('');
  const [chatSelection, setChatSelection] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatImage, setChatImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  const [savingGrammarIdx, setSavingGrammarIdx] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | number | null>(null);
  const [insertingIntoDocsId, setInsertingIntoDocsId] = useState<number | null>(null);
  const [docsInsertError, setDocsInsertError] = useState<{ id: number; text: string } | null>(null);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollTopRef = useRef(0);

  useEffect(() => {
    if (!chrome.storage?.session) return;
    chrome.storage.session.get('chatSelection', (items) => {
      const selection = items.chatSelection as { text?: string } | undefined;
      if (!chrome.runtime.lastError) setChatSelection(selection?.text || '');
    });
    const onSelectionChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.chatSelection) {
        const selection = changes.chatSelection.newValue as { text?: string } | undefined;
        setChatSelection(selection?.text || '');
      }
    };
    chrome.storage.onChanged.addListener(onSelectionChanged);
    return () => chrome.storage.onChanged.removeListener(onSelectionChanged);
  }, []);

  const clearChatSelection = () => {
    setChatSelection('');
    chrome.storage?.session?.remove('chatSelection');
  };

  // Vocabulary search & filter states
  const [vocabSearch, setVocabSearch] = useState('');
  const [vocabFilter, setVocabFilter] = useState<'all' | 'new' | 'learning' | 'known' | 'review'>('all');
  const [vocabSelectedTag, setVocabSelectedTag] = useState<string | undefined>(undefined);

  // Load settings via hook
  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  const themeMode = settings.theme || 'light';
  const isSystemDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = themeMode === 'dark' || (themeMode === 'system' && isSystemDark);
  const isAiConfigured = isAIConfigured(settings);

  const colors = {
    bgBase: isDark ? '#0b0f19' : '#f8fafc',
    bgContainer: isDark ? '#111827' : '#ffffff',
    bgLight: isDark ? '#1f2937' : '#f0f9ff',
    textMain: isDark ? '#f8fafc' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? '#2d3748' : '#e0f2fe',
    borderLight: isDark ? '#1f2937' : '#f0f9ff',
    primary: '#0284c7',
  };

  // Load IndexedDB words
  const words = useLiveQuery(async () => {
    const list = await db.words.toArray();
    return list.sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });
  }) || [];

  // Detect popup mode and sync HTML body classes for dark mode
  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }

    if (typeof chrome !== 'undefined' && chrome.extension) {
      try {
        const views = chrome.extension.getViews({ type: 'popup' });
        setIsPopup(views.includes(window));
      } catch (e) {
        setIsPopup(false);
      }
    } else {
      const params = new URLSearchParams(window.location.search);
      setIsPopup(params.get('mode') === 'popup' || window.innerWidth < 600);
    }
  }, [activeTab, isDark]);

  // Listen for paragraph and shift selections in chrome storage (for Side Panel auto-update)
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      // Get initial values
      chrome.storage.local.get(['selectedParagraph', 'shiftSelectedText', 'selectedSentenceContext'], (res: any) => {
        if (res) {
          const contextForWord = (res.selectedSentenceContext as string) || (res.selectedParagraph as string) || undefined;
          if (res.selectedParagraph && typeof res.selectedParagraph === 'string') {
            if (activeTabRef.current === 'lookup') {
              setSelectedParagraph(res.selectedParagraph);
              setAiResult('');
              setAiMode(null);
              setQaQuery('');
              setQaResult('');
            }
          } else if (res.shiftSelectedText && typeof res.shiftSelectedText === 'string') {
            const text = res.shiftSelectedText;
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            if (wordCount <= 5) {
              setManualQuery(text);
              if (activeTabRef.current === 'lookup') {
                setManualLoading(true);
                const isPhrase = wordCount > 1;
                if (isPhrase) {
                  translateSentence(text, contextForWord)
                    .then(translation => {
                      setManualResult({
                        word: text,
                        vietnameseMeaning: translation,
                        phonetic: '',
                        meanings: []
                      });
                    })
                    .catch(err => console.error(err))
                    .finally(() => setManualLoading(false));
                } else {
                  fetchBasicMeaning(text, contextForWord)
                    .then(r => setManualResult(r))
                    .catch(err => console.error(err))
                    .finally(() => setManualLoading(false));
                }
              }
            } else {
              if (activeTabRef.current === 'lookup') {
                setSelectedParagraph(text);
                setAiResult('');
                setAiMode(null);
                setQaQuery('');
                setQaResult('');
              }
            }
          }
        }
      });

      // Listen for updates
      const listener = (changes: any, area: string) => {
        if (area === 'local') {
          if (changes.selectedParagraph) {
            const newParagraph = changes.selectedParagraph.newValue || '';
            setSelectedParagraph(newParagraph);
            if (newParagraph) {
              setActiveTab('lookup');
              setAiResult('');
              setAiMode(null);
              setQaQuery('');
              setQaResult('');
            }
          }
          
          if (changes.shiftSelectedText) {
            const text = changes.shiftSelectedText.newValue || '';
            if (text) {
              // Only perform active lookup updates when user is explicitly on 'lookup' tab
              if (activeTabRef.current !== 'lookup') {
                return;
              }

              // 3. User is already on 'lookup' tab: perform active lookup tab updates
              const wordCount = text.split(/\s+/).filter(Boolean).length;
              if (wordCount <= 5) {
                // Word or short phrase lookup
                setSelectedParagraph('');
                setManualQuery(text);
                setIsManualSaved(false);
                setWordExplanation('');
                setManualLoading(true);
                
                const isPhrase = wordCount > 1;
                if (isPhrase) {
                  translateSentence(text)
                    .then((translation) => {
                      setManualResult({
                        word: text,
                        vietnameseMeaning: translation,
                        phonetic: '',
                        meanings: []
                      });
                    })
                    .catch((err) => {
                      console.error("Error looking up shift phrase:", err);
                    })
                    .finally(() => {
                      setManualLoading(false);
                    });
                } else {
                  fetchBasicMeaning(text)
                    .then((res) => {
                      setManualResult(res);
                    })
                    .catch((err) => {
                      console.error("Error looking up shift word:", err);
                    })
                    .finally(() => {
                      setManualLoading(false);
                    });
                }
              } else {
                // Paragraph translation mode
                setSelectedParagraph(text);
                setAiResult('');
                setAiMode(null);
                setQaQuery('');
                setQaResult('');
              }
            }
          }
        }
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    }
  }, []);

  const toggleTheme = async () => {
    const nextTheme = isDark ? 'light' : 'dark';
    await saveSettings({ theme: nextTheme });
  };

  const confirmDeleteWord = (id: string) => {
    Modal.confirm({
      title: currentLang === 'vi' ? 'Xác nhận xóa' : 'Confirm Delete',
      content: currentLang === 'vi' ? 'Bạn có chắc chắn muốn xóa từ vựng này khỏi sổ từ không?' : 'Are you sure you want to delete this word from your vocabulary list?',
      okText: currentLang === 'vi' ? 'Xóa' : 'Delete',
      okType: 'danger',
      cancelText: currentLang === 'vi' ? 'Hủy' : 'Cancel',
      okButtonProps: { style: { borderRadius: 8 } },
      cancelButtonProps: { style: { borderRadius: 8 } },
      onOk: async () => {
        try {
          await deleteWord(id);
          message.success(translate('deleteSuccess', currentLang));
        } catch (error) {
          message.error(translate('deleteFailed', currentLang));
        }
      }
    });
  };

  const handleManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setManualLoading(true);
    setIsManualSaved(false);
    setWordExplanation('');
    const query = manualQuery.trim();
    const wordCount = query.split(/\s+/).filter(Boolean).length;
    const isPhrase = wordCount > 1;

    try {
      if (isPhrase) {
        const translation = await translateSentence(query);
        setManualResult({
          word: query,
          vietnameseMeaning: translation,
          phonetic: '',
          meanings: []
        });
      } else {
        const res = await fetchBasicMeaning(query);
        setManualResult(res);
      }
    } catch (err) {
      console.error(err);
      message.error(translate('popoverNoDefinition', currentLang));
    } finally {
      setManualLoading(false);
    }
  };

  const speakWord = (wordText: string, lang: 'en-US' | 'en-GB' = 'en-US') => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(wordText);
    utterance.lang = lang;
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  const saveManualWord = async () => {
    if (!manualResult) return;
    try {
      await addWord({
        word: manualResult.word,
        phonetic: manualResult.phonetic || '',
        meaning: manualResult.vietnameseMeaning || manualResult.word,
        example: manualResult.meanings?.[0]?.definitions?.[0]?.example || '',
        tags: ['lookup-popup']
      });
      setIsManualSaved(true);
      message.success(translate('addSuccess', currentLang));
    } catch (err) {
      message.error(translate('addFailed', currentLang));
    }
  };

  // AI Support Word Explainer
  const handleWordAiSupport = async () => {
    if (!manualResult?.word) return;
    if (!isAiConfigured) {
      message.warning(translate('aiRedirecting', currentLang));
      setTimeout(() => openFullPageTab('settings'), 800);
      return;
    }
    
    setWordExplanationLoading(true);
    try {
      const contextForExplanation = manualResult.meanings?.[0]?.definitions?.[0]?.example || selectedParagraph || undefined;
      const explanation = await explainWord(manualResult.word, manualResult.meanings?.[0]?.definitions?.[0]?.definition, contextForExplanation);
      setWordExplanation(explanation);
    } catch (err) {
      setWordExplanation(currentLang === 'vi' ? 'Lỗi khi tải giải nghĩa từ AI.' : 'Error loading AI explanation.');
    } finally {
      setWordExplanationLoading(false);
    }
  };

  // AI Translate Paragraph (Free)
  const handleTranslateParagraphFree = async () => {
    if (!selectedParagraph) return;
    setAiLoading(true);
    setAiMode('translation');
    try {
      const res = await translateSentence(selectedParagraph);
      setAiResult(res);
    } catch (err) {
      setAiResult(currentLang === 'vi' ? 'Lỗi khi dịch đoạn văn.' : 'Error translating text.');
    } finally {
      setAiLoading(false);
    }
  };

  // AI Translate Paragraph (AI)
  const handleTranslateParagraphAi = async () => {
    if (!selectedParagraph) return;
    setAiLoading(true);
    setAiMode('translation');
    try {
      const res = await translateSentenceWithAI(selectedParagraph);
      setAiResult(res);
    } catch (err) {
      setAiResult(currentLang === 'vi' ? 'Lỗi khi dịch đoạn văn.' : 'Error translating text.');
    } finally {
      setAiLoading(false);
    }
  };

  // AI Summarize Paragraph
  const handleSummarizeParagraph = async () => {
    if (!selectedParagraph) return;
    if (!isAiConfigured) {
      message.warning(translate('aiRedirecting', currentLang));
      setTimeout(() => openFullPageTab('settings'), 800);
      return;
    }
    setAiLoading(true);
    setAiMode('summary');
    try {
      const res = await summarizeSentence(selectedParagraph);
      setAiResult(res);
    } catch (err) {
      setAiResult(currentLang === 'vi' ? 'Lỗi khi tóm tắt đoạn văn.' : 'Error summarizing text.');
    } finally {
      setAiLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedParagraph('');
    setAiResult('');
    setAiMode(null);
    setQaQuery('');
    setQaResult('');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ selectedParagraph: '' });
    }
  };

  const handleQaSubmit = async () => {
    if (!selectedParagraph || !qaQuery.trim()) return;
    if (!isAiConfigured) {
      message.warning(translate('aiRedirecting', currentLang));
      setTimeout(() => openFullPageTab('settings'), 800);
      return;
    }
    
    const question = qaQuery.trim();
    setQaQuery('');
    
    // Switch to AI Chat tab
    setActiveTab('aichat');
    setChatLoading(true);

    const newHistory: ChatHistoryItem[] = [...chatHistory, { sender: 'user', text: question }];
    setChatHistory(newHistory);

    try {
      const response = await sendChatMessage(selectedParagraph, newHistory);
      setChatHistory([...newHistory, { sender: 'ai', text: response }]);
    } catch (err) {
      message.error(currentLang === 'vi' ? 'Không thể gửi tin nhắn' : 'Failed to send message');
    } finally {
      setChatLoading(false);
    }
  };

  const openFullPageTab = (route = '') => {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`index.html#/${route}`) });
      try {
        window.close();
      } catch (e) {
        console.error("Failed to close side panel window:", e);
      }
    } else {
      window.open(`/#/${route}`, '_blank');
    }
  };

  // Keep the newest question at the top when its answer arrives so the answer
  // can be read from its beginning, including long responses.
  useEffect(() => {
    const scroller = chatScrollRef.current;
    const question = latestQuestionRef.current;
    if (!scroller || !question) return;
    const top = question.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    scroller.scrollTop = Math.max(0, top - 8);
  }, [chatHistory]);

  // Reset header hidden state if active tab is not aichat
  useEffect(() => {
    if (activeTab !== 'aichat') {
      setIsHeaderHidden(false);
    }
  }, [activeTab]);

  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (activeTab !== 'aichat') return;
    const currentScrollTop = e.currentTarget.scrollTop;
    const scrollDiff = currentScrollTop - lastScrollTopRef.current;

    // Scrolling down by more than 10px -> hide header
    if (scrollDiff > 10 && currentScrollTop > 45) {
      setIsHeaderHidden(true);
    }

    lastScrollTopRef.current = currentScrollTop;
  };

  const handleChatPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const optimized = await optimizeImageForAI(file);
        if (optimized) {
          setChatImage(optimized);
          message.success(currentLang === 'vi' ? 'Đã đính kèm ảnh từ clipboard! 📸' : 'Image attached from clipboard! 📸');
        }
        break;
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const optimized = await optimizeImageForAI(file);
    if (optimized) {
      setChatImage(optimized);
      message.success(currentLang === 'vi' ? 'Đã đính kèm ảnh! 📸' : 'Image attached! 📸');
    }
    e.target.value = '';
  };

  const handleSendChat = async () => {
    if ((!chatInput.trim() && !chatImage) || chatLoading) return;
    if (!isAiConfigured) {
      message.warning(currentLang === 'vi' 
        ? 'AI chưa được cấu hình. Đang chuyển hướng đến trang Cài đặt...' 
        : translate('aiRedirecting', currentLang));
      setTimeout(() => openFullPageTab('settings'), 600);
      return;
    }

    const userMsg = chatInput.trim();
    const userImg = chatImage;
    const attachedContext = chatSelection;
    setChatInput('');
    setChatImage(null);
    if (attachedContext) clearChatSelection();
    setChatLoading(true);

    const newHistory: ChatHistoryItem[] = [
      ...chatHistory, 
      { 
        sender: 'user', 
        text: userMsg || (currentLang === 'vi' ? 'Hãy phân tích và giải thích hình ảnh này giúp tôi.' : 'Please analyze and explain this image for me.'),
        image: userImg || undefined,
        context: attachedContext || undefined
      }
    ];
    setChatHistory(newHistory);

    try {
      const response = await sendChatMessage('', newHistory);
      setChatHistory([...newHistory, { sender: 'ai', text: response }]);
    } catch (err) {
      message.error(currentLang === 'vi' ? 'Không thể gửi tin nhắn' : 'Failed to send message');
    } finally {
      setChatLoading(false);
    }
  };

  const handleSaveGrammar = async (aiText: string, index: number) => {
    if (savingGrammarIdx !== null) return;
    setSavingGrammarIdx(index);
    try {
      const extracted = await extractGrammarNote(aiText);
      if (extracted) {
        await addGrammarNote({
          title: extracted.title,
          content: extracted.content,
          example: extracted.example || '',
          tags: extracted.tags || []
        });
        message.success(translate('saveGrammarSuccess', currentLang));
      } else {
        message.error(translate('saveGrammarFailed', currentLang));
      }
    } catch (err) {
      console.error(err);
      message.error(translate('saveGrammarFailed', currentLang));
    } finally {
      setSavingGrammarIdx(null);
    }
  };

  const handleCopyText = (text: string, id?: string | number) => {
    if (!text) return;
    const onSuccess = () => {
      message.success(translate('copiedText', currentLang));
      if (id !== undefined) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        fallbackCopy(text, onSuccess);
      });
    } else {
      fallbackCopy(text, onSuccess);
    }
  };

  const handleCopyForGoogleDocs = async (markdown: string, id: number) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      message.error(currentLang === 'vi' ? 'Trình duyệt không hỗ trợ sao chép định dạng.' : 'Rich text copying is unavailable in this browser.');
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([markdownToClipboardHtml(markdown)], { type: 'text/html' }),
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
      })]);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      message.success(currentLang === 'vi' ? 'Đã sao chép định dạng. Dán vào Google Docs bằng Cmd/Ctrl+V.' : 'Formatted content copied. Paste into Google Docs with Cmd/Ctrl+V.');
    } catch {
      message.error(currentLang === 'vi' ? 'Không thể sao chép định dạng.' : 'Could not copy formatted content.');
    }
  };

  const handleInsertIntoGoogleDocs = async (markdown: string, id: number) => {
    if (insertingIntoDocsId !== null) return;
    setInsertingIntoDocsId(id);
    setDocsInsertError(null);
    const errorText = currentLang === 'vi' ? 'Không thể chèn vào Google Docs tại con trỏ. Hãy nhấp vào vị trí cần chèn trong tài liệu rồi thử lại.' : 'Could not insert at the Google Docs cursor. Click the insertion point in the document and try again.';
    let previousClipboard: ClipboardItem[] | null = null;
    let clipboardChanged = false;
    let step = currentLang === 'vi' ? 'kiểm tra Google Docs' : 'checking Google Docs';
    try {
      if (!navigator.clipboard?.read || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        const detail = currentLang === 'vi' ? 'Trình duyệt không hỗ trợ chèn có định dạng.' : 'Formatted insertion is unavailable in this browser.';
        setDocsInsertError({ id, text: detail });
        message.error(detail);
        return;
      }
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !/^https:\/\/docs\.google\.com\/document\//.test(tab.url || '')) {
        const detail = currentLang === 'vi' ? 'Hãy mở một tài liệu Google Docs để chèn nội dung.' : 'Open a Google Docs document to insert this content.';
        setDocsInsertError({ id, text: detail });
        message.warning(detail);
        return;
      }
      // Docs accepts rich content through its native paste path. Preserve the
      // user's clipboard, including images and HTML, around this explicit action.
      // Keep ClipboardItems intact; reconstructing every MIME type can throw a
      // DOMException for formats that Chrome can read but cannot write.
      step = currentLang === 'vi' ? 'đọc clipboard' : 'reading clipboard';
      previousClipboard = await navigator.clipboard.read();
      step = currentLang === 'vi' ? 'ghi nội dung vào clipboard' : 'writing to clipboard';
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([markdownToClipboardHtml(markdown)], { type: 'text/html' }),
        'text/plain': new Blob([markdown], { type: 'text/plain' }),
      })]);
      clipboardChanged = true;
      step = currentLang === 'vi' ? 'dán vào Google Docs' : 'pasting into Google Docs';
      const result = await chrome.runtime.sendMessage({
        action: 'PASTE_AI_INTO_GOOGLE_DOCS', tabId: tab.id,
        isMac: navigator.platform.toLowerCase().includes('mac'),
      }) as { success?: boolean; confirmed?: boolean; error?: string } | undefined;
      if (!result?.success) throw new Error(result?.error || 'Google Docs paste shortcut was rejected');
      // Docs can read clipboard contents after the paste event has been handled.
      await new Promise(resolve => setTimeout(resolve, 500));
      message.info(result.confirmed
        ? (currentLang === 'vi' ? 'Đã chèn nội dung có định dạng vào Google Docs.' : 'Inserted formatted content into Google Docs.')
        : (currentLang === 'vi' ? 'Đã gửi lệnh dán có định dạng đến Google Docs. Hãy kiểm tra tài liệu.' : 'Sent the formatted paste command to Google Docs. Check the document.'));
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const messageText = error instanceof Error ? error.message : String(error);
      const detail = [name, messageText].filter(Boolean).join(': ') || String(error);
      const fullError = `${errorText} (${step}: ${detail})`;
      setDocsInsertError({ id, text: fullError });
      message.error(fullError, 7);
    } finally {
      if (clipboardChanged && previousClipboard) {
        try {
          if (previousClipboard.length) await navigator.clipboard.write(previousClipboard);
          else await navigator.clipboard.writeText('');
        } catch (error) {
          const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
          message.warning(currentLang === 'vi' ? `Không thể khôi phục clipboard: ${detail}` : `Could not restore the clipboard: ${detail}`);
        }
      }
      setInsertingIntoDocsId(null);
    }
  };

  const fallbackCopy = (text: string, cb: () => void) => {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      cb();
    } catch (e) {
      message.error(currentLang === 'vi' ? 'Không thể sao chép' : 'Failed to copy');
    }
  };




  const allTags = React.useMemo(() => {
    const tags = new Set<string>();
    words.forEach(w => (w.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [words]);

  // Filter vocabulary list
  const filteredWords = words
    .filter(w => w.word.toLowerCase().includes(vocabSearch.toLowerCase()) || w.meaning.toLowerCase().includes(vocabSearch.toLowerCase()))
    .filter(w => {
      if (vocabFilter === 'known') return w.status === 'mastered' || w.review_level >= 4;
      if (vocabFilter === 'new') return w.status === 'new' || (!w.status && w.review_level === 0);
      if (vocabFilter === 'learning') return w.status === 'learning' || w.status === 'reviewing' || (w.review_level > 0 && w.review_level < 4 && w.status !== 'mastered');
      if (vocabFilter === 'review') return w.next_review && new Date(w.next_review) <= new Date() && w.status !== 'mastered';
      return true;
    })
    .filter(w => {
      if (!vocabSelectedTag) return true;
      return (w.tags || []).includes(vocabSelectedTag);
    })
    .sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

  // Calculate statistics
  const totalWords = words.length;
  const knownWords = words.filter(w => w.status === 'mastered' || w.review_level >= 4).length;
  const toReview = words.filter(w => w.next_review && new Date(w.next_review) <= new Date() && w.status !== 'mastered').length;

  const renderTodosTab = () => {
    const displayTodos = allTodos.filter(t => {
      if (todoFilter === 'pending') return t.status === 'pending';
      if (todoFilter === 'completed') return t.status === 'completed';
      if (todoFilter === 'today') return t.status === 'pending' && isDateToday(t.dueDate);
      return true;
    });

    const handleAddCompactTodo = async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (!todoQuickText.trim()) return;
      try {
        await addTodo({
          title: todoQuickText,
          priority: todoPriority,
          dueDate: getTodayDateString(),
          tags: ['General'],
        });
        setTodoQuickText('');
        message.success(translate('todoAddSuccess', currentLang));
      } catch {
        message.error('Lỗi khi thêm nhiệm vụ');
      }
    };

    const handleToggleCompactTodo = async (id: string) => {
      try {
        const updated = await toggleTodoStatus(id);
        if (updated?.status === 'completed') {
          playTaskCompleteChime();
          message.success(translate('todoCompletedSuccess', currentLang));
        }
      } catch {
        message.error('Lỗi khi cập nhật trạng thái');
      }
    };

    const handleDeleteCompactTodo = async (id: string) => {
      try {
        await deleteTodo(id);
        message.success(translate('todoDeleteSuccess', currentLang));
      } catch {
        message.error('Lỗi khi xóa');
      }
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.2s' }}>
        {/* Quick add bar */}
        <form onSubmit={handleAddCompactTodo} style={{ display: 'flex', gap: 6 }}>
          <Input
            value={todoQuickText}
            onChange={(e) => setTodoQuickText(e.target.value)}
            placeholder={translate('todoQuickAddPlaceholder', currentLang)}
            style={{ borderRadius: 8, height: 34, fontSize: 13 }}
            prefix={<CheckSquare size={14} color="#0284c7" />}
          />
          <Select
            value={todoPriority}
            onChange={setTodoPriority}
            size="small"
            style={{ width: 85, height: 34 }}
            options={[
              { value: 'high', label: `🔥 ${translate('todoPriorityHigh', currentLang).slice(0, 4)}` },
              { value: 'medium', label: `⚡ ${translate('todoPriorityMedium', currentLang).slice(0, 4)}` },
              { value: 'low', label: `🌱 ${translate('todoPriorityLow', currentLang).slice(0, 4)}` },
            ]}
          />
          <Button
            type="primary"
            htmlType="submit"
            icon={<Plus size={14} />}
            style={{ height: 34, borderRadius: 8, background: '#0284c7', padding: '0 10px' }}
          />
        </form>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'pending', label: translate('todoFilterPending', currentLang), count: pendingTodosCount },
              { id: 'today', label: translate('todoFilterToday', currentLang) },
              { id: 'all', label: translate('todoFilterAll', currentLang) },
              { id: 'completed', label: translate('todoFilterCompleted', currentLang) },
            ].map(f => {
              const isActive = todoFilter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setTodoFilter(f.id as any)}
                  style={{
                    background: isActive ? (isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.12)') : 'transparent',
                    color: isActive ? '#0284c7' : colors.textMuted,
                    border: 'none',
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer'
                  }}
                >
                  {f.label} {f.count !== undefined && f.count > 0 ? `(${f.count})` : ''}
                </button>
              );
            })}
          </div>

          <Button
            type="link"
            size="small"
            onClick={() => openFullPageTab('todos')}
            icon={<ExternalLink size={11} />}
            style={{ padding: 0, fontSize: 11, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            {translate('todoViewAll', currentLang)}
          </Button>
        </div>

        {/* Task items list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '380px', overflowY: 'auto' }}>
          {displayTodos.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center', color: colors.textMuted, fontSize: 12 }}>
              {translate('todoNoTasksTitle', currentLang)}
            </div>
          ) : (
            displayTodos.map(t => {
              const isDone = t.status === 'completed';
              const isOverdue = !isDone && isDateOverdue(t.dueDate);
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: isDone 
                      ? (isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)') 
                      : (isOverdue ? (isDark ? 'rgba(239, 68, 68, 0.1)' : '#fef2f2') : colors.bgContainer),
                    border: isOverdue 
                      ? '1px solid rgba(239, 68, 68, 0.3)' 
                      : ('1px solid ' + colors.border),
                    opacity: isDone ? 0.6 : 1
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleToggleCompactTodo(t.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: isDone ? '#10b981' : colors.textMuted }}
                    >
                      {isDone ? <CheckCircle2 size={16} color="#10b981" /> : <Square size={16} />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: isDone ? colors.textMuted : colors.textMain,
                        textDecoration: isDone ? 'line-through' : 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {t.title}
                      </div>
                      {t.dueDate && (
                        <div style={{ fontSize: 10.5, color: isOverdue ? '#ef4444' : colors.textMuted, marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Calendar size={10} /> {formatRelativeDueDate(t.dueDate, currentLang)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {t.priority === 'high' && (
                      <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 700 }}>🔥</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteCompactTodo(t.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: colors.textMuted }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'lookup':
        if (selectedParagraph) {
          // Paragraph Selection Mode (Side Panel style)
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0', animation: 'fadeIn 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px' }}>{translate('selectedText', currentLang)}</span>
                <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: colors.textMuted, fontSize: '11px', fontWeight: 600 }}>
                  <XCircle size={12} />
                  {translate('clear', currentLang)}
                </button>
              </div>

              <div style={{ background: colors.bgLight, border: '1px solid ' + colors.border, padding: 12, borderRadius: 12, fontSize: '13px', color: colors.textMain, lineHeight: '1.5', maxHeight: '120px', overflowY: 'auto', fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                "{selectedParagraph}"
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Row 1: Translations */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button 
                    type="primary" 
                    icon={<Globe size={14} />} 
                    onClick={handleTranslateParagraphFree}
                    loading={aiLoading && aiMode === 'translation' && !isAiConfigured}
                    style={{ flex: 1, borderRadius: 8, height: 38, background: isDark ? '#1a1e35' : '#eff6ff', border: '1px solid ' + (isDark ? '#2e3b6d' : '#bfdbfe'), color: isDark ? '#60a5fa' : '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    {translate('translateFree', currentLang)}
                  </Button>
                  <Button 
                    type="primary" 
                    icon={<Sparkles size={14} />} 
                    onClick={handleTranslateParagraphAi}
                    loading={aiLoading && aiMode === 'translation' && isAiConfigured}
                    disabled={!isAiConfigured}
                    style={{ 
                      flex: 1, 
                      borderRadius: 8, 
                      height: 38, 
                      background: !isAiConfigured 
                        ? (isDark ? '#1e2235' : '#f1f5f9') 
                        : (isDark ? 'rgba(139, 92, 246, 0.2)' : '#f5f3ff'), 
                      border: '1px solid ' + (!isAiConfigured 
                        ? (isDark ? '#25283b' : '#cbd5e1') 
                        : (isDark ? 'rgba(139, 92, 246, 0.4)' : '#ddd6fe')), 
                      color: !isAiConfigured 
                        ? (isDark ? '#475569' : '#94a3b8') 
                        : (isDark ? '#c084fc' : '#7c3aed'), 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 4 
                    }}
                  >
                    {translate('translateAi', currentLang)}
                  </Button>
                </div>
                
                {/* Row 2: Summary and Chat */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button 
                    type="primary" 
                    icon={<Sparkles size={14} />} 
                    onClick={handleSummarizeParagraph}
                    loading={aiLoading && aiMode === 'summary'}
                    disabled={!isAiConfigured}
                    style={{ 
                      flex: 1, 
                      borderRadius: 8, 
                      height: 38, 
                      background: !isAiConfigured 
                        ? (isDark ? '#1e2235' : '#f1f5f9') 
                        : (isDark ? '#162e2d' : '#ecfdf5'), 
                      border: '1px solid ' + (!isAiConfigured 
                        ? (isDark ? '#25283b' : '#cbd5e1') 
                        : (isDark ? '#1c524e' : '#a7f3d0')), 
                      color: !isAiConfigured 
                        ? (isDark ? '#475569' : '#94a3b8') 
                        : (isDark ? '#2dd4bf' : '#059669'), 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 4 
                    }}
                  >
                    {translate('summarizeText', currentLang)}
                  </Button>
                  <Button 
                    type="primary" 
                    icon={<MessageSquare size={14} />} 
                    onClick={() => setActiveTab('aichat')}
                    disabled={!isAiConfigured}
                    style={{ 
                      flex: 1, 
                      borderRadius: 8, 
                      height: 38, 
                      background: !isAiConfigured 
                        ? (isDark ? '#1e2235' : '#f1f5f9') 
                        : (isDark ? '#1d1a35' : '#f5f3ff'), 
                      border: '1px solid ' + (!isAiConfigured 
                        ? (isDark ? '#25283b' : '#cbd5e1') 
                        : (isDark ? '#4a2e6d' : '#ddd6fe')), 
                      color: !isAiConfigured 
                        ? (isDark ? '#475569' : '#94a3b8') 
                        : (isDark ? '#c084fc' : '#7c3aed'), 
                      fontWeight: 600, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: 4 
                    }}
                  >
                    {translate('btnChatAi', currentLang)}
                  </Button>
                </div>
              </div>

              {aiResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: colors.bgContainer, border: '1px solid ' + colors.border, padding: 14, borderRadius: 12, marginTop: 4, animation: 'fadeIn 0.3s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: aiMode === 'translation' ? '#c084fc' : '#2dd4bf', letterSpacing: '0.5px' }}>
                      {aiMode === 'translation' ? translate('translationResult', currentLang) : translate('summaryResult', currentLang)}
                    </span>
                    <Button
                      type="text"
                      size="small"
                      onClick={() => handleCopyText(aiResult, 'aiResult')}
                      icon={copiedId === 'aiResult' ? <Check size={11} color="#10b981" /> : <Copy size={11} color={colors.textMuted} />}
                      style={{ 
                        fontSize: '11px', 
                        height: 22, 
                        padding: '0 8px', 
                        borderRadius: 6,
                        background: copiedId === 'aiResult' ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5') : 'transparent',
                        color: copiedId === 'aiResult' ? '#10b981' : colors.textMuted, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: 4 
                      }}
                    >
                      {copiedId === 'aiResult' ? (currentLang === 'vi' ? 'Đã sao chép' : 'Copied') : translate('copyBtn', currentLang)}
                    </Button>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: colors.textMain, lineHeight: '1.5', whiteSpace: 'pre-wrap', fontWeight: 400 }}>
                    {aiResult}
                  </p>
                </div>
              )}

              {/* Q&A Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid ' + colors.border, paddingTop: 12, marginTop: 8 }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', letterSpacing: '0.5px' }}>
                  {currentLang === 'vi' ? 'HỎI ĐÁP NGỮ PHÁP & CẤU TRÚC' : 'GRAMMAR & STRUCTURE Q&A'}
                </span>
                
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input 
                    placeholder={translate('qaInputPlaceholder', currentLang)} 
                    value={qaQuery} 
                    onChange={e => setQaQuery(e.target.value)}
                    onPressEnter={handleQaSubmit}
                    disabled={chatLoading || !isAiConfigured}
                    style={{ borderRadius: 8, height: 36, background: colors.bgContainer, border: '1px solid ' + colors.border, color: colors.textMain, fontSize: '13px' }} 
                  />
                  <Button 
                    type="primary" 
                    onClick={handleQaSubmit} 
                    loading={chatLoading}
                    disabled={!qaQuery.trim() || !isAiConfigured}
                    style={{ 
                      height: 36, 
                      background: !isAiConfigured
                        ? (isDark ? '#1e2235' : '#f1f5f9')
                        : '#10b981', 
                      border: !isAiConfigured
                        ? '1px solid ' + (isDark ? '#25283b' : '#cbd5e1')
                        : 'none', 
                      borderRadius: 8, 
                      color: !isAiConfigured
                        ? (isDark ? '#475569' : '#94a3b8')
                        : '#ffffff', 
                      fontWeight: 600, 
                      fontSize: '13px' 
                    }}
                  >
                    {translate('qaBtn', currentLang)}
                  </Button>
                </div>

                {chatLoading && (
                  <span style={{ color: colors.textMuted, fontSize: '12px', fontStyle: 'italic', marginTop: 4, display: 'block' }}>
                    {translate('qaLoadingText', currentLang)}
                  </span>
                )}

                {qaResult && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: colors.bgLight, border: '1px solid ' + colors.border, padding: 12, borderRadius: 10, marginTop: 4, animation: 'fadeIn 0.3s' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#34d399', letterSpacing: '0.5px' }}>
                        {translate('qaResultTitle', currentLang)}
                      </span>
                      <Button
                        type="text"
                        size="small"
                        onClick={() => handleCopyText(qaResult, 'qaResult')}
                        icon={copiedId === 'qaResult' ? <Check size={11} color="#10b981" /> : <Copy size={11} color={colors.textMuted} />}
                        style={{ 
                          fontSize: '11px', 
                          height: 22, 
                          padding: '0 8px', 
                          borderRadius: 6,
                          background: copiedId === 'qaResult' ? (isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5') : 'transparent',
                          color: copiedId === 'qaResult' ? '#10b981' : colors.textMuted, 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 4 
                        }}
                      >
                        {copiedId === 'qaResult' ? (currentLang === 'vi' ? 'Đã sao chép' : 'Copied') : translate('copyBtn', currentLang)}
                      </Button>
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: colors.textMain, lineHeight: '1.5', whiteSpace: 'pre-wrap', fontWeight: 500 }}>
                      {qaResult}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // Manual Lookup Mode
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeIn 0.2s' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <Input 
                placeholder={translate('searchWords', currentLang)} 
                value={manualQuery} 
                onChange={e => setManualQuery(e.target.value)}
                onPressEnter={handleManualSearch}
                style={{ borderRadius: 8, height: 34, background: colors.bgContainer, border: '1px solid ' + colors.border, color: colors.textMain, fontSize: 13 }} 
              />
              <Button 
                type="primary" 
                onClick={handleManualSearch} 
                loading={manualLoading}
                style={{ height: 34, background: '#4f46e5', border: 'none', borderRadius: 8, color: '#ffffff', fontWeight: 600, fontSize: 13, padding: '0 14px' }}
              >
                {translate('lookupBtn', currentLang)}
              </Button>
            </div>

            {manualResult ? (
              <div style={{ background: colors.bgContainer, border: '1px solid ' + colors.border, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, animation: 'fadeIn 0.3s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ 
                    fontFamily: '"Lora", serif', 
                    fontSize: '20px', 
                    fontWeight: 600, 
                    color: colors.textMain, 
                    letterSpacing: '-0.3px' 
                  }}>
                    {manualResult.word}
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button type="text" size="small" style={{ background: colors.bgLight, border: '1px solid ' + colors.border, fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2, color: colors.textMain }} onClick={() => speakWord(manualResult.word, 'en-US')}>
                      <Volume2 size={12} color="#4f46e5" /> US
                    </Button>
                    <Button type="text" size="small" style={{ background: colors.bgLight, border: '1px solid ' + colors.border, fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 2, color: colors.textMain }} onClick={() => speakWord(manualResult.word, 'en-GB')}>
                      <Volume2 size={12} color="#6366f1" /> UK
                    </Button>
                  </div>
                </div>

                {manualResult.phonetic && (
                  <span style={{ color: isDark ? '#34d399' : '#059669', fontSize: '12px', fontStyle: 'italic', fontWeight: 500 }}>
                    {manualResult.phonetic}
                  </span>
                )}

                <div style={{ borderTop: '1px solid ' + colors.borderLight, paddingTop: 6 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: isDark ? '#f8fafc' : '#1e293b' }}>
                    {manualResult.vietnameseMeaning || 'Chưa tìm thấy bản dịch'}
                  </div>
                </div>

                {manualResult.meanings?.[0]?.definitions?.[0]?.definition && (
                  <div style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '1.4' }}>
                    {manualResult.meanings[0].definitions[0].definition}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <Button 
                    type="primary" 
                    onClick={saveManualWord}
                    disabled={isManualSaved}
                    icon={isManualSaved ? <Check size={14} /> : <Plus size={14} />}
                    style={{ flex: 1, height: 34, borderRadius: 8, background: isManualSaved ? '#059669' : '#4f46e5', border: 'none', fontWeight: 600, fontSize: 13, color: '#ffffff' }}
                  >
                    {isManualSaved 
                      ? (manualResult.word.split(/\s+/).filter(Boolean).length > 1 ? translate('savedPhraseBtn', currentLang) : translate('savedWordBtn', currentLang)) 
                      : (manualResult.word.split(/\s+/).filter(Boolean).length > 1 ? translate('savePhraseBtn', currentLang) : translate('saveWordBtn', currentLang))}
                  </Button>
                  
                  {isAiConfigured && (
                    <Button 
                      type="default" 
                      onClick={handleWordAiSupport}
                      loading={wordExplanationLoading}
                      icon={<Sparkles size={14} color="#60a5fa" />}
                      style={{ 
                        flex: 1, 
                        height: 34, 
                        borderRadius: 8, 
                        borderColor: colors.border, 
                        background: colors.bgLight, 
                        color: '#60a5fa', 
                        fontWeight: 600,
                        fontSize: 13
                      }}
                    >
                      {translate('aiSupportBtn', currentLang)}
                    </Button>
                  )}
                </div>

                {wordExplanation && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: colors.bgLight, border: '1px solid ' + colors.border, padding: 12, borderRadius: 10, marginTop: 6, animation: 'fadeIn 0.3s' }}>
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#60a5fa', letterSpacing: '0.5px' }}>
                      {translate('aiSupportResultTitle', currentLang)}
                    </span>
                    <p style={{ margin: 0, fontSize: '12.5px', color: colors.textMain, lineHeight: '1.45', whiteSpace: 'pre-wrap' }}>
                      {wordExplanation}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                {/* Learning Quick Overview */}
                <div style={{ 
                  background: colors.bgContainer, 
                  border: '1px solid ' + colors.borderLight, 
                  borderRadius: 12, 
                  padding: '12px 14px',
                  display: 'flex',
                  justifyContent: 'space-around',
                  alignItems: 'center'
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#8b5cf6' }}>{words.length}</div>
                    <div style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500 }}>
                      {currentLang === 'vi' ? 'Tổng từ đã lưu' : 'Total saved'}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 24, background: colors.borderLight }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#10b981' }}>
                      {words.filter(w => w.status === 'learning').length}
                    </div>
                    <div style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500 }}>
                      {currentLang === 'vi' ? 'Đang học' : 'Learning'}
                    </div>
                  </div>
                  <div style={{ width: 1, height: 24, background: colors.borderLight }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '17px', fontWeight: 800, color: '#f59e0b' }}>
                      {words.filter(w => w.status === 'mastered').length}
                    </div>
                    <div style={{ fontSize: '11px', color: colors.textMuted, fontWeight: 500 }}>
                      {currentLang === 'vi' ? 'Đã thuộc' : 'Mastered'}
                    </div>
                  </div>
                </div>

                {/* Quick actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    onClick={() => setActiveTab('flashcards')}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 8,
                      background: colors.bgLight,
                      border: '1px solid ' + colors.border,
                      fontSize: '11px',
                      fontWeight: 600,
                      color: colors.textMain,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <Layers size={13} color="#8b5cf6" />
                    {currentLang === 'vi' ? 'Luyện Flashcards' : 'Flashcards'}
                  </Button>

                  <Button
                    onClick={() => setActiveTab('aichat')}
                    style={{
                      flex: 1,
                      height: 34,
                      borderRadius: 8,
                      background: colors.bgLight,
                      border: '1px solid ' + colors.border,
                      fontSize: '11px',
                      fontWeight: 600,
                      color: colors.textMain,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <MessageSquare size={13} color="#38bdf8" />
                    {currentLang === 'vi' ? 'Hỏi AI Chat' : 'AI Chat'}
                  </Button>
                </div>

                {/* Quick Hint */}
                <div style={{ 
                  textAlign: 'center', 
                  padding: '10px 12px', 
                  color: colors.textMuted,
                  fontSize: '11px',
                  background: isDark ? 'rgba(139, 92, 246, 0.08)' : 'rgba(139, 92, 246, 0.04)',
                  borderRadius: 8,
                  border: '1px dashed ' + (isDark ? 'rgba(139, 92, 246, 0.25)' : 'rgba(139, 92, 246, 0.15)')
                }}>
                  💡 {currentLang === 'vi' 
                    ? 'Bôi đen từ vựng trên bất kỳ trang web nào để tra nghĩa nhanh.' 
                    : 'Highlight any word on web pages for instant translation.'}
                </div>
              </div>
            )}
          </div>
        );
 
      case 'vocab':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.2s' }}>
            {/* Stats Cards */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1, background: colors.bgContainer, border: '1px solid ' + colors.border, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: colors.textMain }}>{totalWords}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: colors.textMuted, letterSpacing: '0.3px', marginTop: 2 }}>{translate('totalWordsLabel', currentLang)}</div>
              </div>
              <div style={{ flex: 1, background: colors.bgContainer, border: '1px solid ' + colors.border, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#2dd4bf' }}>{knownWords}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#2dd4bf', letterSpacing: '0.3px', marginTop: 2 }}>{translate('knownWordsLabel', currentLang)}</div>
              </div>
              <div style={{ flex: 1, background: colors.bgContainer, border: '1px solid ' + colors.border, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#fbbf24' }}>{toReview}</div>
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.3px', marginTop: 2 }}>{translate('toReviewWordsLabel', currentLang)}</div>
              </div>
            </div>

            {/* Search and Tag input */}
            <div style={{ display: 'flex', gap: 6 }}>
              <Input 
                placeholder={translate('vocabSearchPlaceholder', currentLang)} 
                value={vocabSearch}
                onChange={e => setVocabSearch(e.target.value)}
                prefix={<Search size={14} color="#64748b" />}
                style={{ flex: 1, borderRadius: 8, background: colors.bgContainer, border: '1px solid ' + colors.border, color: colors.textMain }}
              />
              <Select
                placeholder={currentLang === 'vi' ? 'Lọc thẻ...' : 'Tag...'}
                value={vocabSelectedTag}
                onChange={setVocabSelectedTag}
                allowClear
                style={{ width: 110 }}
                dropdownStyle={{ borderRadius: 8 }}
              >
                {allTags.map(tag => (
                  <Select.Option key={tag} value={tag}>
                    #{tag}
                  </Select.Option>
                ))}
              </Select>
            </div>

            {/* Filter buttons */}
            <div style={{ display: 'flex', background: colors.bgContainer, padding: '3px', borderRadius: '8px', border: '1px solid ' + colors.border, flexWrap: 'wrap', gap: '2px' }}>
              {(['all', 'new', 'learning', 'known', 'review'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setVocabFilter(f)}
                  style={{
                    flex: '1 1 auto',
                    border: 'none',
                    background: vocabFilter === f ? '#8b5cf6' : 'transparent',
                    color: vocabFilter === f ? '#ffffff' : colors.textMuted,
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '6px 4px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {f === 'all' ? translate('filterAll', currentLang) :
                   f === 'new' ? translate('statusNew', currentLang) :
                   f === 'learning' ? (currentLang === 'vi' ? 'Đang học' : 'Learning') :
                   f === 'known' ? translate('filterMastered', currentLang) : 
                   translate('filterReview', currentLang)}
                </button>
              ))}
            </div>

            {/* Word List */}
            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
              {filteredWords.length > 0 ? (
                filteredWords.map(word => {
                  const createdDate = word.created_at ? new Date(word.created_at) : null;
                  const dateStr = createdDate && !isNaN(createdDate.getTime())
                    ? createdDate.toLocaleDateString(currentLang === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit' })
                    : '';
                  return (
                    <div key={word.id} style={{ background: colors.bgContainer, border: '1px solid ' + colors.border, padding: '10px 12px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: word.status === 'mastered' ? '#10b981' : '#6366f1' }} />
                          <strong style={{ fontSize: '13px', color: colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                            {word.word}
                          </strong>
                          <span style={{ fontSize: '10px', color: '#8b5cf6' }}>{word.phonetic}</span>
                          {dateStr && (
                            <span style={{ fontSize: '10px', color: colors.textMuted, marginLeft: 'auto', marginRight: 4 }}>
                              {dateStr}
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '12px', color: colors.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {word.meaning}
                        </span>
                      </div>

                    <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                      <Button 
                        type="text" 
                        size="small" 
                        icon={<Check size={12} color="#10b981" />} 
                        onClick={async () => {
                          await updateWord(word.id, { status: 'mastered', review_level: 6 });
                          message.success(translate('editSuccess', currentLang));
                        }}
                        style={{ background: 'rgba(16, 185, 129, 0.1)', width: 22, height: 22, padding: 0, borderRadius: 6 }}
                        title="Mark as known"
                      />
                      <Button 
                        type="text" 
                        size="small" 
                        danger
                        icon={<Trash2 size={12} />} 
                        onClick={() => confirmDeleteWord(word.id)}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', width: 22, height: 22, padding: 0, borderRadius: 6 }}
                        title="Delete word"
                      />
                    </div>
                  </div>
                );
              })
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 0', color: colors.textMuted, fontSize: '12px' }}>
                  {translate('emptyVocab', currentLang)}
                </div>
              )}
            </div>

            <Button 
              type="primary" 
              onClick={() => openFullPageTab('vocabulary')}
              style={{ width: '100%', height: 38, borderRadius: 8, background: colors.bgLight, border: '1px solid ' + colors.border, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: colors.textMain }}
            >
              {translate('openDetailedVocab', currentLang)} <ChevronRight size={14} />
            </Button>
          </div>
        );

      case 'flashcards':
        return (
          <div style={{ textAlign: 'center', padding: '20px 10px', display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s' }}>
            <div style={{ 
              width: 64, 
              height: 64, 
              borderRadius: '50%', 
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(217, 70, 239, 0.15) 100%)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              margin: '0 auto'
            }}>
              <Layers size={28} color="#8b5cf6" />
            </div>

            <div>
              <strong style={{ fontSize: '15px', color: colors.textMain }}>{translate('flashcardReviewTitle', currentLang)}</strong>
              <p style={{ fontSize: '12px', color: colors.textMuted, marginTop: 4, lineHeight: '1.5' }}>
                {translate('flashcardReviewDesc', currentLang)}
              </p>
            </div>

            <div style={{ background: colors.bgContainer, border: '1px solid ' + colors.border, padding: '10px 14px', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted }}>{translate('dueForReview', currentLang)}</span>
              <Tag color={toReview > 0 ? "warning" : "success"} style={{ fontSize: '12px', borderRadius: 6, fontWeight: 700 }}>
                {translate('dueCount', currentLang, { count: toReview })}
              </Tag>
            </div>

            <Button 
              type="primary" 
              onClick={() => openFullPageTab('flashcards')}
              style={{ height: 40, background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', border: 'none', borderRadius: 8, fontWeight: 600, color: '#ffffff' }}
            >
              {translate('btnStartReview', currentLang)}
            </Button>
          </div>
        );

      case 'stats':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0', animation: 'fadeIn 0.2s' }}>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <strong style={{ fontSize: '15px', color: colors.textMain }}>{translate('learningProgressTitle', currentLang)}</strong>
              <span style={{ fontSize: '12px', color: colors.textMuted }}>{translate('learningProgressDesc', currentLang)}</span>
            </div>

            <div style={{ background: colors.bgContainer, border: '1px solid ' + colors.border, padding: 12, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: colors.textMuted }}>{translate('masteryRate', currentLang)}:</span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>
                    {totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0}%
                  </span>
                </div>
                <Progress 
                  percent={totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0} 
                  strokeColor="#10b981" 
                  trailColor={colors.bgLight}
                  showInfo={false} 
                />
              </div>
            </div>

            <Button 
              type="primary" 
              onClick={() => openFullPageTab('')}
              style={{ height: 38, background: '#7c3aed', border: 'none', borderRadius: 8, fontWeight: 600, color: '#ffffff' }}
            >
              {translate('dashboard', currentLang)} 📊
            </Button>
          </div>
        );

      case 'settings':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'fadeIn 0.2s' }}>
            <div style={{ background: colors.bgContainer, border: '1px solid ' + colors.border, padding: '12px 14px', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: colors.textMain, fontSize: '13px' }}>{translate('darkThemeLabel', currentLang)}</span>
                <Button 
                  type="text" 
                  onClick={toggleTheme}
                  icon={isDark ? <Sun size={16} color="#f59e0b" /> : <Moon size={16} color="#94a3b8" />}
                  style={{ background: colors.bgLight, border: '1px solid ' + colors.border, width: 34, height: 34, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: colors.textMain, fontSize: '13px' }}>{translate('targetLangLabel', currentLang)}</span>
                <Tag color="purple" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                  {translate('targetLangValue', currentLang)}
                </Tag>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid ' + colors.borderLight, paddingTop: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, paddingRight: 12 }}>
                  <span style={{ fontWeight: 600, color: colors.textMain, fontSize: '13px' }}>{translate('showTriggerIcon', currentLang)}</span>
                  <span style={{ color: colors.textMuted, fontSize: '11px', lineHeight: 1.3 }}>{translate('showTriggerIconDesc', currentLang)}</span>
                </div>
                <Switch 
                  checked={settings.show_trigger_icon !== false} 
                  onChange={async (checked) => {
                    await saveSettings({ show_trigger_icon: checked });
                  }} 
                />
              </div>
            </div>

            <Button 
              onClick={() => openFullPageTab('settings')}
              style={{ height: 38, borderRadius: 8, borderColor: colors.border, background: colors.bgLight, fontWeight: 600, color: colors.textMain }}
            >
              {translate('openAdvancedSettings', currentLang)}
            </Button>
          </div>
        );

      case 'aichat':
        return (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100%', 
            width: '100%', 
            background: colors.bgBase,
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            position: 'relative'
          }}>
            {/* Floating Restore Pill when header is hidden */}
            {isHeaderHidden && (
              <button
                type="button"
                onClick={() => setIsHeaderHidden(false)}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 40,
                  background: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid ' + (isDark ? 'rgba(56, 189, 248, 0.35)' : '#bae6fd'),
                  borderRadius: 20,
                  padding: '3px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isDark ? '#38bdf8' : '#0284c7',
                  boxShadow: '0 3px 12px rgba(0, 0, 0, 0.12)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  transition: 'all 0.18s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateX(-50%) scale(1.04)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
                }}
              >
                <ChevronDown size={13} color={isDark ? '#38bdf8' : '#0284c7'} />
                <span>{currentLang === 'vi' ? 'Hiện thanh điều khiển' : 'Show header'}</span>
              </button>
            )}

            {/* AI Provider Status Bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: isHeaderHidden ? '0 14px' : '8px 14px',
              maxHeight: isHeaderHidden ? 0 : 45,
              opacity: isHeaderHidden ? 0 : 1,
              overflow: 'hidden',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
              background: colors.bgContainer,
              borderBottom: isHeaderHidden ? 'none' : '1px solid ' + colors.border,
              fontSize: '12px',
              flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ 
                  width: 8, 
                  height: 8, 
                  borderRadius: '50%', 
                  background: isAiConfigured ? '#10b981' : '#f59e0b',
                  boxShadow: isAiConfigured ? '0 0 6px rgba(16, 185, 129, 0.6)' : 'none'
                }} />
                <span style={{ fontWeight: 600, color: colors.textMain, fontSize: '12px' }}>
                  {getAIProviderLabel(settings, currentLang)}
                </span>
                {isAiConfigured && (
                  <span style={{ 
                    fontSize: '10.5px', 
                    padding: '1px 6px', 
                    borderRadius: 4, 
                    background: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ecfdf5', 
                    color: '#10b981',
                    fontWeight: 600
                  }}>
                    {currentLang === 'vi' ? 'Sẵn sàng' : 'Ready'}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setIsHeaderHidden(true)}
                  title={currentLang === 'vi' ? 'Thu gọn header để tăng không gian chat' : 'Collapse header to save space'}
                  style={{
                    background: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9',
                    border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                    cursor: 'pointer',
                    color: colors.textMuted,
                    fontSize: '11px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 8px',
                    borderRadius: 6
                  }}
                >
                  <ChevronUp size={12} />
                  <span>{currentLang === 'vi' ? 'Thu gọn' : 'Collapse'}</span>
                </button>
                <button 
                  onClick={() => openFullPageTab('settings')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: colors.primary,
                    fontSize: '11.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '2px 4px'
                  }}
                >
                  <Settings size={12} />
                  {currentLang === 'vi' ? 'Cài đặt' : 'Settings'}
                </button>
              </div>
            </div>


            {/* Warning if AI is not configured */}
            {!isAiConfigured && (
              <div style={{ padding: '12px 14px' }}>
                <div style={{ 
                  background: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb', 
                  border: '1px solid ' + (isDark ? 'rgba(245, 158, 11, 0.3)' : '#fde68a'), 
                  borderRadius: 10, 
                  padding: '12px 14px', 
                  fontSize: '13px', 
                  color: isDark ? '#fbbf24' : '#b45309', 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: 10,
                  animation: 'fadeIn 0.2s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Sparkles size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontWeight: 500, lineHeight: 1.4 }}>
                      {translate('aiChatNotConfigured', currentLang)}
                    </span>
                  </div>
                  <Button 
                    type="primary" 
                    onClick={() => openFullPageTab('settings')}
                    style={{ width: '100%', height: 34, background: '#f59e0b', borderColor: '#f59e0b', color: '#ffffff', fontWeight: 700, borderRadius: 8 }}
                  >
                    {translate('setupNow', currentLang)}
                  </Button>
                </div>
              </div>
            )}

            {/* Chat History Area */}
            <div 
              ref={chatScrollRef}
              onScroll={handleChatScroll}
              style={{ 
                flex: 1, 
                minHeight: 0,
                overflowY: 'auto', 
                overscrollBehavior: 'contain',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              {chatHistory.length === 0 ? (
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: 12, 
                  padding: '30px 10px', 
                  textAlign: 'center' 
                }}>
                  <div style={{ 
                    width: 52, 
                    height: 52, 
                    borderRadius: '50%', 
                    background: 'linear-gradient(135deg, rgba(2, 132, 199, 0.15) 0%, rgba(56, 189, 248, 0.15) 100%)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <Sparkles size={24} color="#0284c7" />
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, fontWeight: 500, color: colors.textMain, maxWidth: 320 }}>
                    {translate('chatNoMessages', currentLang)}
                  </p>

                  {/* Suggestion Chips */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 320, marginTop: 6 }}>
                    {[
                      {
                        title: currentLang === 'vi' ? '💡 Giải thích ngữ pháp & sửa câu' : '💡 Explain grammar & check sentence',
                        text: currentLang === 'vi' ? 'Hãy giải thích cho tôi sự khác biệt giữa thì Hiện tại Hoàn thành và Quá khứ Đơn kèm ví dụ.' : 'Can you explain the difference between Present Perfect and Past Simple with examples?'
                      },
                      {
                        title: currentLang === 'vi' ? '✍️ Nâng cấp câu văn tiếng Anh tự nhiên' : '✍️ Rewrite naturally & professionally',
                        text: currentLang === 'vi' ? 'Hãy giúp tôi viết lại câu này cho tự nhiên và chuẩn văn phong: "I want to apply this job because I very like your company".' : 'Help me rewrite this sentence naturally and professionally: "I want to apply this job because I very like your company".'
                      },
                      {
                        title: currentLang === 'vi' ? '🌐 Hỏi đáp kiến thức tổng quát bất kỳ' : '🌐 Ask anything / General Q&A',
                        text: currentLang === 'vi' ? 'Hãy chia sẻ 3 mẹo hay nhất để ghi nhớ từ vựng tiếng Anh lâu không bị quên.' : 'Share 3 best tips to remember English vocabulary effectively.'
                      }
                    ].map((chip, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setChatInput(chip.text);
                        }}
                        style={{
                          background: colors.bgContainer,
                          border: '1px solid ' + colors.border,
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontSize: '12px',
                          color: colors.textMain,
                          textAlign: 'left',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#0284c7';
                          e.currentTarget.style.background = isDark ? 'rgba(2, 132, 199, 0.12)' : '#f0f9ff';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = colors.border;
                          e.currentTarget.style.background = colors.bgContainer;
                        }}
                      >
                        <span style={{ fontWeight: 500 }}>{chip.title}</span>
                        <ChevronRight size={14} color={colors.textMuted} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div 
                    key={idx}
                    ref={idx === latestQuestionIndex ? latestQuestionRef : undefined}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      width: '100%',
                      animation: 'fadeIn 0.2s'
                    }}
                  >
                    <div style={{
                      maxWidth: '88%',
                      padding: msg.image ? '10px 14px' : '10px 18px',
                      borderRadius: '22px',
                      background: msg.sender === 'user' 
                        ? (isDark ? 'rgba(2, 132, 199, 0.25)' : '#e8f3fe')
                        : colors.bgContainer,
                      border: msg.sender === 'user' 
                        ? (isDark ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid #dbeafe')
                        : '1px solid ' + colors.border,
                      color: msg.sender === 'user' 
                        ? (isDark ? '#f8fafc' : '#151d2a')
                        : colors.textMain,
                      boxShadow: msg.sender === 'user' ? '0 1px 2px rgba(15, 23, 42, 0.04)' : 'none'
                    }}>
                      {msg.sender === 'user' && msg.context && (
                        <div style={{
                          marginBottom: 8, padding: '6px 8px', borderRadius: 8,
                          background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.7)',
                          border: '1px solid ' + (isDark ? '#334155' : '#bfdbfe'),
                          maxWidth: '100%', minWidth: 0
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: colors.primary }}>
                            {currentLang === 'vi' ? 'Ngữ cảnh từ trang web' : 'Context from page'}
                          </div>
                          <div style={{
                            fontSize: 11, color: colors.textMuted, whiteSpace: 'nowrap',
                            overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>{contextPreview(msg.context)}</div>
                        </div>
                      )}
                      {msg.image && (
                        <div style={{ marginBottom: 6 }}>
                          <img 
                            src={msg.image} 
                            alt="Attached image" 
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: 200, 
                              borderRadius: 8, 
                              display: 'block',
                              objectFit: 'contain',
                              background: isDark ? '#0b0f19' : '#ffffff',
                              border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)')
                            }} 
                          />
                        </div>
                      )}
                      {msg.sender === 'user' ? (
                        <p style={{ 
                          margin: 0, 
                          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Be Vietnam Pro', sans-serif",
                          fontSize: '14.5px', 
                          lineHeight: '1.45', 
                          whiteSpace: 'pre-wrap', 
                          fontWeight: 400, 
                          letterSpacing: '-0.01em',
                          color: isDark ? '#f8fafc' : '#151d2a' 
                        }}>
                          {msg.text}
                        </p>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <Button
                              type="text"
                              size="small"
                              onClick={() => void handleInsertIntoGoogleDocs(msg.text, idx)}
                              loading={insertingIntoDocsId === idx}
                              icon={<FileInput size={15} />}
                              aria-label={currentLang === 'vi' ? 'Chèn vào Google Docs tại con trỏ' : 'Insert into Google Docs at cursor'}
                              title={currentLang === 'vi' ? 'Chèn vào Google Docs tại con trỏ' : 'Insert into Google Docs at cursor'}
                              style={{ width: 26, height: 26, padding: 0, color: colors.primary }}
                            />
                            <Dropdown
                              trigger={['click']}
                              placement="bottomRight"
                              menu={{
                                items: [
                                  { key: 'markdown', label: currentLang === 'vi' ? 'Sao chép Markdown' : 'Copy Markdown' },
                                  { key: 'googleDocs', label: currentLang === 'vi' ? 'Sao chép cho Google Docs' : 'Copy for Google Docs' },
                                ],
                                onClick: ({ key }) => {
                                  if (key === 'googleDocs') void handleCopyForGoogleDocs(msg.text, idx);
                                  else handleCopyText(msg.text, idx);
                                },
                              }}
                            >
                              <Button
                                type="text"
                                size="small"
                                icon={copiedId === idx ? <Check size={15} /> : <Copy size={15} />}
                                aria-label={currentLang === 'vi' ? 'Chọn kiểu sao chép' : 'Choose copy format'}
                                title={currentLang === 'vi' ? 'Chọn kiểu sao chép' : 'Choose copy format'}
                                style={{ width: 26, height: 26, padding: 0, color: copiedId === idx ? '#10b981' : colors.textMuted }}
                              />
                            </Dropdown>
                            <Button
                              type="text"
                              size="small"
                              onClick={() => handleSaveGrammar(msg.text, idx)}
                              loading={savingGrammarIdx === idx}
                              icon={<BookOpen size={15} />}
                              aria-label={translate('saveGrammarBtn', currentLang)}
                              title={translate('saveGrammarBtn', currentLang)}
                              style={{ width: 26, height: 26, padding: 0, color: colors.primary }}
                            />
                          </div>
                          {docsInsertError?.id === idx && (
                            <div role="alert" style={{ color: isDark ? '#fca5a5' : '#b91c1c', fontSize: 12, lineHeight: 1.45, marginBottom: 8 }}>
                              {docsInsertError.text}
                            </div>
                          )}
                          <div
                            className="chat-markdown"
                            onClick={event => {
                              const target = event.target;
                              if (!(target instanceof Element)) return;
                              const button = target.closest<HTMLButtonElement>('.code-copy-button');
                              if (!button) return;
                              const code = button.closest('pre')?.querySelector('code');
                              if (code) handleCopyText(code.textContent || '');
                            }}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text, currentLang) }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* Typing loader */}
              {chatLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', animation: 'fadeIn 0.2s' }}>
                  <span style={{ fontSize: '12px', color: colors.textMuted, fontStyle: 'italic' }}>
                    AI is typing
                  </span>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: '10px' }}>
                    <span className="chat-dot" />
                    <span className="chat-dot" />
                    <span className="chat-dot" />
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div style={{ 
              flexShrink: 0,
              padding: '10px 16px 14px 16px', 
              borderTop: '1px solid ' + colors.border, 
              background: colors.bgContainer,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              zIndex: 10
            }}>
              {chatSelection && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
                  borderRadius: 9, background: isDark ? '#1e293b' : '#f0f9ff',
                  border: '1px solid ' + (isDark ? '#334155' : '#bae6fd')
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: colors.primary, marginBottom: 2 }}>
                      {currentLang === 'vi' ? 'Ngữ cảnh từ trang web' : 'Context from page'}
                    </div>
                    <div style={{
                      fontSize: 12, color: colors.textMain, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>{contextPreview(chatSelection)}</div>
                  </div>
                  <button type="button" onClick={clearChatSelection}
                    title={currentLang === 'vi' ? 'Bỏ ngữ cảnh' : 'Remove context'}
                    style={{ border: 0, background: 'none', color: colors.textMuted, cursor: 'pointer', padding: 2 }}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
              {/* Attached Image Thumbnail Preview */}
              {chatImage && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 8px',
                  background: isDark ? 'rgba(2, 132, 199, 0.2)' : '#e0f2fe',
                  borderRadius: 8,
                  border: '1px solid ' + (isDark ? 'rgba(56, 189, 248, 0.3)' : '#bae6fd'),
                  width: 'fit-content',
                  animation: 'fadeIn 0.2s'
                }}>
                  <img 
                    src={chatImage} 
                    alt="Preview" 
                    style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, border: '1px solid rgba(0,0,0,0.1)' }} 
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: isDark ? '#e0f2fe' : '#0f172a' }}>
                      {currentLang === 'vi' ? 'Đã đính kèm ảnh' : 'Attached image'}
                    </span>
                    <span style={{ fontSize: '10px', color: colors.textMuted }}>
                      {currentLang === 'vi' ? 'Sẵn sàng gửi hoặc gõ thêm câu hỏi' : 'Ready to send'}
                    </span>
                  </div>
                  <button
                    onClick={() => setChatImage(null)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      color: '#ef4444',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title={currentLang === 'vi' ? 'Bỏ ảnh' : 'Remove image'}
                  >
                    <XCircle size={15} />
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  accept="image/*" 
                  style={{ display: 'none' }} 
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title={currentLang === 'vi' ? 'Đính kèm ảnh hoặc dán ảnh (Ctrl+V)' : 'Attach image or paste (Ctrl+V)'}
                  style={{
                    height: 36,
                    width: 36,
                    minWidth: 36,
                    borderRadius: 10,
                    background: isDark ? '#1e293b' : '#f0f9ff',
                    border: '1px solid ' + (isDark ? '#334155' : '#bae6fd'),
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <LucideImage size={17} />
                </button>
                <Input.TextArea
                  placeholder={
                    isAiConfigured 
                      ? (currentLang === 'vi' 
                          ? 'Hỏi bất kỳ điều gì, hoặc dán ảnh (Ctrl+V)...' 
                          : 'Ask anything, or paste an image (Ctrl+V)...')
                      : (currentLang === 'vi' 
                          ? 'Thiết lập AI trong Cài đặt để bắt đầu trò chuyện...' 
                          : 'Configure AI in Settings to start chatting...')
                  }
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onPaste={handleChatPaste}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendChat();
                    }
                  }}
                  autoSize={{ minRows: 1, maxRows: 3 }}
                  disabled={chatLoading}
                  style={{ 
                    borderRadius: 12, 
                    background: colors.bgBase, 
                    border: '1px solid ' + colors.border, 
                    color: colors.textMain, 
                    fontSize: '13px',
                    padding: '8px 12px',
                    resize: 'none',
                    flex: 1
                  }} 
                />
                <Button 
                  type="primary"
                  onClick={handleSendChat}
                  loading={chatLoading}
                  disabled={!chatInput.trim() && !chatImage}
                  style={{ 
                    height: 36, 
                    width: 36, 
                    minWidth: 36,
                    borderRadius: 10, 
                    background: '#0284c7', 
                    borderColor: '#0284c7',
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    padding: 0
                  }}
                >
                  <ChevronRight size={18} color="#ffffff" />
                </Button>
              </div>
              {chatHistory.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setChatHistory([])}
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      color: '#64748b', 
                      fontSize: '11px', 
                      fontWeight: 600,
                      padding: 0
                    }}
                  >
                    {translate('chatClearHistory', currentLang)}
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'todos':
        return renderTodosTab();

      default:
        return null;
    }
  };

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: isPopup ? '100%' : '100vh',
    maxHeight: isPopup ? '100%' : '100vh',
    background: colors.bgBase,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Be Vietnam Pro", sans-serif',
    color: colors.textMain,
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative',
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: '#8b5cf6',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Be Vietnam Pro', sans-serif",
          borderRadius: 8,
          colorBgContainer: colors.bgContainer,
          colorText: colors.textMain,
          colorBorder: colors.border,
          colorBgBase: colors.bgBase,
        },
        components: {
          Input: {
            colorBgContainer: colors.bgContainer,
            colorBorder: colors.border,
            colorTextPlaceholder: '#64748b',
          },
          Button: {
            controlHeight: 38,
            borderRadius: 8,
          }
        }
      }}
    >
      <div className="compact-view-container" style={containerStyle}>
        <GeometricBackground isDark={isDark} variant="compact" />

        {/* Collapsible Header Group: Compact Header + Tabs navigation */}
        <div 
          style={{
            maxHeight: (activeTab === 'aichat' && isHeaderHidden) ? '0px' : '110px',
            opacity: (activeTab === 'aichat' && isHeaderHidden) ? 0 : 1,
            overflow: 'hidden',
            transition: 'max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease',
            flexShrink: 0,
            zIndex: 20
          }}
        >
          {/* Compact Header */}
          <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid ' + colors.borderLight,
          background: colors.bgContainer,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              overflow: 'hidden',
              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#4f46e5'
            }}>
              <img 
                src="/logo.png" 
                alt="Logo" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover',
                }} 
              />
            </div>
            <span style={{ fontWeight: 800, fontSize: '13px', color: colors.textMain, letterSpacing: '-0.2px' }}>
              English Space
            </span>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <PomodoroTimerWidget compact={true} />
            
            <Button
              type="text"
              size="small"
              onClick={() => saveSettings({ language: currentLang === 'vi' ? 'en' : 'vi' })}
              style={{
                fontSize: '10px',
                fontWeight: 800,
                margin: 0,
                borderRadius: 7,
                background: isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.08)',
                color: isDark ? '#c4b5fd' : '#7c3aed',
                border: isDark ? '1px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(139, 92, 246, 0.18)',
                height: 24,
                padding: '0 7px'
              }}
              title="Ngôn ngữ (VI/EN)"
            >
              {currentLang.toUpperCase()}
            </Button>
            
            <Button 
              type="text" 
              size="small" 
              onClick={toggleTheme}
              icon={isDark ? <Sun size={13} color="#fbbf24" /> : <Moon size={13} color="#6366f1" />}
              style={{ 
                width: 24, 
                height: 24, 
                padding: 0, 
                borderRadius: 7, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                background: colors.bgLight, 
                border: '1px solid ' + colors.border 
              }}
              title={isDark ? 'Chế độ sáng' : 'Chế độ tối'}
            />
            
            <Button 
              type="text" 
              size="small" 
              onClick={() => openFullPageTab('')}
              icon={<ExternalLink size={12} color="#4f46e5" />}
              style={{ 
                width: 24, 
                height: 24, 
                padding: 0, 
                borderRadius: 7, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                background: isDark ? 'rgba(79, 70, 229, 0.15)' : 'rgba(79, 70, 229, 0.08)', 
                border: isDark ? '1px solid rgba(79, 70, 229, 0.3)' : '1px solid rgba(79, 70, 229, 0.2)' 
              }}
              title={currentLang === 'vi' ? 'Mở Bảng điều khiển' : 'Open Dashboard'}
            />
          </div>
        </div>

        {/* Tabs navigation pill container */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid ' + colors.borderLight,
          background: colors.bgContainer,
          padding: '6px 8px',
          gap: 4,
          zIndex: 10
        }}>
          {[
            { id: 'aichat', label: translate('aiChatTab', currentLang), icon: <MessageSquare size={13} /> },
            { id: 'lookup', label: translate('lookUpTab', currentLang), icon: <Search size={13} /> },
            { 
              id: 'todos', 
              label: translate('todosTab', currentLang), 
              icon: <CheckSquare size={13} />, 
              badge: pendingTodosCount > 0 ? pendingTodosCount : undefined 
            },
            { id: 'vocab', label: translate('vocabTab', currentLang), icon: <BookOpen size={13} /> },
            { id: 'flashcards', label: translate('flashcardsTab', currentLang), icon: <Layers size={13} /> },
            { id: 'stats', label: translate('statsTab', currentLang), icon: <BarChart2 size={13} /> },
            { id: 'settings', label: translate('settingsTab', currentLang), icon: <Settings size={13} /> }
          ].map(t => {
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                style={{
                  flex: 1,
                  background: isActive 
                    ? (isDark ? 'rgba(56, 189, 248, 0.18)' : 'rgba(14, 165, 233, 0.1)')
                    : 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  color: isActive ? (isDark ? '#38bdf8' : '#0284c7') : colors.textMuted,
                  padding: '6px 2px',
                  fontSize: '11px',
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  transition: 'all 0.18s ease',
                  position: 'relative'
                }}
              >
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {t.icon}
                  {t.badge !== undefined && (
                    <span style={{
                      position: 'absolute',
                      top: -6,
                      right: -10,
                      background: overdueTodosCount > 0 ? '#ef4444' : '#0284c7',
                      color: '#ffffff',
                      fontSize: '9px',
                      fontWeight: 800,
                      borderRadius: 10,
                      padding: '0 4px',
                      lineHeight: '13px'
                    }}>
                      {t.badge}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '10px', lineHeight: 1.1 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content area */}
      <div style={{ 
        position: 'relative',
        zIndex: 1,
        flex: 1, 
        minHeight: 0,
        padding: activeTab === 'aichat' ? '0' : '14px 16px', 
        background: 'transparent', 
        overflowY: activeTab === 'aichat' ? 'hidden' : 'auto',
        display: activeTab === 'aichat' ? 'flex' : 'block',
        flexDirection: 'column',
        height: '100%'
      }}>
        {renderTabContent()}
      </div>
      </div>
    </ConfigProvider>
  );
};
