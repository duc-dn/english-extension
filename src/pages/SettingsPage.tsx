import React, { useEffect, useState } from 'react';
import { Form, Input, Button, Select, Card, Typography, message, Divider, Space, Modal, Switch } from 'antd';
import { Save, CloudUpload, CloudDownload } from 'lucide-react';
import { getSettings, saveSettings, useSettings, type Settings } from '../lib/settings';
import { syncToGithub, syncFromGithub } from '../lib/github';
import { translate } from '../lib/localization';

const { Title, Text } = Typography;
const { Option } = Select;

export const SettingsPage: React.FC = () => {
  const [form] = Form.useForm<any>();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [aiProvider, setAiProvider] = useState<Settings['ai_provider']>('none');

  const settings = useSettings();
  const currentLang = settings.language || 'vi';

  useEffect(() => {
    const loadData = async () => {
      const data = await getSettings();
      form.setFieldsValue(data);
      setAiProvider(data.ai_provider);
    };
    loadData();
  }, [form]);

  // Keep form fields updated when language changes reactively elsewhere
  useEffect(() => {
    form.setFieldsValue({ language: currentLang });
  }, [currentLang, form]);

  const onFinish = async (values: Partial<Settings>) => {
    setLoading(true);
    try {
      await saveSettings(values);
      message.success(translate('saveSuccess', currentLang));
    } catch (error) {
      message.error(translate('saveFailed', currentLang));
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    // Save current values first
    const values = form.getFieldsValue();
    if (!values.github_repo || !values.github_token) {
      message.warning(translate('warnInputRepoToken', currentLang));
      return;
    }
    
    setSyncing(true);
    try {
      await saveSettings(values);
      await syncToGithub();
      message.success(translate('syncSuccess', currentLang));
    } catch (error: any) {
      message.error(error.message || translate('syncFailed', currentLang));
    } finally {
      setSyncing(false);
    }
  };

  const handlePull = async () => {
    const values = form.getFieldsValue();
    if (!values.github_repo || !values.github_token) {
      message.warning(translate('warnInputRepoToken', currentLang));
      return;
    }

    Modal.confirm({
      title: translate('pullConfirmTitle', currentLang),
      content: translate('pullConfirmContent', currentLang),
      okText: 'OK',
      cancelText: currentLang === 'vi' ? 'Hủy' : 'Cancel',
      okButtonProps: { style: { background: '#8b5cf6', borderColor: '#8b5cf6' } },
      onOk: async () => {
        setPulling(true);
        try {
          await saveSettings(values);
          await syncFromGithub();
          message.success(translate('pullSuccess', currentLang));
        } catch (error: any) {
          message.error(error.message || translate('pullFailed', currentLang));
        } finally {
          setPulling(false);
        }
      }
    });
  };

  return (
    <div style={{ maxWidth: 700, animation: 'fadeIn 0.5s ease', margin: '0 auto' }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <Title level={2} style={{ fontWeight: 700 }}>
          {translate('settingsTitle', currentLang)}
        </Title>
        <Text type="secondary" style={{ fontSize: 16 }}>
          {translate('settingsDesc', currentLang)}
        </Text>
      </div>
      
      <Card className="glass-card" style={{ padding: '8px 16px' }} bordered={false}>
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={onFinish}
          onValuesChange={(changedValues) => {
            if (changedValues.ai_provider) {
              setAiProvider(changedValues.ai_provider);
            }
          }}
        >
          <Form.Item name="theme" label={translate('appTheme', currentLang)}>
            <Select>
              <Option value="system">{translate('themeSystem', currentLang)}</Option>
              <Option value="light">{translate('themeLight', currentLang)}</Option>
              <Option value="dark">{translate('themeDark', currentLang)}</Option>
            </Select>
          </Form.Item>

          <Form.Item name="language" label={translate('uiLanguage', currentLang)}>
            <Select>
              <Option value="vi">Tiếng Việt (VI)</Option>
              <Option value="en">English (EN)</Option>
            </Select>
          </Form.Item>

          <Form.Item name="show_trigger_icon" label={translate('showTriggerIcon', currentLang)} valuePropName="checked" tooltip={translate('showTriggerIconDesc', currentLang)}>
            <Switch />
          </Form.Item>

          <Divider />
          <Title level={4}>{translate('aiProviderTitle', currentLang)}</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {translate('aiProviderDesc', currentLang)}
          </Text>

          <Form.Item name="ai_provider" label={translate('selectProvider', currentLang)}>
            <Select>
              <Option value="none">{translate('providerNone', currentLang)}</Option>
              <Option value="gemini">{translate('providerGemini', currentLang)}</Option>
              <Option value="openai">{translate('providerOpenAI', currentLang)}</Option>
              <Option value="ollama">{translate('providerOllama', currentLang)}</Option>
            </Select>
          </Form.Item>

          {aiProvider === 'gemini' && (
            <>
              <Form.Item name="gemini_api_key" label={`${translate('providerGemini', currentLang)} ${translate('apiKeyLabel', currentLang)}`} rules={[{ required: true }]}>
                <Input.Password placeholder="Enter your Gemini API Key" />
              </Form.Item>
              <Form.Item name="gemini_model" label={currentLang === 'vi' ? 'Mô hình Gemini (Model)' : 'Gemini Model'} initialValue="gemini-2.5-flash-lite">
                <Select>
                  <Option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Free Tier, Fast)</Option>
                  <Option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Free Tier, Newest)</Option>
                  <Option value="gemini-2.0-flash">Gemini 2.0 Flash (Stable, requires billing)</Option>
                  <Option value="gemini-3.5-flash">Gemini 3.5 Flash (Production, requires billing)</Option>
                  <Option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced Reasoning, requires billing)</Option>
                </Select>
              </Form.Item>
            </>
          )}

          {aiProvider === 'openai' && (
            <Form.Item name="openai_api_key" label={`${translate('providerOpenAI', currentLang)} ${translate('apiKeyLabel', currentLang)}`} rules={[{ required: true }]}>
              <Input.Password placeholder="Enter your OpenAI API Key" />
            </Form.Item>
          )}

          {aiProvider === 'ollama' && (
            <Form.Item name="ollama_url" label={translate('ollamaUrlLabel', currentLang)} rules={[{ required: true }]} initialValue="http://localhost:11434">
              <Input placeholder="e.g. http://localhost:11434" />
            </Form.Item>
          )}

          <Divider />
          <Title level={4}>{translate('backupTitle', currentLang)}</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {translate('backupDesc', currentLang)}
          </Text>

          <Form.Item name="github_repo" label={translate('githubRepoLabel', currentLang)} tooltip="Format: username/repo-name">
            <Input placeholder="e.g. ductnn/my-english-vocab" />
          </Form.Item>

          <Form.Item name="github_token" label={translate('githubTokenLabel', currentLang)} tooltip="Requires 'repo' scope.">
            <Input.Password placeholder="Enter GitHub Token (ghp_...)" />
          </Form.Item>

          <Form.Item style={{ marginTop: 40, marginBottom: 8, textAlign: 'center' }}>
            <Space size="large" wrap>
              <Button type="primary" htmlType="submit" icon={<Save size={16} />} loading={loading} size="large" style={{ background: '#8b5cf6', width: 180, fontWeight: 600, borderRadius: 24 }}>
                {translate('btnSaveSettings', currentLang)}
              </Button>
              <Button onClick={handleSync} icon={<CloudUpload size={16} />} loading={syncing} size="large" style={{ width: 180, fontWeight: 600, borderRadius: 24, color: '#0f172a', borderColor: '#cbd5e1' }}>
                {translate('btnSyncGithub', currentLang)}
              </Button>
              <Button onClick={handlePull} icon={<CloudDownload size={16} />} loading={pulling} size="large" style={{ width: 180, fontWeight: 600, borderRadius: 24, color: '#0f172a', borderColor: '#cbd5e1' }}>
                {translate('btnPullGithub', currentLang)}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};
