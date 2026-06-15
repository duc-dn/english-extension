import React, { useState } from 'react';
import { Table, Button, Tag, Space, Modal, Form, Input, message } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
import { db, type GrammarNote, addGrammarNote, deleteGrammarNote } from '../lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSettings } from '../lib/settings';
import { translate } from '../lib/localization';

export const GrammarManager: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form] = Form.useForm();

  const settings = useSettings();
  const currentLang = settings.language || 'vi';
  
  const notes = useLiveQuery(() => db.grammar_notes.toArray()) || [];

  const handleAddNote = async (values: { title: string; content: string; example: string; tags: string }) => {
    try {
      const tagList = values.tags ? values.tags.split(',').map(t => t.trim()) : [];
      await addGrammarNote({
        title: values.title,
        content: values.content,
        example: values.example || '',
        tags: tagList
      });
      message.success(translate('addNoteSuccess', currentLang));
      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(translate('addNoteFailed', currentLang));
    }
  };

  const handleDelete = (id: string) => {
    Modal.confirm({
      title: currentLang === 'vi' ? 'Xác nhận xóa' : 'Confirm Delete',
      content: currentLang === 'vi' ? 'Bạn có chắc chắn muốn xóa cấu trúc ngữ pháp này không?' : 'Are you sure you want to delete this grammar structure?',
      okText: currentLang === 'vi' ? 'Xóa' : 'Delete',
      okType: 'danger',
      cancelText: currentLang === 'vi' ? 'Hủy' : 'Cancel',
      okButtonProps: { style: { borderRadius: 8 } },
      cancelButtonProps: { style: { borderRadius: 8 } },
      onOk: async () => {
        try {
          await deleteGrammarNote(id);
          message.success(translate('deleteNoteSuccess', currentLang));
        } catch (error) {
          message.error(translate('deleteNoteFailed', currentLang));
        }
      }
    });
  };

  const columns = [
    {
      title: translate('tableStructure', currentLang),
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <strong style={{ color: '#1e293b' }}>{text}</strong>,
    },
    {
      title: translate('tableNote', currentLang),
      dataIndex: 'content',
      key: 'content',
      render: (text: string) => <div style={{ maxWidth: 300, whiteSpace: 'pre-wrap' }}>{text}</div>
    },
    {
      title: translate('tableExampleGrammar', currentLang),
      dataIndex: 'example',
      key: 'example',
      render: (text: string) => <div style={{ fontStyle: 'italic', color: '#64748b' }}>{text}</div>
    },
    {
      title: translate('tableTagsGrammar', currentLang),
      dataIndex: 'tags',
      key: 'tags',
      render: (tags: string[]) => (
        <>
          {(tags || []).map(tag => (
            <Tag color="magenta" key={tag}>
              #{tag}
            </Tag>
          ))}
        </>
      ),
    },
    {
      title: translate('tableActionsGrammar', currentLang),
      key: 'action',
      render: (_: any, record: GrammarNote) => (
        <Space size="middle">
          <Button type="text" danger icon={<Trash2 size={16} />} onClick={() => handleDelete(record.id)} />
        </Space>
      ),
    },
  ];

  return (
    <div style={{ animation: 'fadeIn 0.5s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700, fontSize: '24px' }}>
            {translate('grammarTitle', currentLang)}
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>
            {translate('grammarDesc', currentLang)}
          </p>
        </div>
        <Button 
          type="primary" 
          size="large" 
          style={{ borderRadius: 8, fontWeight: 600, background: '#f43f5e' }} 
          icon={<Plus size={18} />} 
          onClick={() => setIsModalOpen(true)}
        >
          {translate('addGrammarTitle', currentLang)}
        </Button>
      </div>

      <div className="glass-card" style={{ padding: 8 }}>
        <Table 
          dataSource={notes} 
          columns={columns} 
          rowKey="id" 
          pagination={{ pageSize: 8 }}
          style={{ background: 'transparent' }}
        />
      </div>

      <Modal
        title={translate('addGrammarTitle', currentLang)}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleAddNote}>
          <Form.Item name="title" label={translate('structureLabel', currentLang)} rules={[{ required: true }]}>
            <Input placeholder="e.g. Conditional Type 3" />
          </Form.Item>
          <Form.Item name="content" label={translate('noteLabel', currentLang)} rules={[{ required: true }]}>
            <Input.TextArea placeholder="If + Past Perfect, Would have + V3" rows={3} />
          </Form.Item>
          <Form.Item name="example" label={translate('exampleGrammarLabel', currentLang)}>
            <Input.TextArea placeholder="If I had studied harder, I would have passed." />
          </Form.Item>
          <Form.Item name="tags" label={translate('tagsGrammarLabel', currentLang)}>
            <Input placeholder="e.g. conditional, advanced" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
