import config from '../config/env.js';
import * as gemini from './gemini.js';
import * as deepseek from './deepseek.js';
import * as aiKeys from '../repositories/aiKeys.js';

// Per-workspace AI routing: which provider handles each task and which DeepSeek
// model to call. Anything the workspace hasn't set falls back to the defaults below.
export const PROVIDERS = ['gemini', 'deepseek'];
export const TASKS = ['article', 'enhance', 'businessDna'];
// Article images: mixed = ChatGPT + store photos, ai = ChatGPT only, products = store photos only.
export const ARTICLE_IMAGE_MODES = ['mixed', 'ai', 'products'];

const DEFAULTS = {
  provider: 'gemini',
  deepseekModel: deepseek.DEFAULT_MODEL,
  // Store photos: always available and quick, and the product's promise (your real photos).
  articleImages: 'products',
};

// Whether the shared (platform) keys work, from the check at boot. null = not known yet.
const platformHealth = { gemini: null, deepseek: null };
export function setPlatformKeyHealth(provider, ok) {
  if (provider in platformHealth) platformHealth[provider] = Boolean(ok);
}

// A workspace without a saved choice gets Gemini, unless it can't be used (no key of its
// own and the shared key is missing or refused) while DeepSeek can.
// keys: { geminiKey | hasGemini, deepseekKey | hasDeepseek } for this workspace.
function defaultProvider(keys = {}) {
  const geminiOk = Boolean(keys.geminiKey || keys.hasGemini) || (Boolean(config.gemini?.apiKey) && platformHealth.gemini !== false);
  const deepseekOk = Boolean(keys.deepseekKey || keys.hasDeepseek) || (Boolean(config.deepseek?.apiKey) && platformHealth.deepseek !== false);
  return !geminiOk && deepseekOk ? 'deepseek' : DEFAULTS.provider;
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

export function withDefaults(saved = {}, keys = {}) {
  const fallback = defaultProvider(keys);
  const providers = {};
  for (const task of TASKS) {
    providers[task] = PROVIDERS.includes(saved.providers?.[task]) ? saved.providers[task] : fallback;
  }
  return {
    providers,
    deepseekModel: saved.deepseekModel || DEFAULTS.deepseekModel,
    articleImages: ARTICLE_IMAGE_MODES.includes(saved.articleImages) ? saved.articleImages : DEFAULTS.articleImages,
  };
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
  const { articleImages } = input;
  if (articleImages !== undefined && !ARTICLE_IMAGE_MODES.includes(articleImages)) throw badRequest('Unknown article image option');
  return { providers, ...(model ? { deepseekModel: model } : {}), ...(articleImages ? { articleImages } : {}) };
}

// Picks the provider for `task` (an explicit per-request choice wins over the
// workspace default) plus the credentials to call it with. `apiKey` undefined
// means the service falls back to the platform key.
export async function resolveAi(workspaceId, task, requested) {
  const [keys, saved] = await Promise.all([aiKeys.getKeys(workspaceId), aiKeys.getSettings(workspaceId)]);
  const settings = withDefaults(saved, keys);
  const provider = PROVIDERS.includes(requested) ? requested : settings.providers[task];
  return provider === 'deepseek'
    ? { provider, service: deepseek, apiKey: keys.deepseekKey || undefined, model: settings.deepseekModel }
    : { provider, service: gemini, apiKey: keys.geminiKey || undefined };
}
