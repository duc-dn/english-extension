import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, message, Tooltip, Typography, Select } from 'antd';
import { Plus, Trash2, Wand2, Volume2, Pencil, Download, Upload, Mic, ExternalLink } from 'lucide-react';
import { db, addWord, type Word, deleteWord, updateWord, importWords, DuplicateWordError } from '../lib/db';
import { buildVocabularyCsv, parseVocabularyCsv } from '../lib/vocabularyCsv';
import { fetchBasicMeaning } from '../lib/translator';
import { playAudio } from '../lib/audio';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';
import { VoiceRecognitionService, evaluatePronunciation, type PronunciationScore } from '../lib/speechRecognition';

const { Paragraph } = Typography;
const EMPTY_WORDS: Word[] = [];

export const VocabularyManager: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Speaking state
  const [speakingWord, setSpeakingWord] = useState<string | null>(null);
  const [speakingResult, setSpeakingResult] = useState<PronunciationScore | null>(null);
  const [isListening, setIsListening] = useState(false);
  const voiceServiceRef = useRef<VoiceRecognitionService | null>(null);

  useEffect(() => {
    voiceServiceRef.current = new VoiceRecognitionService();
  }, []);

  const handleTestPronunciation = (word: string) => {
    if (!voiceServiceRef.current || !voiceServiceRef.current.isSupported()) {
      message.warning('Trình duyệt chưa hỗ trợ Web Speech API.');
      return;
    }
    setSpeakingWord(word);
    setSpeakingResult(null);
    setIsListening(true);

    voiceServiceRef.current.startListening(
      (transcript) => {
        const evalRes = evaluatePronunciation(word, transcript, settings.language || 'vi');
        setSpeakingResult(evalRes);
        setIsListening(false);
      },
      (err) => {
        console.warn(err);
        setIsListening(false);
      },
      () => {
        setIsListening(false);
      }
    );
  };

  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  
  // useLiveQuery from Dexie makes the component auto-update when IndexedDB changes
  const words = useLiveQuery(() => db.words.toArray()) ?? EMPTY_WORDS;

  const [searchText, setSearchText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    words.forEach(w => (w.tags || []).forEach(t => tags.add(t)));
    return Array.from(tags).sort();
  }, [words]);

  const filteredWords = useMemo(() => {
    return words.filter(word => {
      const matchesSearch = !searchText.trim() || 
        word.word.toLowerCase().includes(searchText.toLowerCase()) || 
        word.meaning.toLowerCase().includes(searchText.toLowerCase()) ||
        (word.description && word.description.toLowerCase().includes(searchText.toLowerCase()));
      
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.every(t => (word.tags || []).includes(t));
        
      const matchesStatus = !selectedStatus || 
        (selectedStatus === 'new' && (word.status === 'new' || !word.status)) ||
        (selectedStatus === 'learning' && (word.status === 'learning' || word.status === 'reviewing')) ||
        (selectedStatus === 'mastered' && word.status === 'mastered');
        
      return matchesSearch && matchesTags && matchesStatus;
    });
  }, [words, searchText, selectedTags, selectedStatus]);

  const handleExport = () => {
    const csv = buildVocabularyCsv(words);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `english-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImport = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      message.error(currentLang === 'vi' ? 'Tệp CSV phải nhỏ hơn 5 MB.' : 'CSV file must be under 5 MB.');
      return;
    }
    setIsImporting(true);
    try {
      const { words: imported, skipped } = parseVocabularyCsv(await file.text());
      const { added, duplicates } = await importWords(imported);
      message.success(currentLang === 'vi'
        ? `Đã nhập ${added} từ. Bỏ qua ${duplicates} từ trùng và ${skipped} dòng thiếu dữ liệu.`
        : `Imported ${added} words. Skipped ${duplicates} duplicates and ${skipped} incomplete rows.`);
    } catch (error) {
      message.error(currentLang === 'vi'
        ? `Không thể nhập CSV: ${error instanceof Error ? error.message : 'Tệp không hợp lệ.'}`
        : `Could not import CSV: ${error instanceof Error ? error.message : 'Invalid file.'}`);
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const handleAddWord = async (values: { word: string; phonetic?: string; meaning: string; description?: string; example: string; tags: string }) => {
    try {
      const tagList = values.tags ? values.tags.split(',').map(t => t.trim()) : [];
      await addWord({
        word: values.word,
        phonetic: values.phonetic || '',
        meaning: values.meaning,
        description: values.description || '',
        example: values.example || '',
        tags: tagList
      });
      message.success(translate('addSuccess', currentLang));
      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof DuplicateWordError
        ? (currentLang === 'vi' ? 'Từ này đã có trong sổ từ.' : 'This word is already saved.')
        : translate('addFailed', currentLang));
    }
  };

  const handleEditWord = async (values: { word: string; phonetic?: string; meaning: string; description?: string; example: string; tags: string }) => {
    if (!editingWord) return;
    try {
      const tagList = values.tags ? values.tags.split(',').map(t => t.trim()) : [];
      await updateWord(editingWord.id, {
        word: values.word,
        phonetic: values.phonetic || '',
        meaning: values.meaning,
        description: values.description || '',
        example: values.example || '',
        tags: tagList
      });
      message.success(translate('editSuccess', currentLang));
      setIsEditModalOpen(false);
      setEditingWord(null);
      editForm.resetFields();
    } catch (error) {
      message.error(error instanceof DuplicateWordError
        ? (currentLang === 'vi' ? 'Từ này đã có trong sổ từ.' : 'This word is already saved.')
        : translate('editFailed', currentLang));
    }
  };

  const openEditModal = (record: Word) => {
    setEditingWord(record);
    editForm.setFieldsValue({
      word: record.word,
      phonetic: record.phonetic,
      meaning: record.meaning,
      description: record.description || '',
      example: record.example,
      tags: (record.tags || []).join(', ')
    });
    setIsEditModalOpen(true);
  };

  const handleDelete = (id: string) => {
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
        } catch {
          message.error(translate('deleteFailed', currentLang));
        }
      }
    });
  };

  const handleAutoFill = async () => {
    const word = form.getFieldValue('word');
    if (!word) {
      message.warning(translate('inputWordFirst', currentLang));
      return;
    }

    setIsAutoFilling(true);
    try {
      const result = await fetchBasicMeaning(word);
      if (result && (result.meanings?.length || result.vietnameseMeaning)) {
        const def = result.meanings?.[0]?.definitions?.[0];
        
        // Compile other definitions/meanings for the description area
        const otherMeanings = (result.meanings || []).map(m => {
          const part = m.partOfSpeech ? `[${m.partOfSpeech}] ` : '';
          const defs = m.definitions.slice(0, 2).map(d => d.definition).join('; ');
          return `${part}${defs}`;
        }).join('\n');

        form.setFieldsValue({
          phonetic: result.phonetic || '',
          meaning: result.vietnameseMeaning || def?.definition || '',
          description: otherMeanings || '',
          example: def?.example || '',
          tags: [result.meanings?.[0]?.partOfSpeech].filter(Boolean).join(', ')
        });
        message.success(translate('autoFillSuccess', currentLang));
      } else {
        message.warning(translate('autoFillEmpty', currentLang));
      }
    } catch {
      message.error(translate('autoFillError', currentLang));
    } finally {
      setIsAutoFilling(false);
    }
  };

  const columns = [
    {
      title: translate('tableWord', currentLang),
      dataIndex: 'word',
      key: 'word',
      width: '18%',
      render: (text: string, record: Word) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ fontSize: 16, color: '#1e293b' }}>{text}</strong>
            <Button 
              type="text" 
              size="small" 
              icon={<Volume2 size={14} color="#8b5cf6" />} 
              onClick={() => playAudio(text)} 
              title="Phát âm"
              style={{ 
                padding: 0, 
                minWidth: 'auto', 
                height: 24, 
                width: 24, 
                background: 'rgba(139, 92, 246, 0.08)', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
            <Button 
              type="text" 
              size="small" 
              icon={<Mic size={14} color={speakingWord === text && isListening ? '#ef4444' : '#6366f1'} />} 
              onClick={() => handleTestPronunciation(text)} 
              title="Luyện phát âm"
              style={{ 
                padding: 0, 
                minWidth: 'auto', 
                height: 24, 
                width: 24, 
                background: speakingWord === text && isListening ? '#fee2e2' : 'rgba(99, 102, 241, 0.08)', 
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            />
          </div>

          {speakingWord === text && speakingResult && (
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: speakingResult.matched ? '#10b981' : '#ef4444' }}>
              🎯 {speakingResult.score}% ({speakingResult.transcript})
            </div>
          )}

          {record.phonetic && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{record.phonetic}</div>}
          {record.status && (
            <div style={{ marginTop: 6 }}>
              <Tag color={
                record.status === 'mastered' ? 'success' : 
                record.status === 'reviewing' ? 'processing' : 
                record.status === 'learning' ? 'warning' : 'default'
              } style={{ fontSize: 10, borderRadius: 8, padding: '0 6px' }}>
                {record.status === 'mastered' ? translate('statusMastered', currentLang) : 
                 record.status === 'reviewing' ? translate('statusReviewing', currentLang) :
                 record.status === 'learning' ? translate('statusLearning', currentLang) : translate('statusNew', currentLang)}
              </Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: translate('tableMeaning', currentLang),
      key: 'meaning_details',
      width: '24%',
      render: (_: unknown, record: Word) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong style={{ fontSize: 15, color: '#8b5cf6' }}>{record.meaning}</strong>
          {record.description && (
            <div style={{ 
              fontSize: 13, 
              color: '#64748b', 
              whiteSpace: 'pre-wrap', 
              background: 'rgba(0,0,0,0.02)', 
              padding: '6px 10px', 
              borderRadius: 8, 
              borderLeft: '2px solid #cbd5e1',
              marginTop: 2
            }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: currentLang === 'vi' ? 'Ngữ cảnh & Ví dụ' : 'Context & Example',
      key: 'context_example',
      width: '28%',
      render: (_: unknown, record: Word) => {
        const text = record.contextSentence || record.example;
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {text ? (
              <div style={{ 
                fontSize: 13, 
                fontStyle: 'italic', 
                color: '#475569', 
                lineHeight: 1.5,
                position: 'relative',
                paddingLeft: 10,
                borderLeft: '2px solid #8b5cf6'
              }}>
                <Paragraph 
                  ellipsis={{ 
                    rows: 2, 
                    expandable: true, 
                    symbol: currentLang === 'vi' ? 'xem thêm' : 'more' 
                  }}
                  style={{ 
                    margin: 0, 
                    color: 'inherit', 
                    fontStyle: 'inherit',
                    fontSize: 'inherit'
                  }}
                >
                  "{text}"
                </Paragraph>
              </div>
            ) : (
              <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 12 }}>{translate('noExample', currentLang)}</span>
            )}

            {record.sourceUrl && (
              <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <ExternalLink size={10} />
                <a href={record.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {record.sourceTitle || record.sourceUrl}
                </a>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: translate('tableTags', currentLang),
      dataIndex: 'tags',
      key: 'tags',
      width: '10%',
      render: (tags: string[]) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tags.map(tag => {
            let color = tag.length > 5 ? 'geekblue' : 'green';
            if (tag === 'it' || tag === 'tech') color = 'purple';
            return (
              <Tag color={color} key={tag} style={{ margin: 0, borderRadius: 10, fontSize: 11 }}>
                #{tag}
              </Tag>
            );
          })}
        </div>
      ),
    },
    {
      title: translate('tableNextReview', currentLang),
      dataIndex: 'next_review',
      key: 'next_review',
      width: '10%',
      render: (date: Date) => (
        <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
          {date.toLocaleDateString(currentLang === 'vi' ? 'vi-VN' : 'en-US')}
        </div>
      ),
    },
    {
      title: translate('tableActions', currentLang),
      key: 'action',
      width: '10%',
      align: 'center' as const,
      render: (_: unknown, record: Word) => (
        <Space size="middle" style={{ justifyContent: 'center', width: '100%' }}>
          <Tooltip title={currentLang === 'vi' ? 'Chỉnh sửa' : 'Edit'}>
            <Button 
              type="text" 
              icon={<Pencil size={15} color="#0284c7" />} 
              onClick={() => openEditModal(record)} 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            />
          </Tooltip>
          <Tooltip title={currentLang === 'vi' ? 'Xóa' : 'Delete'}>
            <Button 
              type="text" 
              danger 
              icon={<Trash2 size={15} />} 
              onClick={() => handleDelete(record.id)} 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '26px', color: '#1e293b' }}>
            {translate('vocabTitle', currentLang)}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 14 }}>
            {translate('vocabDesc', currentLang)}
          </p>
        </div>
        <Space wrap>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label={currentLang === 'vi' ? 'Chọn tệp CSV từ vựng' : 'Choose vocabulary CSV file'}
            style={{ display: 'none' }}
            onChange={event => void handleImport(event.target.files?.[0])}
          />
          <Tooltip title={currentLang === 'vi' ? 'CSV cần cột word, meaning; các thẻ cách nhau bằng dấu chấm phẩy.' : 'CSV needs word and meaning columns; separate tags with semicolons.'}>
            <Button icon={<Upload size={16} />} loading={isImporting} onClick={() => importInputRef.current?.click()}>
              {currentLang === 'vi' ? 'Nhập CSV' : 'Import CSV'}
            </Button>
          </Tooltip>
          <Button icon={<Download size={16} />} onClick={handleExport} disabled={!words.length}>
            {currentLang === 'vi' ? 'Xuất CSV' : 'Export CSV'}
          </Button>
          <Button
            type="primary"
            size="large"
            style={{ borderRadius: 20, fontWeight: 600, background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', border: 'none', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)', height: 44 }}
            icon={<Plus size={18} />}
            onClick={() => setIsModalOpen(true)}
          >
            {translate('btnAddNewWord', currentLang)}
          </Button>
        </Space>
      </div>

      <div className="glass-card" style={{ padding: 16 }}>
        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input 
            placeholder={currentLang === 'vi' ? 'Tìm kiếm từ vựng hoặc nghĩa...' : 'Search word or meaning...'}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            style={{ width: 250, borderRadius: 8 }}
            allowClear
          />
          <Select
            mode="multiple"
            placeholder={currentLang === 'vi' ? 'Lọc theo thẻ (tags)...' : 'Filter by tags...'}
            value={selectedTags}
            onChange={setSelectedTags}
            style={{ minWidth: 200, flex: 1, maxWidth: 400 }}
            allowClear
            maxTagCount="responsive"
            dropdownStyle={{ borderRadius: 8 }}
          >
            {allTags.map(tag => (
              <Select.Option key={tag} value={tag}>
                #{tag}
              </Select.Option>
            ))}
          </Select>
          
          <Select
            placeholder={currentLang === 'vi' ? 'Trạng thái...' : 'Status...'}
            value={selectedStatus}
            onChange={setSelectedStatus}
            style={{ width: 150 }}
            allowClear
            dropdownStyle={{ borderRadius: 8 }}
          >
            <Select.Option value="new">{translate('statusNew', currentLang)}</Select.Option>
            <Select.Option value="learning">{translate('statusLearning', currentLang)}</Select.Option>
            <Select.Option value="mastered">{translate('statusMastered', currentLang)}</Select.Option>
          </Select>
        </div>

        <Table 
          dataSource={filteredWords} 
          columns={columns} 
          rowKey="id" 
          pagination={{ pageSize: 8, showSizeChanger: false }}
          style={{ background: 'transparent' }}
          className="premium-table"
          tableLayout="fixed"
        />
      </div>

      {/* Modal Thêm Từ Mới */}
      <Modal
        title={<span style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>{translate('addWordTitle', currentLang)}</span>}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
        okText={translate('btnSave', currentLang)}
        cancelText={translate('btnCancel', currentLang)}
        destroyOnClose
        okButtonProps={{ style: { borderRadius: 16, background: '#8b5cf6' } }}
        cancelButtonProps={{ style: { borderRadius: 16 } }}
      >
        <Form form={form} layout="vertical" onFinish={handleAddWord}>
          <Form.Item label={translate('wordLabel', currentLang)} required>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="word" noStyle rules={[{ required: true, message: translate('inputWordFirst', currentLang) }]}>
                <Input placeholder="Ví dụ: implement" style={{ borderTopLeftRadius: 8, borderBottomLeftRadius: 8 }} />
              </Form.Item>
              <Button type="primary" style={{ background: '#8b5cf6', borderTopRightRadius: 8, borderBottomRightRadius: 8 }} icon={<Wand2 size={16} />} onClick={handleAutoFill} loading={isAutoFilling}>
                {translate('btnAutoFill', currentLang)}
              </Button>
            </Space.Compact>
          </Form.Item>
          <Form.Item name="phonetic" label={translate('phoneticLabel', currentLang)}>
            <Input placeholder="Ví dụ: /ɪm.plɪ.mənˈteɪ.ʃən/" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="meaning" label={translate('meaningLabel', currentLang)} rules={[{ required: true, message: translate('meaningLabel', currentLang) }]}>
            <Input placeholder="Ví dụ: triển khai, thực thi" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="description" label={translate('descriptionLabel', currentLang)}>
            <Input.TextArea rows={3} placeholder="Mô tả các nghĩa khác..." style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="example" label={translate('exampleLabel', currentLang)}>
            <Input.TextArea rows={2} placeholder="Ví dụ: We implemented the new system." style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="tags" label={translate('tagsLabel', currentLang)}>
            <Input placeholder="Ví dụ: it, verb, daily" style={{ borderRadius: 8 }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal Chỉnh Sửa Từ Vựng */}
      <Modal
        title={<span style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>{translate('editWordTitle', currentLang)}</span>}
        open={isEditModalOpen}
        onCancel={() => { setIsEditModalOpen(false); setEditingWord(null); }}
        onOk={() => editForm.submit()}
        okText={translate('btnSaveEdit', currentLang)}
        cancelText={translate('btnCancel', currentLang)}
        okButtonProps={{ style: { borderRadius: 16, background: '#8b5cf6' } }}
        cancelButtonProps={{ style: { borderRadius: 16 } }}
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditWord}>
          <Form.Item name="word" label={translate('wordLabel', currentLang)} rules={[{ required: true, message: translate('wordLabel', currentLang) }]}>
            <Input placeholder="Ví dụ: implement" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="phonetic" label={translate('phoneticLabel', currentLang)}>
            <Input placeholder="Ví dụ: /ɪm.plɪ.mənˈteɪ.ʃən/" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="meaning" label={translate('meaningLabel', currentLang)} rules={[{ required: true, message: translate('meaningLabel', currentLang) }]}>
            <Input placeholder="Ví dụ: triển khai, thực thi" style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="description" label={translate('descriptionLabel', currentLang)}>
            <Input.TextArea rows={3} placeholder="Mô tả..." style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="example" label={translate('exampleLabel', currentLang)}>
            <Input.TextArea rows={2} placeholder="Ví dụ: We implemented the new system." style={{ borderRadius: 8 }} />
          </Form.Item>
          <Form.Item name="tags" label={translate('tagsLabel', currentLang)}>
            <Input placeholder="Ví dụ: it, verb, daily" style={{ borderRadius: 8 }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
