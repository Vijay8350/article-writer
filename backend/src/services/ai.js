import * as gemini from './gemini.js';
import * as deepseek from './deepseek.js';
import * as aiKeys from '../repositories/aiKeys.js';

// Per-workspace AI routing: which provider handles each task and which DeepSeek
// model to call. Anything the workspace hasn't set falls back to DEFAULTS.
export const PROVIDERS = ['gemini', 'deepseek'];
export const TASKS = ['article', 'enhance', 'businessDna'];

const DEFAULTS = {
  providers: { article: 'gemini', enhance: 'gemini', businessDna: 'gemini' },
  deepseekModel: deepseek.DEFAULT_MODEL,
};

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export function withDefaults(saved = {}) {
  const providers = { ...DEFAULTS.providers };
  for (const task of TASKS) {
    if (PROVIDERS.includes(saved.providers?.[task])) providers[task] = saved.providers[task];
  }
  return { providers, deepseekModel: saved.deepseekModel || DEFAULTS.deepseekModel };
}

// Validates a settings payload from the client; throws a 400 on bad input.
export function normalizeSettings(input = {}) {
  const providers = {};
  for (const task of TASKS) {
    const provider = input.providers?.[task];
    if (provider === undefined) continue;
    if (!PROVIDERS.includes(provider)) throw badRequest(`Unknown AI provider "${provider}" for ${task}`);
    providers[task] = provider;
  }
  const model = String(input.deepseekModel ?? '').trim();
  if (model && !/^[\w.:/-]{1,80}$/.test(model)) throw badRequest('Invalid DeepSeek model name');
  return { providers, ...(model ? { deepseekModel: model } : {}) };
}

// Picks the provider for `task` (an explicit per-request choice wins over the
// workspace default) plus the credentials to call it with. `apiKey` undefined
// means the service falls back to the platform key.
export async function resolveAi(workspaceId, task, requested) {
  const [keys, saved] = await Promise.all([aiKeys.getKeys(workspaceId), aiKeys.getSettings(workspaceId)]);
  const settings = withDefaults(saved);
  const provider = PROVIDERS.includes(requested) ? requested : settings.providers[task];
  return provider === 'deepseek'
    ? { provider, service: deepseek, apiKey: keys.deepseekKey || undefined, model: settings.deepseekModel }
    : { provider, service: gemini, apiKey: keys.geminiKey || undefined };
}
