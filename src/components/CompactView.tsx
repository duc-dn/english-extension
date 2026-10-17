import React, { useEffect, useState, useRef } from 'react';
import { db, addWord, deleteWord, updateWord, addGrammarNote } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Search, BookOpen, Layers, BarChart2, Settings, 
  Volume2, Check, Trash2, Globe, Moon, Sun, 
  Sparkles, XCircle, ChevronRight, Plus, MessageSquare, ExternalLink,
  CheckSquare, Square, CheckCircle2, Calendar
} from 'lucide-react';
import { fetchBasicMeaning, translateSentence, translateSentenceWithAI, summarizeSentence, explainWord, sendChatMessage, extractGrammarNote } from '../lib/translator';
import type { ChatHistoryItem } from '../lib/translator';
import { Input, Button, Tag, Progress, message, ConfigProvider, Modal, theme as antdTheme, Select, Switch } from 'antd';
import { saveSettings, useSettings } from '../lib/settings';
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

export const CompactView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'lookup' | 'vocab' | 'flashcards' | 'stats' | 'settings' | 'aichat' | 'todos'>('lookup');
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
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const [savingGrammarIdx, setSavingGrammarIdx] = useState<number | null>(null);

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
  const isAiConfigured = 
    (settings.ai_provider === 'gemini' && !!settings.gemini_api_key) ||
    (settings.ai_provider === 'openai' && !!settings.openai_api_key) ||
    (settings.ai_provider === 'chatgpt_web') ||
    (settings.ai_provider === 'ollama' && !!settings.ollama_url);

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
  const words = useLiveQuery(() => db.words.toArray()) || [];

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
      chrome.storage.local.get(['selectedParagraph', 'shiftSelectedText'], (res: any) => {
        if (res) {
          if (res.selectedParagraph && typeof res.selectedParagraph === 'string') {
            setSelectedParagraph(res.selectedParagraph);
            setAiResult('');
            setAiMode(null);
            setQaQuery('');
            setQaResult('');
            setActiveTab('lookup');
          } else if (res.shiftSelectedText && typeof res.shiftSelectedText === 'string') {
            const text = res.shiftSelectedText;
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            if (wordCount <= 5) {
              setManualQuery(text);
              setActiveTab('lookup');
              setManualLoading(true);
              const isPhrase = wordCount > 1;
              if (isPhrase) {
                translateSentence(text)
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
                fetchBasicMeaning(text)
                  .then(r => setManualResult(r))
                  .catch(err => console.error(err))
                  .finally(() => setManualLoading(false));
              }
            } else {
              setSelectedParagraph(text);
              setAiResult('');
              setAiMode(null);
              setQaQuery('');
              setQaResult('');
              setActiveTab('lookup');
            }
          }
        }
      });

      // Listen for updates
      const listener = (changes: any, area: string) => {
        if (area === 'local') {
          if (changes.selectedParagraph) {
            setSelectedParagraph(changes.selectedParagraph.newValue || '');
            setAiResult('');
            setAiMode(null);
            setQaQuery('');
            setQaResult('');
            setActiveTab('lookup');
          }
          
          if (changes.shiftSelectedText) {
            const text = changes.shiftSelectedText.newValue || '';
            if (text) {
              const wordCount = text.split(/\s+/).filter(Boolean).length;
              if (wordCount <= 5) {
                // Word or short phrase lookup
                setSelectedParagraph('');
                setManualQuery(text);
                setIsManualSaved(false);
                setWordExplanation('');
                setManualLoading(true);
                setActiveTab('lookup');
                
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
                setActiveTab('lookup');
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
      const explanation = await explainWord(manualResult.word, manualResult.meanings?.[0]?.definitions?.[0]?.definition);
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

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, chatLoading]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    if (!isAiConfigured) {
      message.warning(translate('aiRedirecting', currentLang));
      setTimeout(() => openFullPageTab('settings'), 800);
      return;
    }

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    const newHistory: ChatHistoryItem[] = [...chatHistory, { sender: 'user', text: userMsg }];
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

  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentList: React.ReactNode[] = [];
    let isInsideList = false;
    let currentListType: 'bullet' | 'numbered' | null = null;

    const parseInlineStyles = (lineText: string) => {
      const parts = lineText.split('**');
      return parts.map((part, idx) => {
        if (idx % 2 === 1) {
          return <strong key={idx} style={{ color: colors.textMain, fontWeight: 700 }}>{part}</strong>;
        }
        return part;
      });
    };

    const flushList = (key: number) => {
      if (currentList.length > 0) {
        if (currentListType === 'bullet') {
          elements.push(
            <ul key={`list-${key}`} style={{ margin: '4px 0 10px 18px', padding: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {currentList}
            </ul>
          );
        } else {
          elements.push(
            <ol key={`list-${key}`} style={{ margin: '4px 0 10px 18px', padding: 0, listStyleType: 'decimal', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {currentList}
            </ol>
          );
        }
        currentList = [];
      }
      isInsideList = false;
      currentListType = null;
    };

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList(index);
        return;
      }

      const bulletMatch = trimmed.match(/^[*•-]\s+(.*)$/);
      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);

      if (bulletMatch) {
        if (isInsideList && currentListType !== 'bullet') {
          flushList(index);
        }
        isInsideList = true;
        currentListType = 'bullet';
        currentList.push(
          <li key={index} style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '1.5' }}>
            {parseInlineStyles(bulletMatch[1])}
          </li>
        );
      } else if (numberedMatch) {
        if (isInsideList && currentListType !== 'numbered') {
          flushList(index);
        }
        isInsideList = true;
        currentListType = 'numbered';
        currentList.push(
          <li key={index} style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '1.5' }}>
            {parseInlineStyles(numberedMatch[2])}
          </li>
        );
      } else {
        flushList(index);
        elements.push(
          <p key={index} style={{ margin: '0 0 10px 0', fontSize: '13px', color: colors.textMuted, lineHeight: '1.5' }}>
            {parseInlineStyles(trimmed)}
          </p>
        );
      }
    });

    flushList(lines.length);
    return <div style={{ wordBreak: 'break-word' }}>{elements}</div>;
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
                  <span style={{ fontSize: '10px', fontWeight: 800, color: aiMode === 'translation' ? '#c084fc' : '#2dd4bf', letterSpacing: '0.5px' }}>
                    {aiMode === 'translation' ? translate('translationResult', currentLang) : translate('summaryResult', currentLang)}
                  </span>
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
                    <span style={{ fontSize: '10px', fontWeight: 800, color: '#34d399', letterSpacing: '0.5px' }}>
                      {translate('qaResultTitle', currentLang)}
                    </span>
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
                filteredWords.map(word => (
                  <div key={word.id} style={{ background: colors.bgContainer, border: '1px solid ' + colors.border, padding: '10px 12px', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: word.status === 'mastered' ? '#10b981' : '#6366f1' }} />
                        <strong style={{ fontSize: '13px', color: colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>
                          {word.word}
                        </strong>
                        <span style={{ fontSize: '10px', color: '#8b5cf6' }}>{word.phonetic}</span>
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
                ))
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
            background: colors.bgBase
          }}>
            {/* Selected Text context banner */}
            {selectedParagraph && (
              <div style={{ 
                background: colors.bgContainer, 
                borderBottom: '1px solid ' + colors.border, 
                padding: '10px 14px', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 4 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.5px' }}>
                    {translate('chatContextActive', currentLang)}
                  </span>
                  <button 
                    onClick={clearSelection} 
                    style={{ 
                      background: 'none', 
                      border: 'none', 
                      cursor: 'pointer', 
                      color: '#f87171', 
                      fontSize: '11px', 
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                      padding: 0
                    }}
                  >
                    <XCircle size={12} />
                    {translate('chatClearContext', currentLang)}
                  </button>
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: colors.textMuted, 
                  fontStyle: 'italic', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis' 
                }}>
                  "{selectedParagraph}"
                </div>
              </div>
            )}

            {/* Warning if AI is not configured */}
            {!isAiConfigured && (
              <div style={{ padding: '14px 16px' }}>
                <div style={{ 
                  background: 'rgba(245, 158, 11, 0.1)', 
                  border: '1px solid rgba(245, 158, 11, 0.2)', 
                  borderRadius: 10, 
                  padding: '12px 14px', 
                  fontSize: '13px', 
                  color: '#fbbf24', 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: 10,
                  animation: 'fadeIn 0.2s'
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Sparkles size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontWeight: 500, lineHeight: 1.4 }}>
                      {translate('aiNotConfigured', currentLang)}
                    </span>
                  </div>
                  <Button 
                    type="primary" 
                    onClick={() => openFullPageTab('settings')}
                    style={{ width: '100%', height: 36, background: '#fbbf24', border: 'none', color: '#000000', fontWeight: 700 }}
                  >
                    {translate('setupNow', currentLang)}
                  </Button>
                </div>
              </div>
            )}

            {/* Chat History Area */}
            <div 
              ref={chatScrollRef}
              style={{ 
                flex: 1, 
                overflowY: 'auto', 
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
                  height: '100%', 
                  color: colors.textMuted,
                  textAlign: 'center',
                  padding: '40px 20px',
                  gap: 12
                }}>
                  <div style={{ 
                    width: 56, 
                    height: 56, 
                    borderRadius: '50%', 
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(217, 70, 239, 0.1) 100%)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center' 
                  }}>
                    <Sparkles size={24} color="#8b5cf6" />
                  </div>
                  <p style={{ fontSize: '13px', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
                    {translate('chatNoMessages', currentLang)}
                  </p>
                </div>
              ) : (
                chatHistory.map((msg, idx) => (
                  <div 
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                      width: '100%',
                      animation: 'fadeIn 0.2s'
                    }}
                  >
                    <div style={{
                      maxWidth: '85%',
                      padding: '10px 14px',
                      borderRadius: msg.sender === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                      background: msg.sender === 'user' 
                        ? 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' 
                        : colors.bgContainer,
                      border: msg.sender === 'user' ? 'none' : '1px solid ' + colors.border,
                      color: msg.sender === 'user' ? '#ffffff' : colors.textMain,
                      boxShadow: msg.sender === 'user' ? '0 2px 8px rgba(124, 58, 237, 0.15)' : 'none'
                    }}>
                      {msg.sender === 'user' ? (
                        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                          {msg.text}
                        </p>
                      ) : (
                        <div>
                          {renderFormattedText(msg.text)}
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: 6 }}>
                            <Button
                              type="text"
                              size="small"
                              onClick={() => handleSaveGrammar(msg.text, idx)}
                              loading={savingGrammarIdx === idx}
                              icon={<BookOpen size={12} color="#c084fc" />}
                              style={{ 
                                fontSize: '11px', 
                                height: 22, 
                                padding: '0 8px', 
                                background: isDark ? 'rgba(192, 132, 252, 0.1)' : '#f3e8ff', 
                                border: '1px solid ' + (isDark ? 'rgba(192, 132, 252, 0.2)' : '#e9d5ff'),
                                borderRadius: 6,
                                color: '#c084fc',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              {translate('saveGrammarBtn', currentLang)}
                            </Button>
                          </div>
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
            {isAiConfigured && (
              <div style={{ 
                padding: '10px 16px 14px 16px', 
                borderTop: '1px solid ' + colors.border, 
                background: colors.bgContainer,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Input.TextArea
                    placeholder={translate('chatPlaceholder', currentLang)}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
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
                      resize: 'none'
                    }} 
                  />
                  <Button 
                    type="primary"
                    onClick={handleSendChat}
                    loading={chatLoading}
                    disabled={!chatInput.trim()}
                    style={{ 
                      height: 36, 
                      width: 36, 
                      minWidth: 36,
                      borderRadius: 10, 
                      background: '#7c3aed', 
                      border: 'none', 
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
            )}
          </div>
        );

      case 'todos':
        return renderTodosTab();

      default:
        return null;
    }
  };

  const containerStyle: React.CSSProperties = isPopup ? {
    width: '100%',
    height: '100%',
    background: colors.bgBase,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
    color: colors.textMain,
    boxSizing: 'border-box',
    overflow: 'hidden',
    position: 'relative',
  } : {
    width: '100%',
    minHeight: '100vh',
    background: colors.bgBase,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Plus Jakarta Sans", "Inter", sans-serif',
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
          fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
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
      <div style={containerStyle}>
        <GeometricBackground isDark={isDark} variant="compact" />

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
            { id: 'lookup', label: translate('lookUpTab', currentLang), icon: <Search size={13} /> },
            { id: 'aichat', label: translate('aiChatTab', currentLang), icon: <MessageSquare size={13} /> },
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

        {/* Tab Content area */}
        <div style={{ 
          position: 'relative',
          zIndex: 1,
          flex: 1, 
          padding: activeTab === 'aichat' ? '0' : '14px 16px', 
          background: 'transparent', 
          overflowY: activeTab === 'aichat' ? 'hidden' : 'auto',
          display: activeTab === 'aichat' ? 'flex' : 'block',
          flexDirection: 'column'
        }}>
          {renderTabContent()}
        </div>
      </div>
    </ConfigProvider>
  );
};
