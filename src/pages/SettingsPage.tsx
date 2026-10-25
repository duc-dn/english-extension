import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Button, Select, AutoComplete, Card, Typography, message, Divider, Space, Modal, Switch, Alert, Tag, Segmented, Row, Col } from 'antd';
import { Save, CloudUpload, CloudDownload, Sparkles, ExternalLink, RefreshCw, Zap, Key, Bell, CheckSquare } from 'lucide-react';
import { getSettings, saveSettings, useSettings, type Settings } from '../lib/settings';
import { syncToGithub, syncFromGithub } from '../lib/github';
import { translate } from '../lib/localization';
import { testAIConnection, type AITestResult } from '../lib/translator';
import { beginChatGPTLogin, checkChatGPTConnection, listChatGPTModels, savePairingCode, type ChatGPTStatus } from '../lib/chatgptCompanion';
import { beginAntigravityLogin, disconnectAntigravity, getAntigravityStatus, listAntigravityModels, type AntigravityStatus } from '../lib/antigravity';
import { pingDeepSeekProxy, type DeepSeekProxyHealth } from '../lib/deepseekProxy';
import { pomodoroManager, usePomodoroTimer } from '../lib/pomodoro';

const { Title, Text } = Typography;
const { Option } = Select;

export const SettingsPage: React.FC = () => {
  const [form] = Form.useForm<Settings>();
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AITestResult | null>(null);
  const [webModelsList, setWebModelsList] = useState<{ value: string; label: string }[]>([]);
  const [pairingCode, setPairingCode] = useState('');
  const [chatGPTStatus, setChatGPTStatus] = useState<ChatGPTStatus | null>(null);
  const [antigravityStatus, setAntigravityStatus] = useState<AntigravityStatus | null>(null);
  const [antigravityModels, setAntigravityModels] = useState<{ value: string; label: string }[]>([]);
  const [antigravityBusy, setAntigravityBusy] = useState(false);
  const [aiProvider, setAiProvider] = useState<Settings['ai_provider']>('none');
  const [openaiAuthType, setOpenaiAuthType] = useState<'chatgpt_web' | 'api_key'>('chatgpt_web');
  const [deepseekAuthType, setDeepseekAuthType] = useState<'api_key' | 'web_token' | 'local_proxy'>('local_proxy');
  const [proxyHealth, setProxyHealth] = useState<DeepSeekProxyHealth | null>(null);
  const [isPingingProxy, setIsPingingProxy] = useState(false);
  const [checkingAntigravity, setCheckingAntigravity] = useState(false);

  const settings = useSettings();
  const pomodoroState = usePomodoroTimer();
  const currentLang = settings.language || 'vi';
  const nativeInstallCommand = `npm run ai:install-host -- ${typeof chrome !== 'undefined' ? chrome.runtime.id : '<extension-id>'}`;

  const isDark = settings.theme === 'dark' || (
    settings.theme === 'system' && 
    typeof window !== 'undefined' && 
    window.matchMedia && 
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    if (aiProvider !== 'deepseek' || deepseekAuthType !== 'local_proxy') return;
    setProxyHealth(null);
    pingDeepSeekProxy(settings.deepseek_proxy_url).then(setProxyHealth);
  }, [aiProvider, deepseekAuthType, settings.deepseek_proxy_url]);

  const handleFetchChatGPTToken = async (newAccount = false) => {
    setFetchingToken(true);
    try {
      if (pairingCode.trim()) await savePairingCode(pairingCode);
      const url = await beginChatGPTLogin(newAccount);
      await chrome.tabs.create({ url });
      message.info(currentLang === 'vi' ? 'Hoàn tất đăng nhập trong tab mới, sau đó bấm Kiểm tra kết nối.' : 'Finish signing in in the new tab, then check the connection.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : translate('chatgptFetchFailed', currentLang));
    } finally {
      setFetchingToken(false);
    }
  };

  const handleFetchChatGPTModels = async () => {
    setFetchingModels(true);
    try {
      const models = await listChatGPTModels();
      if (models && models.length > 0) {
        setWebModelsList(models);
        if (!models.some((model) => model.value === form.getFieldValue('chatgpt_model'))) {
          form.setFieldValue('chatgpt_model', models[0].value);
          await saveSettings({ chatgpt_model: models[0].value });
        }
        message.success(currentLang === 'vi' ? `Đã tìm thấy ${models.length} model từ ChatGPT!` : `Found ${models.length} models from ChatGPT!`);
      } else {
        message.warning(currentLang === 'vi' ? 'Không thể lấy danh sách model tự động. Hãy chọn hoặc tự nhập tên model bên dưới.' : 'Could not fetch models automatically. Please select or type below.');
      }
    } catch {
      message.error(currentLang === 'vi' ? 'Lỗi khi tải danh sách model.' : 'Error loading models.');
    } finally {
      setFetchingModels(false);
    }
  };

  const handleCheckChatGPT = async () => {
    try {
      if (pairingCode.trim()) await savePairingCode(pairingCode);
      const status = await checkChatGPTConnection();
      setChatGPTStatus(status);
      if (status.error) message.error(status.error);
      else if (status.status === 'connected') message.success(currentLang === 'vi' ? 'Đã kết nối ChatGPT.' : 'ChatGPT connected.');
    } catch (error) { message.error(error instanceof Error ? error.message : 'Connection failed'); }
  };

  const handleAntigravityLogin = async () => {
    setAntigravityBusy(true);
    try {
      const url = await beginAntigravityLogin();
      await chrome.tabs.create({ url });
      setAntigravityStatus({ status: 'connecting' });
      message.info(currentLang === 'vi' ? 'Hoàn tất đăng nhập Google trong tab vừa mở.' : 'Finish Google sign-in in the new tab.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally { setAntigravityBusy(false); }
  };

  const handleAntigravityModels = async () => {
    setAntigravityBusy(true);
    try {
      const models = await listAntigravityModels();
      setAntigravityModels(models);
      message.success(currentLang === 'vi' ? `Đã tải ${models.length} model.` : `Loaded ${models.length} models.`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    } finally { setAntigravityBusy(false); }
  };

  const handleCheckAntigravity = async () => {
    setCheckingAntigravity(true);
    try { setAntigravityStatus(await getAntigravityStatus()); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
    finally { setCheckingAntigravity(false); }
  };

  useEffect(() => {
    if (aiProvider !== 'antigravity') return;
    let active = true;
    const check = () => getAntigravityStatus().then(status => {
      if (active) setAntigravityStatus(status);
    }).catch(error => {
      if (active) setAntigravityStatus({ status: 'disconnected', error: error instanceof Error ? error.message : String(error) });
    });
    check();
    const timer = setInterval(check, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [aiProvider]);

  const handleTestAI = async () => {
    const currentValues = form.getFieldsValue();
    setTestingAi(true);
    setAiTestResult(null);
    try {
      const res = await testAIConnection(currentValues);
      setAiTestResult(res);
      if (res.success) {
        // Automatically persist the tested and working AI configuration!
        await saveSettings(currentValues);
        message.success(currentLang === 'vi' 
          ? `${res.message} (Đã tự động lưu cấu hình AI thành công!)` 
          : `${res.message} (AI settings auto-saved successfully!)`);
      } else {
        message.error(res.message);
      }
    } catch (err) {
      const errorResult: AITestResult = {
        success: false,
        message: err instanceof Error ? err.message : translate('testAiFailed', currentLang)
      };
      setAiTestResult(errorResult);
      message.error(errorResult.message);
    } finally {
      setTestingAi(false);
    }
  };

  const handleTestTodoNotification = () => {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create('test-todo-notification', {
        type: 'basic',
        iconUrl: 'logo.png',
        title: currentLang === 'vi' ? '⏰ Nhắc nhở EngExt Pro' : '⏰ EngExt Pro Task Reminder',
        message: currentLang === 'vi' 
          ? 'Hệ thống thông báo nhắc nhở nhiệm vụ học tập đang hoạt động tốt!' 
          : 'Task reminder notification system is active and working!',
        priority: 2,
      });
      message.success(translate('todoTestNotificationSuccess', currentLang));
    } else {
      message.info(currentLang === 'vi' ? 'Thông báo trình duyệt hoạt động khi cài đặt extension.' : 'Browser notifications run within Chrome extension.');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const data = await getSettings();
      form.setFieldsValue(data);
      setAiProvider(data.ai_provider);
      setOpenaiAuthType(data.openai_auth_type || (data.openai_api_key ? 'api_key' : 'chatgpt_web'));
      setDeepseekAuthType(data.deepseek_auth_type || 'api_key');
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
    } catch {
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
    } catch (error) {
      message.error(error instanceof Error ? error.message : translate('syncFailed', currentLang));
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
        } catch (error) {
          message.error(error instanceof Error ? error.message : translate('pullFailed', currentLang));
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
      
      <div className="bento-card" style={{ padding: '24px 28px' }}>
        <Form 
          form={form} 
          layout="vertical" 
          onFinish={onFinish}
          onValuesChange={(changedValues) => {
            if (changedValues.ai_provider) {
              setAiProvider(changedValues.ai_provider);
            }
            if (changedValues.openai_auth_type) {
              setOpenaiAuthType(changedValues.openai_auth_type);
            }
            if (changedValues.deepseek_auth_type) {
              setDeepseekAuthType(changedValues.deepseek_auth_type);
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

          <Form.Item
            name="enable_passive_highlight"
            label={currentLang === 'vi' ? 'Gạch chân mờ từ đang học khi đọc web (Passive Highlighting)' : 'Subtle dashed highlight for learning words'}
            valuePropName="checked"
            tooltip={currentLang === 'vi' ? 'Tự động gạch chân nét đứt mờ các từ bạn đang học trong SRS khi lướt web. Rê chuột vào để xem nghĩa nhanh.' : 'Underline words you are learning in SRS with a subtle dashed line when browsing.'}
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="enable_writing_assistant"
            label={currentLang === 'vi' ? 'Trợ lý AI viết tiếng Anh (Writing Assistant)' : 'AI Writing Assistant'}
            valuePropName="checked"
            tooltip={currentLang === 'vi' ? 'Hiển thị nút AI Polish để soát lỗi và nâng cấp câu văn khi gõ trên web.' : 'Show AI Polish button to check grammar and polish text in inputs/textareas.'}
          >
            <Switch />
          </Form.Item>

          <Form.Item
            name="daily_review_goal"
            label={currentLang === 'vi' ? 'Mục tiêu ôn tập mỗi ngày' : 'Daily review goal'}
            rules={[{ type: 'number', min: 1, max: 100, message: currentLang === 'vi' ? 'Chọn từ 1 đến 100.' : 'Choose 1 to 100.' }]}
          >
            <InputNumber min={1} max={100} style={{ width: 160 }} addonAfter={currentLang === 'vi' ? 'lượt ôn' : 'reviews'} />
          </Form.Item>

          <Divider />
          <Title level={4} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>🍅</span> {translate('pomodoroTimer', currentLang)}
          </Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {currentLang === 'vi'
              ? 'Tùy chỉnh thời lượng học tập trung và nghỉ ngơi theo phương pháp Pomodoro.'
              : 'Customize focused study and break durations following the Pomodoro technique.'}
          </Text>

          <Row gutter={[16, 16]} style={{ marginBottom: 12 }}>
            <Col xs={24} sm={8}>
              <div>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                  {translate('pomodoroFocus', currentLang)}
                </Text>
                <InputNumber
                  min={1}
                  max={120}
                  value={Math.round(pomodoroState.settings.focusDuration / 60)}
                  onChange={(val) => {
                    if (val) pomodoroManager.updateSettings({ focusDuration: val * 60 });
                  }}
                  addonAfter={currentLang === 'vi' ? 'phút' : 'mins'}
                  style={{ width: '100%' }}
                />
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                  {translate('pomodoroShortBreak', currentLang)}
                </Text>
                <InputNumber
                  min={1}
                  max={60}
                  value={Math.round(pomodoroState.settings.shortBreakDuration / 60)}
                  onChange={(val) => {
                    if (val) pomodoroManager.updateSettings({ shortBreakDuration: val * 60 });
                  }}
                  addonAfter={currentLang === 'vi' ? 'phút' : 'mins'}
                  style={{ width: '100%' }}
                />
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div>
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                  {translate('pomodoroLongBreak', currentLang)}
                </Text>
                <InputNumber
                  min={1}
                  max={60}
                  value={Math.round(pomodoroState.settings.longBreakDuration / 60)}
                  onChange={(val) => {
                    if (val) pomodoroManager.updateSettings({ longBreakDuration: val * 60 });
                  }}
                  addonAfter={currentLang === 'vi' ? 'phút' : 'mins'}
                  style={{ width: '100%' }}
                />
              </div>
            </Col>
          </Row>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                checked={pomodoroState.settings.soundEnabled}
                onChange={(checked) => pomodoroManager.updateSettings({ soundEnabled: checked })}
              />
              <Text>{translate('pomodoroSoundToggle', currentLang)}</Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch
                checked={pomodoroState.settings.autoStartNext}
                onChange={(checked) => pomodoroManager.updateSettings({ autoStartNext: checked })}
              />
              <Text>{currentLang === 'vi' ? 'Tự động bắt đầu phiên tiếp theo' : 'Auto-start next session'}</Text>
            </div>
          </div>

          <Divider />
          <Title level={4} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckSquare size={20} color="#0284c7" /> {translate('todoReminderSettingsTitle', currentLang)}
          </Title>

          <Row gutter={[24, 16]} style={{ marginBottom: 12 }}>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="enable_todo_reminders" 
                label={translate('todoEnableReminders', currentLang)} 
                valuePropName="checked"
                extra={translate('todoEnableRemindersDesc', currentLang)}
              >
                <Switch />
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item 
                name="show_todo_badge" 
                label={translate('todoShowBadge', currentLang)} 
                valuePropName="checked"
                extra={translate('todoShowBadgeDesc', currentLang)}
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[24, 16]} style={{ alignItems: 'flex-start' }}>
            <Col xs={24} sm={12}>
              <Form.Item 
                name="todo_reminder_interval" 
                label={translate('todoReminderInterval', currentLang)}
              >
                <Select style={{ width: '100%' }}>
                  <Option value={10}>{translate('todoReminderIntervalMinutes', currentLang, { minutes: 10 })}</Option>
                  <Option value={15}>{translate('todoReminderIntervalMinutes', currentLang, { minutes: 15 })}</Option>
                  <Option value={30}>{translate('todoReminderIntervalMinutes', currentLang, { minutes: 30 })}</Option>
                  <Option value={60}>{translate('todoReminderIntervalMinutes', currentLang, { minutes: 60 })}</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col xs={24} sm={12}>
              <div style={{ paddingTop: 30 }}>
                <Button 
                  icon={<Bell size={15} color="#8b5cf6" />} 
                  onClick={handleTestTodoNotification}
                  style={{ borderRadius: 8, fontWeight: 600 }}
                >
                  {translate('todoTestNotification', currentLang)}
                </Button>
              </div>
            </Col>
          </Row>

          <Divider />
          <Title level={4}>{translate('aiProviderTitle', currentLang)}</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {translate('aiProviderDesc', currentLang)}
          </Text>

          <Form.Item name="ai_provider" label={translate('selectProvider', currentLang)}>
            <Select>
              <Option value="none">{translate('providerNone', currentLang)}</Option>
              <Option value="gemini">{translate('providerGemini', currentLang)}</Option>
              <Option value="antigravity">Antigravity (Google OAuth)</Option>
              <Option value="deepseek">{translate('providerDeepSeek', currentLang)}</Option>
              <Option value="openai">{translate('providerOpenAI', currentLang)}</Option>
              <Option value="ollama">{translate('providerOllama', currentLang)}</Option>
            </Select>
          </Form.Item>
          {aiProvider !== settings.ai_provider && <Alert
            type="info"
            showIcon
            style={{ marginTop: -8, marginBottom: 20 }}
            message={currentLang === 'vi'
              ? 'Bạn đã chọn provider khác. Nhấn “Lưu cấu hình” bên dưới để áp dụng.'
              : 'You selected a different provider. Select “Save Config” below to apply it.'}
          />}

          {aiProvider === 'antigravity' && (
            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
              <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
                {currentLang === 'vi'
                  ? 'Đăng nhập Google để dùng Antigravity cho bản dịch AI.'
                  : 'Sign in with Google to use Antigravity for AI translations.'}
              </Text>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <Space wrap>
                  <Tag color={antigravityStatus?.status === 'connected' ? 'success' : antigravityStatus?.status === 'connecting' ? 'processing' : 'default'} style={{ margin: 0 }}>
                    {antigravityStatus?.status === 'connected'
                      ? (currentLang === 'vi' ? 'Đã kết nối' : 'Connected')
                      : antigravityStatus?.status === 'connecting'
                        ? (currentLang === 'vi' ? 'Đang đăng nhập' : 'Signing in')
                        : (currentLang === 'vi' ? 'Chưa kết nối' : 'Not connected')}
                  </Tag>
                  {antigravityStatus?.status === 'connected' && antigravityStatus.email && <Text>{antigravityStatus.email}</Text>}
                </Space>
                <Space wrap>
                  {antigravityStatus?.status === 'connected' ? (
                    <Button danger onClick={async () => {
                      try { await disconnectAntigravity(); setAntigravityStatus({ status: 'disconnected' }); setAntigravityModels([]); }
                      catch (error) { message.error(String(error)); }
                    }}>{currentLang === 'vi' ? 'Ngắt kết nối' : 'Disconnect'}</Button>
                  ) : antigravityStatus?.status !== 'connecting' ? (
                    <Button type="primary" loading={antigravityBusy} onClick={handleAntigravityLogin}>
                      {currentLang === 'vi' ? 'Kết nối Google' : 'Connect Google'}
                    </Button>
                  ) : null}
                  <Button icon={<RefreshCw size={14} />} loading={checkingAntigravity} onClick={handleCheckAntigravity} aria-label={currentLang === 'vi' ? 'Làm mới trạng thái kết nối' : 'Refresh connection status'} />
                </Space>
              </div>
              {antigravityStatus?.error && <Alert type="error" showIcon message={antigravityStatus.error} style={{ marginBottom: 20 }} />}
              <Form.Item
                name="antigravity_model"
                label={currentLang === 'vi' ? 'Model Antigravity' : 'Antigravity model'}
                rules={[{ required: true, whitespace: true }, { pattern: /^(?:ag\/)?[a-zA-Z0-9._-]+$/, message: 'Ví dụ: gemini-3.8-flash' }]}
                extra={currentLang === 'vi' ? 'Chọn từ danh sách hoặc nhập tên model.' : 'Choose from the list or enter a model name.'}
                style={{ marginBottom: 12 }}
              >
                <AutoComplete options={antigravityModels} placeholder="gemini-3.8-flash" disabled={antigravityStatus?.status !== 'connected'} />
              </Form.Item>
              <Button size="small" icon={<RefreshCw size={13} />} loading={antigravityBusy} onClick={handleAntigravityModels} disabled={antigravityStatus?.status !== 'connected'}>
                {currentLang === 'vi' ? 'Tải danh sách model' : 'Load available models'}
              </Button>
              {antigravityStatus?.status !== 'connected' && <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer' }}>{currentLang === 'vi' ? 'Cần hỗ trợ kết nối?' : 'Need help connecting?'}</summary>
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  {currentLang === 'vi' ? 'Nếu companion chưa được cài, chạy lệnh sau một lần rồi tải lại extension:' : 'If the companion is not installed, run this once and reload the extension:'}
                </Text>
                <Text code copyable={{ text: nativeInstallCommand }}>{nativeInstallCommand}</Text>
              </details>}
            </Card>
          )}

          {aiProvider === 'gemini' && (
            <>
              <Form.Item
                name="gemini_api_key"
                label={`${translate('providerGemini', currentLang)} ${translate('apiKeyLabel', currentLang)}`}
                rules={[{ required: true }]}
                extra={
                  <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
                    {currentLang === 'vi' ? (
                      <>
                        💡 Lấy API Key miễn phí tại{' '}
                        <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
                          Google AI Studio (aistudio.google.com) ↗
                        </a>{' '}
                        (Hoàn toàn miễn phí, 1,500 lượt/ngày, không cần thẻ tín dụng)
                      </>
                    ) : (
                      <>
                        💡 Get a free API Key at{' '}
                        <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
                          Google AI Studio (aistudio.google.com) ↗
                        </a>{' '}
                        (Free tier, 1,500 requests/day, no credit card required)
                      </>
                    )}
                  </div>
                }
              >
                <Input.Password placeholder="Enter your Gemini API Key" />
              </Form.Item>
              <Form.Item name="gemini_model" label={currentLang === 'vi' ? 'Mô hình Gemini (Model)' : 'Gemini Model'} initialValue="gemini-2.5-flash-lite">
                <Select>
                  <Option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite (Free Tier - Siêu nhanh & Nhẹ ⚡)</Option>
                  <Option value="gemini-2.5-flash">Gemini 2.5 Flash (Free Tier - Khuyên dùng, Thông minh & Chuẩn xác ✨)</Option>
                  <Option value="gemini-2.0-flash">Gemini 2.0 Flash (Free Tier - Rất ổn định)</Option>
                  <Option value="gemini-1.5-flash">Gemini 1.5 Flash (Free Tier - Tiêu chuẩn)</Option>
                  <Option value="gemini-2.5-pro">Gemini 2.5 Pro (Nâng cao - Dịch chuyên sâu & Suy luận)</Option>
                </Select>
              </Form.Item>
            </>
          )}

          {aiProvider === 'deepseek' && (
            <Card style={{ background: isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.04)', border: isDark ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(59, 130, 246, 0.2)', marginBottom: 24, borderRadius: 12 }}>
              <Form.Item name="deepseek_auth_type" label={translate('deepseekAuthType', currentLang)} style={{ marginBottom: 16 }}>
                <Segmented
                  block
                  value={deepseekAuthType}
                  onChange={(val) => {
                    const auth = val as 'api_key' | 'web_token' | 'local_proxy';
                    setDeepseekAuthType(auth);
                    form.setFieldsValue({ deepseek_auth_type: auth });
                  }}
                  options={[
                    {
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
                          <Zap size={15} color="#2563eb" />
                          {translate('authTypeDeepSeekLocalProxy', currentLang)}
                        </span>
                      ),
                      value: 'local_proxy'
                    },
                    {
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
                          <Key size={15} color="#3b82f6" />
                          {translate('authTypeDeepSeekApiKey', currentLang)}
                        </span>
                      ),
                      value: 'api_key'
                    },
                    {
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
                          <Sparkles size={15} color="#0284c7" />
                          {translate('authTypeDeepSeekWeb', currentLang)}
                        </span>
                      ),
                      value: 'web_token'
                    }
                  ]}
                />
              </Form.Item>

              {deepseekAuthType === 'local_proxy' && (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <Space wrap>
                      <Text strong>{translate('deepseekProxyQuickCardTitle', currentLang)}</Text>
                      <Tag color={proxyHealth?.online ? 'success' : proxyHealth ? 'error' : 'default'} style={{ margin: 0 }}>
                        {proxyHealth?.online ? `Online (${proxyHealth.latencyMs}ms)` : proxyHealth ? 'Offline' : (currentLang === 'vi' ? 'Đang kiểm tra' : 'Checking')}
                      </Tag>
                    </Space>
                    <Button
                      size="small"
                      icon={<RefreshCw size={13} />}
                      loading={isPingingProxy}
                      onClick={async () => {
                        setIsPingingProxy(true);
                        try { setProxyHealth(await pingDeepSeekProxy(form.getFieldValue('deepseek_proxy_url') || settings.deepseek_proxy_url)); }
                        finally { setIsPingingProxy(false); }
                      }}
                    >
                      {translate('deepseekProxyPingBtn', currentLang)}
                    </Button>
                  </div>
                  <Text type="secondary" style={{ fontSize: 13, lineHeight: '1.5', display: 'block' }}>
                    {translate('deepseekProxyDesc', currentLang)}
                  </Text>
                  <Form.Item
                    name="deepseek_proxy_url"
                    label={translate('deepseekProxyUrlLabel', currentLang)}
                    rules={[{ required: true }]}
                    initialValue="http://127.0.0.1:9655"
                    extra={
                      <div style={{ marginTop: 6, fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>
                        {currentLang === 'vi' ? (
                          <>
                            💡 Khởi động server bằng lệnh: <code style={{ color: '#60a5fa', fontWeight: 600 }}>ALLOW_BROWSER_ORIGIN=1 npm start</code> trong thư mục <b>FreeDeepseekAPI</b>.
                          </>
                        ) : (
                          <>
                            💡 Start server with: <code style={{ color: '#60a5fa', fontWeight: 600 }}>ALLOW_BROWSER_ORIGIN=1 npm start</code> inside <b>FreeDeepseekAPI</b>.
                          </>
                        )}
                      </div>
                    }
                  >
                    <Input placeholder="http://127.0.0.1:9655" />
                  </Form.Item>
                  <Form.Item name="deepseek_model" label={currentLang === 'vi' ? 'Mô hình DeepSeek (Model)' : 'DeepSeek Model'} initialValue="deepseek-chat" style={{ marginBottom: 0 }}>
                    <Select>
                      <Option value="deepseek-chat">DeepSeek-V3 / Flash (deepseek-chat - Nhanh & Thông minh ⚡)</Option>
                      <Option value="deepseek-reasoner">DeepSeek-R1 (deepseek-reasoner - Suy luận sâu & Phân tích ngữ pháp 🧠)</Option>
                    </Select>
                  </Form.Item>
                </Space>
              )}

              {deepseekAuthType === 'api_key' && (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Form.Item
                    name="deepseek_api_key"
                    label={`${translate('providerDeepSeek', currentLang)} ${translate('apiKeyLabel', currentLang)}`}
                    rules={[{ required: true }]}
                    extra={
                      <div style={{ marginTop: 6, fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>
                        {currentLang === 'vi' ? (
                          <>
                            💡 Lấy API Key tại{' '}
                            <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontWeight: 600 }}>
                              DeepSeek Open Platform (platform.deepseek.com) ↗
                            </a>{' '}
                            (Chi phí siêu rẻ ~$0.14 - $0.28 / 1 triệu tokens, tốc độ phản hồi tức thì)
                          </>
                        ) : (
                          <>
                            💡 Get API Key at{' '}
                            <a href="https://platform.deepseek.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontWeight: 600 }}>
                              DeepSeek Open Platform (platform.deepseek.com) ↗
                            </a>{' '}
                            (Extremely cheap ~$0.14 - $0.28 / 1M tokens, ultra-fast responses)
                          </>
                        )}
                      </div>
                    }
                  >
                    <Input.Password placeholder="Enter your DeepSeek API Key (sk-...)" />
                  </Form.Item>
                  <Form.Item name="deepseek_model" label={currentLang === 'vi' ? 'Mô hình DeepSeek (Model)' : 'DeepSeek Model'} initialValue="deepseek-chat" style={{ marginBottom: 0 }}>
                    <Select>
                      <Option value="deepseek-chat">DeepSeek-V3 (deepseek-chat - Siêu nhanh, Khuyên dùng ⚡)</Option>
                      <Option value="deepseek-reasoner">DeepSeek-R1 (deepseek-reasoner - Suy luận sâu & Phân tích ngữ pháp 🧠)</Option>
                    </Select>
                  </Form.Item>
                </Space>
              )}

              {deepseekAuthType === 'web_token' && (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Text type="secondary" style={{ fontSize: 13, lineHeight: '1.5', display: 'block' }}>
                    {translate('deepseekWebTokenDesc', currentLang)}
                  </Text>
                  <Form.Item
                    name="deepseek_web_token"
                    label="DeepSeek User/Bearer Token"
                    rules={[{ required: true }]}
                    extra={
                      <div style={{ marginTop: 6, fontSize: 13, color: isDark ? '#94a3b8' : '#64748b' }}>
                        {currentLang === 'vi' ? (
                          <>
                            🌐 Mở tab{' '}
                            <a href="https://chat.deepseek.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontWeight: 600 }}>
                              chat.deepseek.com ↗
                            </a>{' '}
                            → F12 (DevTools) → Application → Local Storage / Cookies → Sao chép token xác thực.
                          </>
                        ) : (
                          <>
                            🌐 Open{' '}
                            <a href="https://chat.deepseek.com/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontWeight: 600 }}>
                              chat.deepseek.com ↗
                            </a>{' '}
                            → F12 (DevTools) → Application → Local Storage / Cookies → Copy auth token.
                          </>
                        )}
                      </div>
                    }
                  >
                    <Input.Password placeholder="Enter userToken or Bearer token" />
                  </Form.Item>
                  <Form.Item name="deepseek_model" label={currentLang === 'vi' ? 'Mô hình DeepSeek (Model)' : 'DeepSeek Model'} initialValue="deepseek-chat" style={{ marginBottom: 0 }}>
                    <Select>
                      <Option value="deepseek-chat">DeepSeek-V3 (deepseek-chat)</Option>
                      <Option value="deepseek-reasoner">DeepSeek-R1 (deepseek-reasoner)</Option>
                    </Select>
                  </Form.Item>
                </Space>
              )}
            </Card>
          )}

          {(aiProvider === 'openai' || aiProvider === 'chatgpt_web') && (
            <Card style={{ background: isDark ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.04)', border: isDark ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(16, 185, 129, 0.2)', marginBottom: 24, borderRadius: 12 }}>
              <Form.Item name="openai_auth_type" label={translate('openaiAuthType', currentLang)} style={{ marginBottom: 16 }}>
                <Segmented
                  block
                  value={openaiAuthType}
                  onChange={(val) => {
                    const auth = val as 'chatgpt_web' | 'api_key';
                    setOpenaiAuthType(auth);
                    form.setFieldsValue({ openai_auth_type: auth });
                  }}
                  options={[
                    {
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
                          <Sparkles size={15} color="#10b981" />
                          {translate('authTypeChatGPTWeb', currentLang)}
                        </span>
                      ),
                      value: 'chatgpt_web'
                    },
                    {
                      label: (
                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}>
                          <Key size={15} color="#8b5cf6" />
                          {translate('authTypeApiKey', currentLang)}
                        </span>
                      ),
                      value: 'api_key'
                    }
                  ]}
                />
              </Form.Item>

              {openaiAuthType === 'chatgpt_web' ? (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Text type="secondary" style={{ fontSize: 13, lineHeight: '1.5', display: 'block' }}>
                    {translate('chatgptTokenDesc', currentLang)}
                  </Text>
                  <Text code copyable={{ text: nativeInstallCommand }}>{nativeInstallCommand}</Text>
                  <Alert
                    type="info"
                    showIcon
                    message={currentLang === 'vi' ? 'Tài khoản tổ chức bị chặn?' : 'Organization access denied?'}
                    description={currentLang === 'vi'
                      ? <>Quản trị viên cấp tổ chức cần cho phép ứng dụng trong OpenAI Admin Console → External access. Bạn cũng có thể chọn “Đăng nhập tài khoản khác” bằng tài khoản cá nhân đủ điều kiện. <a href="https://help.openai.com/en/articles/20001410-sign-in-with-chatgpt" target="_blank" rel="noreferrer">Hướng dẫn OpenAI</a>.</>
                      : <>A global admin must allow the app in OpenAI Admin Console → External access. You can also choose “Use another account” with an eligible personal account. <a href="https://help.openai.com/en/articles/20001410-sign-in-with-chatgpt" target="_blank" rel="noreferrer">OpenAI guidance</a>.</>}
                  />
                  <details>
                    <summary>{currentLang === 'vi' ? 'Kết nối thủ công (tùy chọn)' : 'Manual connection (optional)'}</summary>
                    <Text type="secondary">{currentLang === 'vi' ? 'Chạy npm run chatgpt:companion rồi nhập mã ghép nối:' : 'Run npm run chatgpt:companion and enter its pairing code:'}</Text>
                    <Input.Password
                      value={pairingCode}
                      onChange={(event) => setPairingCode(event.target.value)}
                      placeholder={currentLang === 'vi' ? 'Mã ghép nối từ Terminal' : 'Pairing code from Terminal'}
                    />
                  </details>
                  {chatGPTStatus && <Alert type={chatGPTStatus.status === 'connected' ? 'success' : 'info'} showIcon message={`${chatGPTStatus.status}${chatGPTStatus.email ? ` · ${chatGPTStatus.email}` : ''}`} />}
                  <Space wrap>
                    <Button
                      type="primary"
                      icon={<Sparkles size={14} />}
                      loading={fetchingToken}
                      onClick={() => handleFetchChatGPTToken()}
                      style={{ background: '#10b981', borderColor: '#10b981', borderRadius: 8, fontWeight: 600, height: 32, fontSize: 13 }}
                    >
                      {translate('chatgptLoginOAuthBtn', currentLang)}
                    </Button>
                    <Button loading={fetchingToken} onClick={() => handleFetchChatGPTToken(true)} style={{ borderRadius: 8, height: 32, fontSize: 13 }}>
                      {currentLang === 'vi' ? 'Đăng nhập tài khoản khác' : 'Use another account'}
                    </Button>
                    <Button onClick={handleCheckChatGPT} style={{ borderRadius: 8, height: 32, fontSize: 13 }}>
                      {currentLang === 'vi' ? 'Kiểm tra kết nối' : 'Check connection'}
                    </Button>
                    <Button
                      icon={<RefreshCw size={14} />}
                      loading={fetchingModels}
                      onClick={() => handleFetchChatGPTModels()}
                      style={{ borderRadius: 8, height: 32, fontSize: 13 }}
                    >
                      {currentLang === 'vi' ? '🔄 Tự động tải Models' : '🔄 Auto-detect Models'}
                    </Button>
                    <Button
                      icon={<ExternalLink size={14} />}
                      onClick={() => window.open('https://chatgpt.com', '_blank')}
                      style={{ borderRadius: 8, height: 32, fontSize: 13 }}
                    >
                      {translate('chatgptOpenWebBtn', currentLang)}
                    </Button>
                  </Space>
                  <Form.Item name="chatgpt_model" label={currentLang === 'vi' ? 'Mô hình ChatGPT (Model)' : 'ChatGPT Model'} style={{ marginBottom: 0 }}>
                    <Select showSearch placeholder={currentLang === 'vi' ? 'Đăng nhập rồi tải danh sách model' : 'Sign in and load models'}>
                      {webModelsList.length > 0 ? (
                        webModelsList.map(m => (
                          <Option key={m.value} value={m.value}>{m.label}</Option>
                        ))
                      ) : (
                        <Option value="gpt-6.1-sol">GPT-6.1 Sol</Option>
                      )}
                    </Select>
                  </Form.Item>
                </Space>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Form.Item name="openai_api_key" label={`${translate('providerOpenAI', currentLang)} ${translate('apiKeyLabel', currentLang)}`} rules={[{ required: true }]}>
                    <Input.Password placeholder="Enter your OpenAI API Key (sk-...)" />
                  </Form.Item>
                  <Form.Item name="openai_model" label={currentLang === 'vi' ? 'Mô hình OpenAI (Model)' : 'OpenAI Model'} initialValue="gpt-4o-mini" style={{ marginBottom: 0 }}>
                    <Select showSearch placeholder="Chọn hoặc nhập tên model...">
                      <Option value="gpt-4o-mini">GPT-4o mini (Fast & Recommended)</Option>
                      <Option value="gpt-5.6-terra-wm">GPT-5.6 Terra WM (gpt-5.6-terra-wm)</Option>
                      <Option value="gpt-5.6">GPT-5.6 (Next-Gen Model - Newest)</Option>
                      <Option value="gpt-6.0">GPT-6.0 (Flagship Model - Newest)</Option>
                      <Option value="gpt-4o">GPT-4o (Omni)</Option>
                      <Option value="gpt-4.5">GPT-4.5 (High Capability)</Option>
                      <Option value="o3-mini">o3-mini (Reasoning Model)</Option>
                      <Option value="o1">o1 (Advanced Reasoning)</Option>
                    </Select>
                  </Form.Item>
                </Space>
              )}
            </Card>
          )}

          {aiProvider === 'ollama' && (
            <Form.Item name="ollama_url" label={translate('ollamaUrlLabel', currentLang)} rules={[{ required: true }]} initialValue="http://localhost:11434">
              <Input placeholder="e.g. http://localhost:11434" />
            </Form.Item>
          )}

          {aiProvider !== 'none' && (
            <div style={{ marginTop: 8, marginBottom: 24, padding: '16px', background: isDark ? 'rgba(139, 92, 246, 0.12)' : 'rgba(139, 92, 246, 0.05)', borderRadius: 12, border: isDark ? '1px solid rgba(139, 92, 246, 0.35)' : '1px solid rgba(139, 92, 246, 0.2)' }}>
              <Space direction="vertical" style={{ width: '100%' }} size="small">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <Text strong style={{ fontSize: 14, display: 'block' }}>
                      {translate('testAiTitle', currentLang)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {translate('testAiDesc', currentLang)}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      type="primary"
                      icon={<Zap size={14} />}
                      loading={testingAi}
                      onClick={handleTestAI}
                      style={{ background: '#8b5cf6', borderColor: '#8b5cf6', borderRadius: 8, fontWeight: 600, height: 32, fontSize: 13 }}
                    >
                      {translate('testAiBtn', currentLang)}
                    </Button>
                    <Button
                      icon={<Save size={14} />}
                      loading={loading}
                      onClick={async () => {
                        const vals = form.getFieldsValue();
                        await onFinish(vals);
                      }}
                      style={{ borderRadius: 8, fontWeight: 600, height: 32, fontSize: 13 }}
                    >
                      {currentLang === 'vi' ? 'Lưu cấu hình' : 'Save Config'}
                    </Button>
                  </div>
                </div>

                {aiTestResult && (
                  <Alert
                    style={{ marginTop: 12, borderRadius: 8 }}
                    type={aiTestResult.success ? 'success' : 'error'}
                    showIcon
                    message={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontWeight: 600 }}>{aiTestResult.message}</span>
                        {aiTestResult.latencyMs !== undefined && (
                          <Tag color={aiTestResult.success ? 'green' : 'red'}>
                            {aiTestResult.latencyMs}ms
                          </Tag>
                        )}
                      </div>
                    }
                    description={
                      aiTestResult.sampleResponse ? (
                        <div style={{ marginTop: 6 }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>{translate('testAiResponse', currentLang)} </Text>
                          <Text style={{ fontSize: 13, fontStyle: 'italic', display: 'block', background: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0,0,0,0.03)', padding: '6px 10px', borderRadius: 6, marginTop: 4 }}>
                            "{aiTestResult.sampleResponse}"
                          </Text>
                        </div>
                      ) : undefined
                    }
                  />
                )}
              </Space>
            </div>
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

          <Row gutter={16}>
            <Col xs={24} sm={14}>
              <Form.Item 
                name="enable_auto_github_sync" 
                valuePropName="checked" 
                label={translate('enableAutoGithubSyncLabel', currentLang)}
                tooltip="Tự động đồng bộ toàn bộ từ vựng, ngữ pháp và tasks lên GitHub định kỳ trong nền"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item 
                name="auto_github_sync_interval_hours" 
                label={translate('autoGithubSyncIntervalLabel', currentLang)}
              >
                <Select
                  options={[
                    { value: 6, label: currentLang === 'vi' ? 'Mỗi 6 tiếng' : 'Every 6 hours' },
                    { value: 12, label: currentLang === 'vi' ? 'Mỗi 12 tiếng' : 'Every 12 hours' },
                    { value: 24, label: currentLang === 'vi' ? 'Mỗi 24 tiếng' : 'Every 24 hours' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item style={{ marginTop: 40, marginBottom: 8, textAlign: 'center' }}>
            <Space size="middle" wrap>
              <Button 
                type="primary" 
                htmlType="submit" 
                icon={<Save size={15} />} 
                loading={loading} 
                style={{ background: '#8b5cf6', minWidth: 150, height: 36, padding: '0 20px', fontWeight: 600, borderRadius: 8, fontSize: 13.5, boxShadow: '0 2px 6px rgba(139, 92, 246, 0.25)' }}
              >
                {translate('btnSaveSettings', currentLang)}
              </Button>
              <Button 
                onClick={handleSync} 
                icon={<CloudUpload size={15} />} 
                loading={syncing} 
                style={{ minWidth: 150, height: 36, padding: '0 20px', fontWeight: 600, borderRadius: 8, fontSize: 13.5, color: isDark ? '#f8fafc' : '#0f172a', borderColor: isDark ? '#334155' : '#cbd5e1' }}
              >
                {translate('btnSyncGithub', currentLang)}
              </Button>
              <Button 
                onClick={handlePull} 
                icon={<CloudDownload size={15} />} 
                loading={pulling} 
                style={{ minWidth: 150, height: 36, padding: '0 20px', fontWeight: 600, borderRadius: 8, fontSize: 13.5, color: isDark ? '#f8fafc' : '#0f172a', borderColor: isDark ? '#334155' : '#cbd5e1' }}
              >
                {translate('btnPullGithub', currentLang)}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
};
