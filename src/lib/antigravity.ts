import { companionRequest } from './chatgptCompanion';
import type { Settings } from './settings';
import type { AIMessage } from './translator';

export interface AntigravityStatus {
  status: 'connected' | 'connecting' | 'disconnected';
  email?: string;
  projectId?: string;
  error?: string;
}

export async function beginAntigravityLogin(): Promise<string> {
  return (await companionRequest<{ url: string }>('/antigravity/login')).url;
}

export async function getAntigravityStatus(): Promise<AntigravityStatus> {
  return companionRequest<AntigravityStatus>('/antigravity/status');
}

export async function disconnectAntigravity(): Promise<void> {
  await companionRequest<{ ok: true }>('/antigravity/logout');
}

export async function listAntigravityModels(): Promise<{ value: string; label: string }[]> {
  return (await companionRequest<{ models: { value: string; label: string }[] }>('/antigravity/models')).models;
}

export async function callAntigravity(settings: Partial<Settings>, messages: AIMessage[]): Promise<string> {
  const model = settings.antigravity_model?.trim() || 'gemini-3.8-flash';
  if (!/^(?:ag\/)?[a-zA-Z0-9._-]+$/.test(model)) throw new Error('Model Antigravity không hợp lệ.');
  const result = await companionRequest<{ text: string }>('/antigravity/response', {
    model: model.replace(/^ag\//, ''),
    messages,
  });
  if (!result.text?.trim()) throw new Error('Antigravity không trả về nội dung.');
  return result.text;
}
