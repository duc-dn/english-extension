import React, { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, message, Tooltip } from 'antd';
import { Plus, Trash2, Wand2, Volume2, Pencil } from 'lucide-react';
import { db, addWord, type Word, deleteWord, updateWord } from '../lib/db';
import { fetchBasicMeaning } from '../lib/translator';
import { playAudio } from '../lib/audio';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';

export const VocabularyManager: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  
  // useLiveQuery from Dexie makes the component auto-update when IndexedDB changes
  const words = useLiveQuery(() => db.words.toArray()) || [];

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
      message.error(translate('addFailed', currentLang));
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
      message.error(translate('editFailed', currentLang));
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
      tags: record.tags.join(', ')
    });
    setIsEditModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWord(id);
      message.success(translate('deleteSuccess', currentLang));
    } catch (error) {
      message.error(translate('deleteFailed', currentLang));
    }
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
      if (result && result.meanings.length > 0) {
        const def = result.meanings?.[0]?.definitions?.[0];
        
        // Compile other definitions/meanings for the description area
        const otherMeanings = result.meanings.map((m: any) => {
          const part = m.partOfSpeech ? `[${m.partOfSpeech}] ` : '';
          const defs = m.definitions.slice(0, 2).map((d: any) => d.definition).join('; ');
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
    } catch (error) {
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
      width: '25%',
      render: (text: string, record: Word) => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <strong style={{ fontSize: 16, color: '#1e293b' }}>{text}</strong>
            <Button 
              type="text" 
              size="small" 
              icon={<Volume2 size={14} color="#8b5cf6" />} 
              onClick={() => playAudio(text)} 
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
          </div>
          {record.phonetic && <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 2 }}>{record.phonetic}</div>}
          {record.status && (
            <div style={{ marginTop: 6 }}>
              <Tag color={
                record.status === 'mastered' ? 'success' : 
                record.status === 'reviewing' ? 'processing' : 
                record.status === 'learning' ? 'warning' : 'default'
              } style={{ fontSize: 10, borderRadius: 8, padding: '0 6px' }}>
                {record.status === 'mastered' ? translate('statusMastered', currentLang) : 
                 record.status === 'reviewing' ? translate('statusLearning', currentLang) : // (SRS mapping uses reviewing/learning)
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
      width: '35%',
      render: (_: any, record: Word) => (
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
      title: translate('tableExample', currentLang),
      dataIndex: 'example',
      key: 'example',
      width: '25%',
      render: (text: string) => text ? (
        <div style={{ 
          fontSize: 13, 
          fontStyle: 'italic', 
          color: '#475569', 
          lineHeight: 1.5,
          position: 'relative',
          paddingLeft: 12,
          borderLeft: '2px solid #cbd5e1'
        }}>
          "{text}"
        </div>
      ) : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>{translate('noExample', currentLang)}</span>,
    },
    {
      title: translate('tableTags', currentLang),
      dataIndex: 'tags',
      key: 'tags',
      width: '15%',
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
      render: (_: any, record: Word) => (
        <Space size="middle">
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 800, fontSize: '26px', color: '#1e293b' }}>
            {translate('vocabTitle', currentLang)}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 14 }}>
            {translate('vocabDesc', currentLang)}
          </p>
        </div>
        <Button 
          type="primary" 
          size="large" 
          style={{ borderRadius: 20, fontWeight: 600, background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)', border: 'none', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.25)', height: 44 }} 
          icon={<Plus size={18} />} 
          onClick={() => setIsModalOpen(true)}
        >
          {translate('btnAddNewWord', currentLang)}
        </Button>
      </div>

      <div className="glass-card" style={{ padding: 16 }}>
        <Table 
          dataSource={words} 
          columns={columns} 
          rowKey="id" 
          pagination={{ pageSize: 8, showSizeChanger: false }}
          style={{ background: 'transparent' }}
          className="premium-table"
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
