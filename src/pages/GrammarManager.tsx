import React, { useState, useMemo } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, message, Typography, Tooltip, Spin, Popconfirm } from 'antd';
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
  X
} from 'lucide-react';
import { db, type GrammarNote, addGrammarNote, deleteGrammarNote, updateGrammarNote } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { searchGrammarWithAI, type AIGrammarExplanation } from '../lib/translator';
import { playAudio } from '../lib/audio';
import { isDeepSeekProxyActive } from '../lib/deepseekProxy';

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

export const GrammarManager: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<GrammarNote | null>(null);

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
      return matchSearch && matchTag;
    });
  }, [notes, tableSearchText, selectedTag]);

  // All unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach(n => (n.tags || []).forEach(t => set.add(t)));
    return Array.from(set);
  }, [notes]);

  // Execute AI Grammar Search
  const handleAISearch = async (queryToSearch?: string) => {
    const q = (queryToSearch || searchQuery).trim();
    if (!q) {
      message.warning(currentLang === 'vi' ? 'Vui lòng nhập tên hoặc chủ đề ngữ pháp cần tra cứu.' : 'Please enter a grammar topic to search.');
      return;
    }

    if (!hasAI) {
      message.warning(
        currentLang === 'vi'
          ? 'Chưa bật AI Provider hoặc DeepSeek Local Proxy. Hãy bật công tắc proxy ở thanh công cụ phía trên.'
          : 'AI Provider is disabled. Please toggle on DeepSeek Local Proxy on the top bar.'
      );
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

      await addGrammarNote({
        title: item.title,
        content: formattedContent,
        example: formattedExamples,
        tags: item.tags || ['ai-grammar']
      });

      setSavedAiTitles(prev => new Set(prev).add(item.title));
      message.success(translate('aiGrammarSaveSuccess', currentLang));
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
      render: (text: string) => (
        <div>
          <strong style={{ color: isDark ? '#f8fafc' : '#1e293b', fontSize: 15 }}>{text}</strong>
        </div>
      ),
    },
    {
      title: translate('tableNote', currentLang),
      dataIndex: 'content',
      key: 'content',
      width: '36%',
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
      width: '6%',
      render: (_: unknown, record: GrammarNote) => (
        <Space size="small">
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
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
      </div>

      {/* AI Grammar Search Hero Box */}
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
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <Input
            size="large"
            prefix={<Search size={18} color="#94a3b8" style={{ marginRight: 6 }} />}
            placeholder={translate('aiGrammarSearchPlaceholder', currentLang)}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onPressEnter={() => handleAISearch()}
            allowClear
            style={{ borderRadius: 10, fontSize: 14 }}
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

              {/* Action Buttons: 1-Click Save */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* Filter and Table of Saved Grammar */}
      <div className="bento-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
            <Input
              prefix={<Search size={15} color="#94a3b8" />}
              placeholder={translate('aiGrammarFilterPlaceholder', currentLang)}
              value={tableSearchText}
              onChange={(e) => setTableSearchText(e.target.value)}
              allowClear
              style={{ maxWidth: 360, borderRadius: 8 }}
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
              {allTags.slice(0, 6).map(tag => (
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
          <div style={{ fontSize: 13, color: '#64748b' }}>
            {currentLang === 'vi' 
              ? `Hiển thị ${filteredNotes.length} / ${notes.length} cấu trúc` 
              : `Showing ${filteredNotes.length} / ${notes.length} rules`}
          </div>
        </div>

        {filteredNotes.length === 0 ? (
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
            <p style={{ color: isDark ? '#94a3b8' : '#64748b', fontSize: 13.5, maxWidth: 460, margin: '0 auto 24px auto', lineHeight: 1.5 }}>
              {currentLang === 'vi' 
                ? 'Sử dụng ô Tra cứu AI ở trên hoặc chọn nhanh một chủ đề cốt lõi dưới đây để AI trích xuất công thức và lưu vào sổ tay:'
                : 'Use the AI search box above or choose a foundational topic below to auto-extract rules and examples:'}
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, maxWidth: 880, margin: '0 auto' }}>
              {[
                { title: 'Câu điều kiện loại 3 (Third Conditional)', desc: 'If + S + had PII, S + would have PII', tag: 'Conditionals' },
                { title: 'Đảo ngữ No sooner / Hardly', desc: 'No sooner had + S + PII than S + Ved', tag: 'Inversion' },
                { title: 'Mệnh đề quan hệ rút gọn', desc: 'V-ing / PII / To-V reduction', tag: 'Clauses' },
                { title: 'Câu chẻ Cleft Sentences', desc: 'It is/was + X + that/who...', tag: 'Emphasis' }
              ].map(item => (
                <div
                  key={item.title}
                  onClick={() => {
                    setSearchQuery(item.title);
                    handleAISearch(item.title);
                  }}
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
                  <div style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', fontFamily: 'monospace' }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
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
    </div>
  );
};
