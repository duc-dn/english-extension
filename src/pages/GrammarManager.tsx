import React, { useState, useMemo } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, message, Typography, Tooltip, Spin, Popconfirm, Segmented } from 'antd';
import { 
  Plus, 
  Trash2, 
  Sparkles, 
  Search, 
  BookmarkPlus, 
  Check, 
  Volume2, 
  Copy, 
  Pencil, 
  Lightbulb, 
  BookOpen, 
  X,
  LayoutGrid,
  List,
  GraduationCap,
  RefreshCw
} from 'lucide-react';
import { db, type GrammarNote, addGrammarNote, deleteGrammarNote, updateGrammarNote } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { searchGrammarWithAI, type AIGrammarExplanation } from '../lib/translator';
import { playAudio } from '../lib/audio';
import { isDeepSeekProxyActive } from '../lib/deepseekProxy';
import { GrammarStudioModal } from '../components/GrammarStudioModal';
import { seedFoundationalGrammarNotes, FOUNDATIONAL_GRAMMAR_SEEDS } from '../lib/grammarSeedData';
import { 
  GRAMMAR_TOPIC_CATALOG, 
  GRAMMAR_CATEGORIES, 
  type GrammarCategory, 
  type GrammarTopicItem, 
  catalogItemToGrammarNote 
} from '../lib/grammarCatalog';
import { getGrammarMistakeCount, isGrammarReviewDue } from '../lib/grammarPractice';

const { Text } = Typography;

const SUGGESTED_TOPICS = [
  'Câu điều kiện loại 3 (Third Conditional)',
  'Đảo ngữ với No sooner / Hardly',
  'Mệnh đề quan hệ rút gọn (Reduced Relative Clauses)',
  'Phân biệt Used to, Be used to & Get used to',
  'Câu giả định (Subjunctive Mood)',
  'Câu bị động đặc biệt (Passive with reporting verbs)',
  'Phân biệt Few, A few, Little & A little',
  'Cleft Sentences (Câu chẻ nhấn mạnh)'
];

const EMPTY_NOTES: GrammarNote[] = [];
type GrammarSection = 'topics' | 'review' | 'notebook' | 'ai';

export const GrammarManager: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<GrammarNote | null>(null);

  // Grammar Studio Modal state
  const [selectedStudioNote, setSelectedStudioNote] = useState<GrammarNote | null>(null);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioAutoOpenGenerator, setStudioAutoOpenGenerator] = useState(false);
  const [studioReviewMistakesOnly, setStudioReviewMistakesOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [isSeeding, setIsSeeding] = useState(false);
  const [activeSection, setActiveSection] = useState<GrammarSection>('topics');

  // Grammar Topics Catalog state
  const [catalogCategory, setCatalogCategory] = useState<GrammarCategory>('all');
  const [catalogSearch, setCatalogSearch] = useState('');

  const openStudio = (note: GrammarNote, openGenerator: boolean = false, reviewMistakesOnly = false) => {
    setSelectedStudioNote(note);
    setStudioAutoOpenGenerator(openGenerator);
    setStudioReviewMistakesOnly(reviewMistakesOnly);
    setIsStudioOpen(true);
  };


  const handleSeedDefaultNotes = async () => {
    setIsSeeding(true);
    try {
      const added = await seedFoundationalGrammarNotes();
      if (added > 0) {
        message.success(currentLang === 'vi' ? `Đã nạp ${added} cấu trúc nền tảng kèm bài tập thực hành!` : `Loaded ${added} core grammar structures with exercises!`);
        setActiveSection('notebook');
        setTableSearchText('');
        setSelectedTag(null);
      } else {
        message.info(currentLang === 'vi' ? 'Các cấu trúc cốt lõi đã có trong sổ tay của bạn.' : 'Core structures already loaded.');
        setActiveSection('notebook');
        setTableSearchText('');
        setSelectedTag(null);
      }
    } catch {
      message.error('Failed to seed grammar rules');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleOpenSuggestion = async (title: string) => {
    const existing = notes.find(n => n.title.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(n.title.toLowerCase()));
    if (existing) {
      openStudio(existing);
      return;
    }

    const matchingSeed = FOUNDATIONAL_GRAMMAR_SEEDS.find(s => s.title.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(s.title.toLowerCase()));
    if (matchingSeed) {
      const created = await addGrammarNote(matchingSeed);
      message.success(currentLang === 'vi' ? `Đã nạp "${matchingSeed.title}" kèm bài tập thực hành!` : `Loaded "${matchingSeed.title}"!`);
      openStudio(created);
    } else {
      setSearchQuery(title);
      setActiveSection('ai');
      handleAISearch(title);
    }
  };

  const handleSelectCatalogTopic = async (topic: GrammarTopicItem, openGenerator: boolean = false) => {
    const existing = notes.find(n => n.title.toLowerCase().trim() === topic.title.toLowerCase().trim());
    if (existing) {
      openStudio(existing, openGenerator);
      return;
    }

    try {
      const created = await addGrammarNote(catalogItemToGrammarNote(topic));
      message.success(currentLang === 'vi' ? `Đã nạp "${topic.title}" vào sổ tay học tập!` : `Loaded "${topic.title}"!`);
      openStudio(created, openGenerator);
    } catch {
      const pseudo: GrammarNote = {
        id: crypto.randomUUID(),
        ...catalogItemToGrammarNote(topic),
        review_level: 0,
        next_review: new Date(),
        created_at: new Date()
      };
      openStudio(pseudo, openGenerator);
    }
  };

  const [form] = Form.useForm();
  const [editForm] = Form.useForm();


  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // Live queries from Dexie
  const notes = useLiveQuery(() => db.grammar_notes.toArray()) ?? EMPTY_NOTES;
  const dueNotes = notes.filter(note => isGrammarReviewDue(note));
  const mistakeNotes = notes.filter(note => getGrammarMistakeCount(note) > 0);

  // Table search & filter state
  const [tableSearchText, setTableSearchText] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // AI Grammar Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiResult, setAiResult] = useState<AIGrammarExplanation | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [savedAiTitles, setSavedAiTitles] = useState<Set<string>>(new Set());

  // Check if AI or DeepSeek proxy is active
  const isProxyOn = isDeepSeekProxyActive(settings);
  const hasAI = settings.ai_provider && settings.ai_provider !== 'none';

  // Filter notes in table
  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      const matchSearch = !tableSearchText.trim() ||
        n.title.toLowerCase().includes(tableSearchText.toLowerCase()) ||
        n.content.toLowerCase().includes(tableSearchText.toLowerCase()) ||
        (n.example && n.example.toLowerCase().includes(tableSearchText.toLowerCase()));
      const matchTag = !selectedTag || (n.tags || []).includes(selectedTag);
      const matchReview = activeSection !== 'review' || isGrammarReviewDue(n) || getGrammarMistakeCount(n) > 0;
      return matchSearch && matchTag && matchReview;
    });
  }, [notes, tableSearchText, selectedTag, activeSection]);

  // All unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => (n.tags || []).forEach(t => set.add(t)));
    return Array.from(set);
  }, [notes]);

  // Filter grammar topic catalog
  const filteredCatalogTopics = useMemo(() => {
    return GRAMMAR_TOPIC_CATALOG.filter(item => {
      const matchCat = catalogCategory === 'all' || item.category === catalogCategory;
      const query = catalogSearch.toLowerCase().trim();
      const matchSearch = !query || 
        item.title.toLowerCase().includes(query) ||
        item.formula.toLowerCase().includes(query) ||
        item.explanation.toLowerCase().includes(query) ||
        item.tags.some(t => t.toLowerCase().includes(query));
      return matchCat && matchSearch;
    });
  }, [catalogCategory, catalogSearch]);


  // Execute AI Grammar Search
  const handleAISearch = async (queryToSearch?: string) => {
    const q = (queryToSearch || searchQuery).trim();
    if (!q) {
      message.warning(currentLang === 'vi' ? 'Vui lòng nhập tên hoặc chủ đề ngữ pháp cần tra cứu.' : 'Please enter a grammar topic to search.');
      return;
    }

    if (!hasAI && !isProxyOn) {
      message.warning(
        currentLang === 'vi'
          ? 'Chưa bật AI Provider hoặc DeepSeek Local Proxy. Hãy bật công tắc proxy ở thanh công cụ phía trên.'
          : 'AI Provider is disabled. Please toggle on DeepSeek Local Proxy on the top bar.'
      );
      return;
    }

    setIsSearchingAI(true);
    try {
      const result = await searchGrammarWithAI(q);
      setAiResult(result);
      setSearchQuery(q);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (currentLang === 'vi' ? 'Lỗi khi tra cứu ngữ pháp bằng AI' : 'AI Grammar search failed');
      message.error(msg);
    } finally {
      setIsSearchingAI(false);
    }
  };

  // 1-Click Save AI Result to Extension
  const handleSaveAIResult = async (item: AIGrammarExplanation) => {
    try {
      const formattedContent = `[${translate('aiGrammarFormulaLabel', currentLang)}]: ${item.formula}\n\n[${translate('aiGrammarExplainLabel', currentLang)}]: ${item.explanation}${item.notes ? `\n\n[${translate('aiGrammarNotesLabel', currentLang)}]: ${item.notes}` : ''}`;
      
      const formattedExamples = item.examples.map(ex => {
        return ex.vietnamese ? `${ex.english}\n(${ex.vietnamese})` : ex.english;
      }).join('\n\n');

      const saved = await addGrammarNote({
        title: item.title,
        content: formattedContent,
        example: formattedExamples,
        tags: item.tags || ['ai-grammar'],
        formula: item.formula,
        explanation: item.explanation,
        notes: item.notes,
        examplesList: item.examples,
        exercises: item.exercises
      });

      setSavedAiTitles(prev => new Set(prev).add(item.title));
      message.success(translate('aiGrammarSaveSuccess', currentLang));
      return saved;
    } catch {
      message.error(currentLang === 'vi' ? 'Không thể lưu cấu trúc vào sổ tay.' : 'Failed to save grammar note.');
    }
  };

  // Pre-fill form from AI result for customized save
  const handleEditAndSaveAIResult = (item: AIGrammarExplanation) => {
    const formattedContent = `[Công thức]: ${item.formula}\n\n[Cách dùng]: ${item.explanation}${item.notes ? `\n\n[Lưu ý]: ${item.notes}` : ''}`;
    const formattedExamples = item.examples.map(ex => ex.vietnamese ? `${ex.english}\n(${ex.vietnamese})` : ex.english).join('\n\n');

    form.setFieldsValue({
      title: item.title,
      content: formattedContent,
      example: formattedExamples,
      tags: (item.tags || []).join(', ')
    });
    setIsModalOpen(true);
  };

  // AI Auto-Fill in Manual Modal
  const handleAutoFillModal = async () => {
    const title = form.getFieldValue('title');
    if (!title || !title.trim()) {
      message.warning(currentLang === 'vi' ? 'Vui lòng nhập tên cấu trúc trước khi bấm AI tự động điền.' : 'Please enter structure title first.');
      return;
    }
    setIsAutoFilling(true);
    try {
      const result = await searchGrammarWithAI(title.trim());
      const formattedContent = `[Công thức]: ${result.formula}\n\n[Cách dùng]: ${result.explanation}${result.notes ? `\n\n[Lưu ý]: ${result.notes}` : ''}`;
      const formattedExamples = result.examples.map(ex => ex.vietnamese ? `${ex.english}\n(${ex.vietnamese})` : ex.english).join('\n\n');

      form.setFieldsValue({
        title: result.title || title,
        content: formattedContent,
        example: formattedExamples,
        tags: (result.tags || []).join(', ')
      });
      message.success(translate('aiGrammarAutoFillSuccess', currentLang));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : (currentLang === 'vi' ? 'AI không thể tự động điền' : 'AI Auto-Fill failed');
      message.error(msg);
    } finally {
      setIsAutoFilling(false);
    }
  };

  // Add Manual Note
  const handleAddNote = async (values: { title: string; content: string; example: string; tags: string }) => {
    try {
      const tagList = values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      await addGrammarNote({
        title: values.title,
        content: values.content,
        example: values.example || '',
        tags: tagList
      });
      message.success(translate('addNoteSuccess', currentLang));
      setIsModalOpen(false);
      setActiveSection('notebook');
      setTableSearchText('');
      setSelectedTag(null);
      form.resetFields();
    } catch {
      message.error(translate('addNoteFailed', currentLang));
    }
  };

  // Edit Note
  const handleEditNote = async (values: { title: string; content: string; example: string; tags: string }) => {
    if (!editingNote) return;
    try {
      const tagList = values.tags ? values.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      await updateGrammarNote(editingNote.id, {
        title: values.title,
        content: values.content,
        example: values.example || '',
        tags: tagList
      });
      message.success(currentLang === 'vi' ? 'Cập nhật cấu trúc ngữ pháp thành công!' : 'Grammar note updated successfully!');
      setIsEditModalOpen(false);
      setEditingNote(null);
      editForm.resetFields();
    } catch {
      message.error(currentLang === 'vi' ? 'Cập nhật thất bại.' : 'Update failed.');
    }
  };

  const openEditModal = (note: GrammarNote) => {
    setEditingNote(note);
    editForm.setFieldsValue({
      title: note.title,
      content: note.content,
      example: note.example,
      tags: (note.tags || []).join(', ')
    });
    setIsEditModalOpen(true);
  };

  // Delete Note
  const handleDelete = async (id: string) => {
    try {
      await deleteGrammarNote(id);
      message.success(translate('deleteNoteSuccess', currentLang));
    } catch {
      message.error(translate('deleteNoteFailed', currentLang));
    }
  };

  // Copy text helper
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success(currentLang === 'vi' ? 'Đã sao chép công thức!' : 'Formula copied!');
  };

  const isSavedInDB = (title: string) => {
    return savedAiTitles.has(title) || notes.some(n => n.title.toLowerCase() === title.toLowerCase());
  };

  // Columns for the table
  const columns = [
    {
      title: translate('tableStructure', currentLang),
      dataIndex: 'title',
      key: 'title',
      width: '24%',
      render: (text: string, record: GrammarNote) => (
        <div 
          onClick={() => openStudio(record, false, activeSection === 'review')}
          style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <strong style={{ color: isDark ? '#38bdf8' : '#0284c7', fontSize: 15 }}>{text}</strong>
        </div>
      ),
    },
    {
      title: translate('tableNote', currentLang),
      dataIndex: 'content',
      key: 'content',
      width: '32%',
      render: (text: string) => (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: isDark ? '#cbd5e1' : '#334155', maxHeight: 150, overflowY: 'auto' }}>
          {text}
        </div>
      )
    },
    {
      title: translate('tableExampleGrammar', currentLang),
      dataIndex: 'example',
      key: 'example',
      width: '24%',
      render: (text: string) => (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ fontStyle: 'italic', color: isDark ? '#94a3b8' : '#64748b', fontSize: 13, whiteSpace: 'pre-wrap', flex: 1 }}>
            {text || '—'}
          </div>
          {text && (
            <Button
              type="text"
              size="small"
              icon={<Volume2 size={13} color="#8b5cf6" />}
              onClick={() => playAudio(text.split('\n')[0])}
              style={{ padding: 2 }}
            />
          )}
        </div>
      )
    },
    {
      title: translate('tableTagsGrammar', currentLang),
      dataIndex: 'tags',
      key: 'tags',
      width: '10%',
      render: (tags: string[]) => (
        <>
          {(tags || []).map(tag => (
            <Tag 
              color="magenta" 
              key={tag} 
              style={{ cursor: 'pointer', marginBottom: 4 }}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            >
              #{tag}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: translate('tableActionsGrammar', currentLang),
      key: 'action',
      width: '10%',
      render: (_: unknown, record: GrammarNote) => (
        <Space size="small">
          <Button
            type="primary"
            size="small"
            icon={<GraduationCap size={13} />}
            onClick={() => openStudio(record, false, activeSection === 'review')}
            style={{ borderRadius: 6, fontWeight: 600, fontSize: 11, height: 26, background: '#0284c7' }}
          >
            {translate('grammarPracticeNow', currentLang)}
          </Button>
          <Button 
            type="text" 
            size="small"
            icon={<Pencil size={14} color="#6366f1" />} 
            onClick={() => openEditModal(record)} 
          />
          <Popconfirm
            title={currentLang === 'vi' ? 'Xác nhận xóa cấu trúc này?' : 'Delete this grammar rule?'}
            onConfirm={() => handleDelete(record.id)}
            okText={currentLang === 'vi' ? 'Xóa' : 'Delete'}
            cancelText={currentLang === 'vi' ? 'Hủy' : 'Cancel'}
            okButtonProps={{ danger: true }}
          >
            <Button type="text" danger size="small" icon={<Trash2 size={14} />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.4s ease' }}>
      {/* Page Title & Add Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '24px', display: 'flex', alignItems: 'center', gap: 10, color: isDark ? '#f8fafc' : '#0f172a' }}>
            <BookOpen size={24} color="#f43f5e" />
            {translate('grammarTitle', currentLang)}
            <Tag color="#f43f5e" style={{ borderRadius: 12, fontWeight: 700, marginLeft: 4 }}>
              {notes.length} {currentLang === 'vi' ? 'cấu trúc' : 'rules'}
            </Tag>
          </h2>
          <p style={{ margin: '6px 0 0 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: 14 }}>
            {translate('grammarDesc', currentLang)}
          </p>
        </div>
        <Space wrap>
          <Button 
            icon={<Sparkles size={14} color="#8b5cf6" />} 
            onClick={handleSeedDefaultNotes}
            loading={isSeeding}
            style={{ borderRadius: 8, fontWeight: 600, height: 32 }}
          >
            {currentLang === 'vi' ? 'Nạp cấu trúc mẫu & bài tập ✨' : 'Load Core Rules & Exercises ✨'}
          </Button>
          <Button 
            type="primary" 
            style={{ 
              height: 32, 
              padding: '0 14px', 
              borderRadius: 8, 
              fontSize: 13, 
              fontWeight: 600, 
              background: '#4f46e5', 
              border: 'none', 
              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: 5 
            }} 
            icon={<Plus size={14} />} 
            onClick={() => setIsModalOpen(true)}
          >
            {translate('addGrammarTitle', currentLang)}
          </Button>
        </Space>
      </div>

      <nav className="grammar-section-nav" role="tablist" aria-label={currentLang === 'vi' ? 'Các mục ngữ pháp' : 'Grammar sections'}>
        {([
          { key: 'topics', icon: <BookOpen size={18} />, vi: 'Học chủ đề', en: 'Topics', detailVi: `${GRAMMAR_TOPIC_CATALOG.length} bài học`, detailEn: `${GRAMMAR_TOPIC_CATALOG.length} lessons` },
          { key: 'review', icon: <RefreshCw size={18} />, vi: 'Ôn tập', en: 'Review', detailVi: `${new Set([...dueNotes, ...mistakeNotes].map(note => note.id)).size} cần ôn`, detailEn: `${new Set([...dueNotes, ...mistakeNotes].map(note => note.id)).size} to review` },
          { key: 'notebook', icon: <BookmarkPlus size={18} />, vi: 'Sổ tay', en: 'Notebook', detailVi: `${notes.length} đã lưu`, detailEn: `${notes.length} saved` },
          { key: 'ai', icon: <Sparkles size={18} />, vi: 'Tra cứu AI', en: 'AI search', detailVi: 'Hỏi về cấu trúc', detailEn: 'Ask about a rule' }
        ] as const).map(section => {
          const selected = activeSection === section.key;
          return (
            <button
              key={section.key}
              type="button"
              role="tab"
              id={`grammar-tab-${section.key}`}
              aria-controls={`grammar-panel-${section.key}`}
              aria-selected={selected}
              className="grammar-section-tab"
              onClick={() => {
                setActiveSection(section.key);
                if (section.key === 'review' || section.key === 'notebook') {
                  setTableSearchText('');
                  setSelectedTag(null);
                }
              }}
              style={{
                background: selected ? (isDark ? '#312e81' : '#eef2ff') : (isDark ? '#1e293b' : '#fff'),
                borderColor: selected ? '#6366f1' : (isDark ? '#334155' : '#e2e8f0'),
                color: selected ? (isDark ? '#e0e7ff' : '#312e81') : (isDark ? '#e2e8f0' : '#334155')
              }}
            >
              <span className="grammar-section-tab-icon">{section.icon}</span>
              <span>
                <strong>{currentLang === 'vi' ? section.vi : section.en}</strong>
                <small>{currentLang === 'vi' ? section.detailVi : section.detailEn}</small>
              </span>
            </button>
          );
        })}
      </nav>

      {activeSection === 'review' && (
        <div>
        <div className="bento-card" style={{ padding: '16px 20px', marginBottom: 20, border: isDark ? '1px solid #334155' : '1px solid #c7d2fe', background: isDark ? '#1e293b' : '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: isDark ? '#e0e7ff' : '#312e81' }}>
              <GraduationCap size={18} />
              {currentLang === 'vi' ? 'Ôn tập hôm nay' : "Today's review"}
            </div>
            <div style={{ color: isDark ? '#cbd5e1' : '#475569', fontSize: 13, marginTop: 4 }}>
              {currentLang === 'vi'
                ? `${dueNotes.length} chủ đề đến hạn · ${mistakeNotes.length} chủ đề có câu sai`
                : `${dueNotes.length} topics due · ${mistakeNotes.length} topics with mistakes`}
            </div>
          </div>
          <Space wrap>
            {(mistakeNotes[0] || dueNotes[0]) && (
              <Button type="primary" icon={<RefreshCw size={15} />} onClick={() => {
                const target = mistakeNotes[0] || dueNotes[0];
                openStudio(target, false, true);
              }}>
                {currentLang === 'vi' ? 'Bắt đầu ôn tập' : 'Start review'}
              </Button>
            )}
          </Space>
        </div>
        </div>
      )}

      {/* AI Grammar Search Hero Box */}
      {activeSection === 'ai' && (
      <section role="tabpanel" id="grammar-panel-ai" aria-labelledby="grammar-tab-ai">
      <div
        className="bento-card"
        style={{
          marginBottom: 24,
          padding: 22,
          border: isDark ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid rgba(79, 70, 229, 0.15)',
          background: isDark 
            ? 'linear-gradient(135deg, rgba(79, 70, 229, 0.14) 0%, rgba(139, 92, 246, 0.08) 100%)' 
            : 'linear-gradient(135deg, rgba(79, 70, 229, 0.04) 0%, rgba(255, 255, 255, 0.95) 100%)',
          boxShadow: isDark ? '0 4px 20px rgba(0, 0, 0, 0.3)' : '0 4px 18px rgba(15, 23, 42, 0.05)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ 
              background: '#4f46e5', 
              color: '#fff', 
              padding: '4px 8px', 
              borderRadius: 8, 
              display: 'flex', 
              alignItems: 'center', 
              gap: 4, 
              fontSize: 12, 
              fontWeight: 700 
            }}>
              <Sparkles size={14} /> {currentLang === 'vi' ? 'Tra cứu AI' : 'AI Assistant'}
            </span>
            <span style={{ fontWeight: 700, fontSize: 16, color: isDark ? '#f8fafc' : '#1e293b' }}>
              {translate('aiGrammarSearchTitle', currentLang)}
            </span>
          </div>
          {isProxyOn && (
            <Tag color="cyan" style={{ borderRadius: 10, fontWeight: 600 }}>
              ⚡ DeepSeek Local Proxy Active
            </Tag>
          )}
        </div>

        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 14 }}>
          {translate('aiGrammarSearchDesc', currentLang)}
        </Text>

        {/* Search Input */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <Input
            size="large"
            prefix={<Search size={18} color="#94a3b8" style={{ marginRight: 6 }} />}
            placeholder={translate('aiGrammarSearchPlaceholder', currentLang)}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={() => handleAISearch()}
            allowClear
            style={{ borderRadius: 10, fontSize: 14, flex: '1 1 220px', minWidth: 0 }}
          />
          <Button
            type="primary"
            loading={isSearchingAI}
            icon={<Sparkles size={14} />}
            onClick={() => handleAISearch()}
            style={{
              height: 38,
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              background: '#4f46e5',
              border: 'none',
              boxShadow: '0 2px 6px rgba(79, 70, 229, 0.25)',
              padding: '0 16px'
            }}
          >
            {translate('aiGrammarAnalyzeBtn', currentLang)}
          </Button>
        </div>

        {/* Suggested Topic Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600, marginRight: 2 }}>
            <Lightbulb size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
            {currentLang === 'vi' ? 'Chủ đề gợi ý:' : 'Suggested topics:'}
          </span>
          {SUGGESTED_TOPICS.map((topic) => (
            <Tag
              key={topic}
              onClick={() => {
                setSearchQuery(topic);
                handleAISearch(topic);
              }}
              style={{
                cursor: 'pointer',
                borderRadius: 12,
                padding: '2px 10px',
                fontSize: 12,
                background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.8)',
                border: isDark ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(139, 92, 246, 0.2)',
                color: isDark ? '#c7d2fe' : '#6366f1',
                transition: 'all 0.2s ease',
              }}
              className="hover:border-purple-500"
            >
              {topic}
            </Tag>
          ))}
        </div>

        {/* AI Searching Loading State */}
        {isSearchingAI && (
          <div style={{ marginTop: 20, padding: 24, textAlign: 'center', background: isDark ? 'rgba(17, 24, 39, 0.7)' : 'rgba(255, 255, 255, 0.7)', borderRadius: 12, border: isDark ? '1px dashed rgba(139, 92, 246, 0.4)' : '1px dashed rgba(139, 92, 246, 0.3)' }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, fontWeight: 600, color: '#6366f1', fontSize: 14 }}>
              {translate('aiGrammarAnalyzing', currentLang)}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
              {currentLang === 'vi' ? 'Đang trích xuất công thức chuẩn, giải thích bản chất ngữ pháp và ví dụ thực tế...' : 'Extracting grammar formula, explanations, and real-life examples...'}
            </div>
          </div>
        )}

        {/* AI Search Result Card */}
        {aiResult && !isSearchingAI && (
          <div 
            style={{ 
              marginTop: 20, 
              padding: 20, 
              background: isDark ? '#111827' : '#ffffff', 
              borderRadius: 14, 
              border: isDark ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(139, 92, 246, 0.25)', 
              boxShadow: isDark ? '0 8px 24px rgba(0, 0, 0, 0.4)' : '0 8px 24px rgba(139, 92, 246, 0.08)',
              animation: 'fadeIn 0.3s ease'
            }}
          >
            {/* Header of Result */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16, borderBottom: isDark ? '1px solid #1f2937' : '1px solid #f1f5f9', paddingBottom: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontWeight: 800, fontSize: 18, color: isDark ? '#f8fafc' : '#0f172a' }}>
                    {aiResult.title}
                  </h3>
                  {(aiResult.tags || []).map(tag => (
                    <Tag color="magenta" key={tag} style={{ borderRadius: 10, fontSize: 11 }}>
                      #{tag}
                    </Tag>
                  ))}
                </div>
              </div>

              {/* Action Buttons: 1-Click Save & Practice */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Button
                  type="primary"
                  icon={<GraduationCap size={15} />}
                  onClick={async () => {
                    const pseudoNote: GrammarNote = {
                      id: crypto.randomUUID(),
                      title: aiResult.title,
                      formula: aiResult.formula,
                      explanation: aiResult.explanation,
                      notes: aiResult.notes,
                      example: aiResult.examples.map(ex => ex.vietnamese ? `${ex.english}\n(${ex.vietnamese})` : ex.english).join('\n\n'),
                      examplesList: aiResult.examples,
                      tags: aiResult.tags || ['ai-grammar'],
                      content: `[Công thức]: ${aiResult.formula}\n\n[Cách dùng]: ${aiResult.explanation}`,
                      exercises: aiResult.exercises,
                      review_level: 0,
                      next_review: new Date(),
                      created_at: new Date()
                    };
                    const existing = notes.find(note => note.title.toLowerCase() === aiResult.title.toLowerCase())
                      || await db.grammar_notes.where('title').equals(aiResult.title).first();
                    const saved = existing || await handleSaveAIResult(aiResult);
                    openStudio(saved || pseudoNote);
                  }}
                  style={{
                    borderRadius: 8,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    border: 'none',
                    boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                  }}
                >
                  {translate('grammarPracticeNow', currentLang)} 🎯
                </Button>

                {isSavedInDB(aiResult.title) ? (
                  <Button
                    type="default"
                    icon={<Check size={14} color="#16a34a" />}
                    style={{ borderRadius: 8, borderColor: '#86efac', color: '#16a34a', fontWeight: 600 }}
                    disabled
                  >
                    {translate('aiGrammarSavedTag', currentLang)}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<BookmarkPlus size={15} />}
                    onClick={() => handleSaveAIResult(aiResult)}
                    style={{
                      borderRadius: 8,
                      fontWeight: 600,
                      background: '#059669',
                      border: 'none',
                      boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    {translate('aiGrammarSaveBtn', currentLang)}
                  </Button>
                )}

                <Button
                  icon={<Pencil size={14} />}
                  onClick={() => handleEditAndSaveAIResult(aiResult)}
                  style={{ borderRadius: 8, fontWeight: 600 }}
                >
                  {translate('aiGrammarEditSaveBtn', currentLang)}
                </Button>

                <Button
                  type="text"
                  icon={<X size={16} />}
                  onClick={() => setAiResult(null)}
                  style={{ borderRadius: 8 }}
                />
              </div>
            </div>

            {/* Formula Block */}
            {aiResult.formula && (
              <div style={{ 
                background: isDark ? '#1e293b' : '#f8fafc', 
                border: isDark ? '1px solid #334155' : '1px solid #e2e8f0', 
                borderRadius: 10, 
                padding: '12px 16px', 
                marginBottom: 14,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3px', color: '#818cf8', display: 'block', marginBottom: 2 }}>
                    {translate('aiGrammarFormulaLabel', currentLang)}
                  </span>
                  <code style={{ fontSize: 14, fontWeight: 700, color: isDark ? '#e0e7ff' : '#1e1b4b', fontFamily: 'monospace' }}>
                    {aiResult.formula}
                  </code>
                </div>
                <Tooltip title={currentLang === 'vi' ? 'Sao chép công thức' : 'Copy formula'}>
                  <Button
                    type="text"
                    size="small"
                    icon={<Copy size={14} color="#6366f1" />}
                    onClick={() => handleCopy(aiResult.formula)}
                  />
                </Tooltip>
              </div>
            )}

            {/* Explanation Block */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#cbd5e1' : '#334155', display: 'block', marginBottom: 4 }}>
                {translate('aiGrammarExplainLabel', currentLang)}
              </span>
              <p style={{ margin: 0, fontSize: 14, lineHeight: '1.6', color: isDark ? '#f1f5f9' : '#1e293b', whiteSpace: 'pre-wrap' }}>
                {aiResult.explanation}
              </p>
            </div>

            {/* Examples Block */}
            {aiResult.examples && aiResult.examples.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#cbd5e1' : '#334155', display: 'block', marginBottom: 6 }}>
                  {translate('aiGrammarExamplesLabel', currentLang)}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {aiResult.examples.map((ex, idx) => (
                    <div 
                      key={idx}
                      style={{ 
                        background: isDark ? '#1e293b' : '#f8fafc', 
                        padding: '10px 14px', 
                        borderRadius: 8, 
                        borderLeft: '3px solid #8b5cf6',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a', fontSize: 13 }}>
                          {ex.english}
                        </div>
                        {ex.vietnamese && (
                          <div style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 12, marginTop: 2 }}>
                            {ex.vietnamese}
                          </div>
                        )}
                      </div>
                      <Button
                        type="text"
                        size="small"
                        icon={<Volume2 size={14} color="#8b5cf6" />}
                        onClick={() => playAudio(ex.english)}
                        style={{ padding: 2 }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes / Special Variations Block */}
            {aiResult.notes && (
              <div style={{ 
                background: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb', 
                border: isDark ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid #fef3c7', 
                borderRadius: 8, 
                padding: '10px 14px', 
                fontSize: 13, 
                color: isDark ? '#fde68a' : '#92400e',
                lineHeight: '1.5'
              }}>
                <span style={{ fontWeight: 700, display: 'block', marginBottom: 2 }}>
                  💡 {translate('aiGrammarNotesLabel', currentLang)}
                </span>
                {aiResult.notes}
              </div>
            )}
          </div>
        )}
      </div>
      </section>
      )}

      {/* Filter and Table / Bento Cards of Saved Grammar */}
      {(activeSection === 'review' || activeSection === 'notebook') && (
      <section role="tabpanel" id={`grammar-panel-${activeSection}`} aria-labelledby={`grammar-tab-${activeSection}`}>
      <div className="bento-card" style={{ padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {activeSection === 'review'
              ? (currentLang === 'vi' ? 'Chủ đề cần ôn' : 'Topics to review')
              : (currentLang === 'vi' ? 'Sổ tay ngữ pháp' : 'Grammar notebook')}
          </h3>
          <p style={{ margin: '4px 0 0', color: isDark ? '#94a3b8' : '#64748b', fontSize: 13 }}>
            {activeSection === 'review'
              ? (currentLang === 'vi' ? 'Luyện lại câu đã sai và các chủ đề đến hạn.' : 'Retry mistakes and topics that are due.')
              : (currentLang === 'vi' ? 'Tìm, sửa và luyện lại những cấu trúc đã lưu.' : 'Find, edit and practice saved grammar rules.')}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <Input
              prefix={<Search size={15} color="#94a3b8" />}
              placeholder={translate('aiGrammarFilterPlaceholder', currentLang)}
              value={tableSearchText}
              onChange={(e) => setTableSearchText(e.target.value)}
              allowClear
              style={{ maxWidth: 320, borderRadius: 8 }}
            />
            {selectedTag && (
              <Tag 
                closable 
                onClose={() => setSelectedTag(null)} 
                color="magenta" 
                style={{ borderRadius: 10, fontWeight: 600 }}
              >
                #{selectedTag}
              </Tag>
            )}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {allTags.slice(0, 5).map(tag => (
                <Tag
                  key={tag}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  color={selectedTag === tag ? 'magenta' : undefined}
                  style={{ cursor: 'pointer', borderRadius: 10, fontSize: 11 }}
                >
                  #{tag}
                </Tag>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Segmented
              value={viewMode}
              onChange={(val) => setViewMode(val as 'cards' | 'table')}
              options={[
                { value: 'cards', icon: <LayoutGrid size={13} />, label: translate('grammarViewCards', currentLang) },
                { value: 'table', icon: <List size={13} />, label: translate('grammarViewTable', currentLang) }
              ]}
              style={{ background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#f1f5f9' }}
            />
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {currentLang === 'vi' 
                ? `${filteredNotes.length} / ${notes.length} cấu trúc` 
                : `${filteredNotes.length} / ${notes.length} rules`}
            </div>
          </div>
        </div>

        {filteredNotes.length === 0 && notes.length > 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: isDark ? '#cbd5e1' : '#475569' }}>
            <p style={{ margin: '0 0 12px' }}>
              {activeSection === 'review'
                ? (currentLang === 'vi' ? 'Hiện chưa có chủ đề nào cần ôn.' : 'No topics need review right now.')
                : (currentLang === 'vi' ? 'Không tìm thấy chủ đề phù hợp.' : 'No matching topics found.')}
            </p>
            <Button onClick={() => { setActiveSection('notebook'); setTableSearchText(''); setSelectedTag(null); }}>
              {currentLang === 'vi' ? 'Mở sổ tay' : 'Open notebook'}
            </Button>
          </div>
        ) : filteredNotes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px' }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: isDark ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 63, 94, 0.08)',
              color: '#f43f5e',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              boxShadow: '0 4px 12px rgba(244, 63, 94, 0.15)'
            }}>
              <BookOpen size={26} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', marginBottom: 6 }}>
              {currentLang === 'vi' ? 'Chưa có cấu trúc ngữ pháp nào được lưu' : 'No grammar rules saved yet'}
            </div>
            <p style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 13.5, maxWidth: 460, margin: '0 auto 16px auto', lineHeight: 1.5 }}>
              {currentLang === 'vi' 
                ? 'Sử dụng ô Tra cứu AI ở trên hoặc bấm nạp nhanh 4 cấu trúc nền tảng kèm bài tập thực hành dưới đây:'
                : 'Use the AI search box above or load the 4 foundational grammar rules with exercises below:'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <Button
                type="primary"
                size="large"
                icon={<Sparkles size={16} />}
                onClick={handleSeedDefaultNotes}
                loading={isSeeding}
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  borderRadius: 12,
                  height: 44,
                  fontWeight: 700,
                  padding: '0 24px',
                  boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)'
                }}
              >
                {currentLang === 'vi' ? 'Nạp ngay 4 cấu trúc nền tảng kèm bài tập thực hành ✨' : 'Load 4 Core Rules with Exercises ✨'}
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, maxWidth: 880, margin: '0 auto' }}>
              {[
                { title: 'Câu điều kiện loại 3 (Third Conditional)', desc: 'If + S + had PII, S + would have PII', tag: 'Conditionals' },
                { title: 'Đảo ngữ No sooner / Hardly', desc: 'No sooner had + S + PII than S + Ved', tag: 'Inversion' },
                { title: 'Mệnh đề quan hệ rút gọn', desc: 'V-ing / PII / To-V reduction', tag: 'Clauses' },
                { title: 'Câu chẻ Cleft Sentences', desc: 'It is/was + X + that/who...', tag: 'Emphasis' }
              ].map(item => (
                <div
                  key={item.title}
                  onClick={() => handleOpenSuggestion(item.title)}
                  className="bento-card-interactive hover-lift"
                  style={{
                    padding: '16px 18px',
                    borderRadius: 14,
                    border: isDark ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid #e2e8f0',
                    background: isDark ? 'rgba(30, 41, 59, 0.6)' : 'rgba(248, 250, 252, 0.8)',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13.5, color: isDark ? '#f8fafc' : '#0f172a' }}>{item.title}</strong>
                    <Tag color="magenta" style={{ margin: 0, fontSize: 10, borderRadius: 6, fontWeight: 700 }}>#{item.tag}</Tag>
                  </div>
                  <div style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'monospace', marginBottom: 8 }}>
                    {item.desc}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#6366f1', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <GraduationCap size={13} />
                    {currentLang === 'vi' ? 'Học & Luyện tập ngay ➔' : 'Practice Now ➔'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === 'cards' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
            {filteredNotes.map(n => {
              const exercisesCount = (n.exercises?.multipleChoice?.length || 0) + (n.exercises?.translation?.length || 0);
              const formulaSnippet = n.formula || (n.content.match(/\[(?:Công thức|Formula)\]:\s*([^\n]+)/i)?.[1]) || '';
              const explainSnippet = n.explanation || n.content.replace(/\[[^\]]+\]:[^\n]+/g, '').trim().slice(0, 120);

              return (
                <div
                  key={n.id}
                  className="bento-card-interactive hover-lift"
                  style={{
                    padding: '20px 22px',
                    borderRadius: 16,
                    background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#ffffff',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.25)' : '0 4px 14px rgba(0,0,0,0.03)',
                    transition: 'all 0.25s ease'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      <h3 
                        onClick={() => openStudio(n, false, activeSection === 'review')}
                        style={{ 
                          margin: 0, 
                          fontSize: 16, 
                          fontWeight: 800, 
                          color: isDark ? '#f8fafc' : '#0f172a',
                          cursor: 'pointer',
                          lineHeight: 1.3
                        }}
                      >
                        {n.title}
                      </h3>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {(n.tags || []).slice(0, 2).map(tag => (
                          <Tag color="magenta" key={tag} style={{ margin: 0, fontSize: 10, borderRadius: 6, fontWeight: 700 }}>
                            #{tag}
                          </Tag>
                        ))}
                      </div>
                    </div>

                    {formulaSnippet ? (
                      <div style={{
                        background: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(241, 245, 249, 0.8)',
                        borderRadius: 8,
                        padding: '8px 12px',
                        marginBottom: 12,
                        borderLeft: '3px solid #6366f1',
                        fontSize: 12.5,
                        fontFamily: 'monospace',
                        fontWeight: 600,
                        color: isDark ? '#c7d2fe' : '#3730a3',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {formulaSnippet}
                      </div>
                    ) : null}

                    <div style={{
                      fontSize: 13,
                      lineHeight: '1.5',
                      color: isDark ? '#94a3b8' : '#64748b',
                      marginBottom: 14,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {explainSnippet || n.content}
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                      {getGrammarMistakeCount(n) > 0 && (
                        <Tag color="orange" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <RefreshCw size={11} />
                          {getGrammarMistakeCount(n)} {currentLang === 'vi' ? 'câu cần ôn' : 'to retry'}
                        </Tag>
                      )}
                      {isGrammarReviewDue(n) && (
                        <Tag color="blue" style={{ margin: 0 }}>{currentLang === 'vi' ? 'Đến hạn ôn' : 'Review due'}</Tag>
                      )}
                      {exercisesCount > 0 ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(99, 102, 241, 0.12)',
                          color: '#818cf8',
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          <Sparkles size={11} />
                          {exercisesCount} {currentLang === 'vi' ? 'bài tập' : 'exercises'}
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9',
                          color: isDark ? '#94a3b8' : '#64748b',
                          fontSize: 11,
                          fontWeight: 600
                        }}>
                          {currentLang === 'vi' ? 'AI sẵn sàng tạo bài tập' : 'AI ready'}
                        </span>
                      )}

                      {n.example && (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(16, 185, 129, 0.12)',
                          color: '#10b981',
                          fontSize: 11,
                          fontWeight: 700
                        }}>
                          <Volume2 size={11} />
                          {currentLang === 'vi' ? 'Ví dụ âm thanh' : 'Audio examples'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: 12,
                    borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9'
                  }}>
                    <Button
                      type="primary"
                      size="small"
                      icon={<GraduationCap size={14} />}
                      onClick={() => openStudio(n, false, activeSection === 'review')}
                      style={{
                        borderRadius: 8,
                        fontWeight: 700,
                        height: 32,
                        padding: '0 14px',
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                      }}
                    >
                      {translate('grammarPracticeNow', currentLang)}
                    </Button>

                    <Space size={4}>
                      <Button 
                        type="text" 
                        size="small"
                        icon={<Pencil size={14} color="#6366f1" />} 
                        onClick={() => openEditModal(n)} 
                      />
                      <Popconfirm
                        title={currentLang === 'vi' ? 'Xác nhận xóa cấu trúc này?' : 'Delete this grammar rule?'}
                        onConfirm={() => handleDelete(n.id)}
                        okText={currentLang === 'vi' ? 'Xóa' : 'Delete'}
                        cancelText={currentLang === 'vi' ? 'Hủy' : 'Cancel'}
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" danger size="small" icon={<Trash2 size={14} />} />
                      </Popconfirm>
                    </Space>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Table 
            dataSource={filteredNotes} 
            columns={columns} 
            rowKey="id" 
            pagination={{ pageSize: 8, showSizeChanger: false }}
            style={{ background: 'transparent' }}
          />
        )}
      </div>
      </section>
      )}

      {/* 📚 Core Grammar Topics Library Section */}
      {activeSection === 'topics' && (
      <section role="tabpanel" id="grammar-panel-topics" aria-labelledby="grammar-tab-topics">
      <div 
        className="bento-card" 
        style={{ 
          marginTop: 0, 
          padding: '24px 26px',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
          background: isDark 
            ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)' 
            : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
          boxShadow: isDark ? '0 8px 30px rgba(0,0,0,0.3)' : '0 6px 24px rgba(15, 23, 42, 0.05)'
        }}
      >
        {/* Section Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
              }}>
                <GraduationCap size={20} />
              </div>
              <h3 style={{ margin: 0, fontWeight: 800, fontSize: 20, color: isDark ? '#f8fafc' : '#0f172a' }}>
                {translate('grammarCatalogTitle', currentLang)}
              </h3>
              <Tag color="indigo" style={{ borderRadius: 12, fontWeight: 700, margin: 0, fontSize: 12 }}>
                {GRAMMAR_TOPIC_CATALOG.length} {currentLang === 'vi' ? 'chủ đề' : 'topics'}
              </Tag>
            </div>
            <p style={{ margin: 0, color: isDark ? '#94a3b8' : '#64748b', fontSize: 13.5, maxWidth: 680, lineHeight: 1.5 }}>
              {translate('grammarCatalogDesc', currentLang)}
            </p>
          </div>

          {/* Quick search inside catalog */}
          <div style={{ width: 280, maxWidth: '100%' }}>
            <Input
              prefix={<Search size={15} color="#94a3b8" />}
              placeholder={translate('grammarCatalogSearchPlaceholder', currentLang)}
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              allowClear
              style={{ borderRadius: 10 }}
            />
          </div>
        </div>

        {/* Category Filter Tabs / Pills */}
        <div style={{ 
          display: 'flex', 
          gap: 8, 
          overflowX: 'auto', 
          paddingBottom: 8, 
          marginBottom: 20,
          scrollbarWidth: 'thin'
        }}>
          {GRAMMAR_CATEGORIES.map(cat => {
            const isSelected = catalogCategory === cat.id;
            const count = cat.id === 'all' 
              ? GRAMMAR_TOPIC_CATALOG.length 
              : GRAMMAR_TOPIC_CATALOG.filter(t => t.category === cat.id).length;

            return (
              <button
                key={cat.id}
                onClick={() => setCatalogCategory(cat.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 20,
                  fontSize: 12.5,
                  fontWeight: isSelected ? 700 : 500,
                  background: isSelected 
                    ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' 
                    : (isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9'),
                  color: isSelected ? '#ffffff' : (isDark ? '#cbd5e1' : '#475569'),
                  border: isSelected 
                    ? '1px solid transparent' 
                    : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0'),
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  boxShadow: isSelected ? '0 2px 8px rgba(99, 102, 241, 0.3)' : 'none'
                }}
              >
                <span>{cat.icon}</span>
                <span>{currentLang === 'vi' ? cat.nameVi : cat.nameEn}</span>
                <span style={{ 
                  fontSize: 11, 
                  opacity: isSelected ? 0.9 : 0.7, 
                  background: isSelected ? 'rgba(255,255,255,0.2)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
                  padding: '1px 6px',
                  borderRadius: 10
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Topics Grid */}
        {filteredCatalogTopics.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 12px', color: isDark ? '#cbd5e1' : '#475569' }}>
            <p>{currentLang === 'vi' ? 'Không tìm thấy chủ đề phù hợp.' : 'No matching topics found.'}</p>
            <Button onClick={() => { setCatalogCategory('all'); setCatalogSearch(''); }}>
              {currentLang === 'vi' ? 'Xóa bộ lọc' : 'Clear filters'}
            </Button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          {filteredCatalogTopics.map(topic => {
            const isSaved = notes.some(n => n.title.toLowerCase().trim() === topic.title.toLowerCase().trim());
            const levelColor = topic.level === 'B1' ? 'green' : topic.level === 'B2' ? 'blue' : 'purple';

            return (
              <div
                key={topic.id}
                className="bento-card-interactive hover-lift"
                style={{
                  padding: '20px',
                  borderRadius: 16,
                  background: isDark ? 'rgba(30, 41, 59, 0.5)' : '#ffffff',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: isDark ? '0 4px 14px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.03)',
                  transition: 'all 0.25s ease'
                }}
              >
                <div>
                  {/* Top Metadata */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Tag color={levelColor} style={{ margin: 0, fontWeight: 800, fontSize: 11, borderRadius: 6 }}>
                        {topic.level}
                      </Tag>
                      <Tag color="cyan" style={{ margin: 0, fontSize: 10.5, borderRadius: 6, fontWeight: 600 }}>
                        #{topic.tags[0]}
                      </Tag>
                    </div>

                    {isSaved ? (
                      <Tag color="success" style={{ margin: 0, fontSize: 11, borderRadius: 6, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                        <Check size={11} /> {currentLang === 'vi' ? 'Đã lưu' : 'Saved'}
                      </Tag>
                    ) : null}
                  </div>

                  {/* Title */}
                  <h4 
                    onClick={() => handleSelectCatalogTopic(topic, false)}
                    style={{ 
                      margin: '0 0 10px 0', 
                      fontSize: 16, 
                      fontWeight: 800, 
                      color: isDark ? '#f8fafc' : '#0f172a',
                      cursor: 'pointer',
                      lineHeight: 1.35
                    }}
                  >
                    {topic.title}
                  </h4>

                  {/* Formula Box */}
                  <div style={{
                    background: isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(241, 245, 249, 0.8)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    marginBottom: 12,
                    borderLeft: '3px solid #6366f1',
                    fontSize: 12,
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: isDark ? '#c7d2fe' : '#3730a3',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {topic.formula}
                  </div>

                  {/* Short Explanation */}
                  <p style={{
                    fontSize: 13,
                    lineHeight: '1.5',
                    color: isDark ? '#94a3b8' : '#64748b',
                    margin: '0 0 14px 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {topic.explanation}
                  </p>

                  {/* Exercises & Audio Badges */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: '#818cf8',
                      fontSize: 11,
                      fontWeight: 700
                    }}>
                      <Sparkles size={11} />
                      {((topic.exercises?.multipleChoice?.length || 0) + (topic.exercises?.translation?.length || 0))} {currentLang === 'vi' ? 'bài tập sẵn có' : 'starter exercises'}
                    </span>

                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 6,
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      fontSize: 11,
                      fontWeight: 700
                    }}>
                      <Volume2 size={11} />
                      {topic.examplesList.length} {currentLang === 'vi' ? 'audio ví dụ' : 'audio examples'}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr)',
                  paddingTop: 12,
                  borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid #f1f5f9',
                  gap: 8
                }}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<GraduationCap size={14} />}
                    onClick={() => handleSelectCatalogTopic(topic, false)}
                    style={{
                      borderRadius: 8,
                      fontWeight: 700,
                      height: 36,
                      width: '100%',
                      minWidth: 0,
                      padding: '0 12px',
                      background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                      boxShadow: '0 2px 8px rgba(2, 132, 199, 0.25)'
                    }}
                  >
                    {currentLang === 'vi' ? 'Học & luyện tập' : 'Study & practice'}
                  </Button>

                  <Button
                    size="small"
                    icon={<Sparkles size={14} />}
                    onClick={() => handleSelectCatalogTopic(topic, true)}
                    style={{
                      borderRadius: 8,
                      fontWeight: 600,
                      height: 36,
                      width: '100%',
                      minWidth: 0,
                      padding: '0 10px',
                      borderColor: '#a78bfa',
                      color: isDark ? '#c4b5fd' : '#6d28d9'
                    }}
                  >
                    {currentLang === 'vi' ? 'Tạo bài tập bằng AI' : 'Generate AI exercises'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </section>
      )}


      {/* Modal: Add Grammar Note (With AI Auto-Fill button) */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Plus size={18} color="#f43f5e" />
            <span>{translate('addGrammarTitle', currentLang)}</span>
          </div>
        }
        open={isModalOpen}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        okText={translate('btnSaveSettings', currentLang)}
        cancelText={currentLang === 'vi' ? 'Hủy' : 'Cancel'}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleAddNote} style={{ marginTop: 16 }}>
          <Form.Item 
            name="title" 
            label={
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <span>{translate('structureLabel', currentLang)}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<Sparkles size={12} color="#8b5cf6" />}
                  loading={isAutoFilling}
                  onClick={handleAutoFillModal}
                  style={{ color: '#8b5cf6', fontWeight: 600, padding: 0 }}
                >
                  {translate('aiGrammarAutoFillBtn', currentLang)}
                </Button>
              </div>
            } 
            rules={[{ required: true, message: currentLang === 'vi' ? 'Vui lòng nhập tên cấu trúc' : 'Please input structure title' }]}
          >
            <Input placeholder="e.g. Conditional Type 3, Neither... nor..." />
          </Form.Item>
          <Form.Item name="content" label={translate('noteLabel', currentLang)} rules={[{ required: true, message: currentLang === 'vi' ? 'Vui lòng nhập công thức / ghi chú' : 'Please input notes' }]}>
            <Input.TextArea placeholder="If + S + had + V3/ed, S + would + have + V3/ed..." rows={4} />
          </Form.Item>
          <Form.Item name="example" label={translate('exampleGrammarLabel', currentLang)}>
            <Input.TextArea placeholder="If I had studied harder, I would have passed the exam." rows={3} />
          </Form.Item>
          <Form.Item name="tags" label={translate('tagsGrammarLabel', currentLang)}>
            <Input placeholder="e.g. conditional, advanced, exam" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Edit Existing Grammar Note */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <Pencil size={18} color="#6366f1" />
            <span>{translate('editGrammarTitle', currentLang)}</span>
          </div>
        }
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingNote(null);
          editForm.resetFields();
        }}
        onOk={() => editForm.submit()}
        okText={translate('btnSaveSettings', currentLang)}
        cancelText={currentLang === 'vi' ? 'Hủy' : 'Cancel'}
        width={560}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditNote} style={{ marginTop: 16 }}>
          <Form.Item name="title" label={translate('structureLabel', currentLang)} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="content" label={translate('noteLabel', currentLang)} rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="example" label={translate('exampleGrammarLabel', currentLang)}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="tags" label={translate('tagsGrammarLabel', currentLang)}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* Grammar Studio & Practice Modal */}
      <GrammarStudioModal
        open={isStudioOpen}
        note={selectedStudioNote}
        autoOpenGenerator={studioAutoOpenGenerator}
        onClose={() => {
          setIsStudioOpen(false);
          setSelectedStudioNote(null);
          setStudioAutoOpenGenerator(false);
        }}
        onNoteUpdated={(upd) => setSelectedStudioNote(upd)}
        reviewMistakesOnly={studioReviewMistakesOnly}
        initialTab={studioReviewMistakesOnly ? 'quiz' : 'theory'}
      />
    </div>
  );
};
