import axios from 'axios';
import config from '../config/env.js';
import { resolveAi } from './ai.js';
import * as P from '../lib/igPrompts.js';
import * as S from '../lib/igSchemas.js';

// All Instagram Studio text work (ideas, post text, Business DNA research, comment
// review) goes through DeepSeek in JSON mode, with the workspace's own key and
// model from Settings (platform key as the fallback). Model output is validated
// and the call retried when it's malformed.

// When the configured model isn't available to a key (DeepSeek renames models
// between generations), the first of these the key has is used instead.
const PREFERRED_MODELS = ['deepseek-flash', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-v4-pro', 'deepseek-reasoner'];

const errText = (e) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

class DeepSeekJson {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model;
    this.fallbackModel = null; // set once the configured model turns out not to exist
  }

  async replacementModel() {
    try {
      const { data } = await axios.get(`${config.deepseek.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 15000,
      });
      const ids = (data?.data || []).map((m) => m.id).filter(Boolean);
      if (!ids.length || ids.includes(this.model)) return null;
      return PREFERRED_MODELS.find((m) => ids.includes(m)) || ids[0];
    } catch {
      return null;
    }
  }

  // One JSON-mode chat call; returns the parsed (unvalidated) JSON.
  async chatJson(messages, temperature, timeoutMs, maxTokens) {
    const model = this.fallbackModel || this.model;
    try {
      const { data } = await axios.post(
        `${config.deepseek.baseUrl}/chat/completions`,
        {
          model,
          messages,
          temperature,
          // Reasoner models spend max_tokens on their chain of thought too.
          max_tokens: /reasoner/i.test(model) ? Math.max(maxTokens, 16000) : maxTokens,
          response_format: { type: 'json_object' },
        },
        { headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, timeout: timeoutMs },
      );
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('DeepSeek returned empty content');
      return JSON.parse(content.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
    } catch (error) {
      const status = error.response?.status;
      const body = JSON.stringify(error.response?.data || '');
      // Unknown model (e.g. 400 "Model Not Exist" after a rename): switch once to one the key has.
      if (!this.fallbackModel && (status === 400 || status === 404) && /model/i.test(body)) {
        const next = await this.replacementModel();
        if (next) {
          console.warn(`[igAi] model "${this.model}" isn't available to this key; using "${next}"`);
          this.fallbackModel = next;
          return this.chatJson(messages, temperature, timeoutMs, maxTokens);
        }
      }
      if (error.code === 'ECONNABORTED') throw new Error("DeepSeek didn't respond in time");
      if (status) throw new Error(`DeepSeek ${status}: ${(error.response.data?.error?.message || body).slice(0, 200)}`);
      throw error;
    }
  }

  // Call + validate, retrying malformed output. `deadline` (epoch ms) caps total time.
  async chatValidated(messages, temperature, validate, { attempts = 3, timeoutMs = 60000, deadline, maxTokens = 4000 } = {}) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      const left = deadline ? deadline - Date.now() : Infinity;
      if (left < 5000) break; // too little time for a useful attempt
      try {
        return validate(await this.chatJson(messages, temperature, Math.min(timeoutMs, left), maxTokens));
      } catch (err) {
        lastErr = err;
        // A rejected key or empty balance won't fix itself on retry.
        if (/DeepSeek (401|402|403)/.test(err.message)) break;
      }
    }
    if (lastErr === undefined) throw new Error('Ran out of time before DeepSeek could answer — try again.');
    throw new Error(`AI output invalid after ${attempts} attempts: ${errText(lastErr)}`);
  }

  generateIdea(dna, promptText, recentSummaries, business = null) {
    return this.chatValidated(
      [{ role: 'system', content: P.buildDnaSystemPrompt(dna, business) },
        { role: 'user', content: P.buildIdeaUserPrompt(promptText, recentSummaries) }],
      0.9,
      S.parseIdea,
    );
  }

  generateContent(dna, idea, business = null) {
    return this.chatValidated(
      [{ role: 'system', content: P.buildDnaSystemPrompt(dna, business) },
        { role: 'user', content: P.buildContentUserPrompt(idea) }],
      0.7,
      S.parseContent,
    );
  }

  extractResearchFacts(sourceLabel, excerpt, { deadline } = {}) {
    return this.chatValidated(
      [{ role: 'system', content: P.RESEARCH_EXTRACT_SYSTEM_PROMPT },
        { role: 'user', content: P.buildResearchExtractUserPrompt(sourceLabel, excerpt) }],
      0.1,
      S.parseResearchExtract,
      { attempts: 2, timeoutMs: 90000, deadline, maxTokens: 6000 },
    );
  }

  synthesizeBusinessDna(dossier, { deadline } = {}) {
    return this.chatValidated(
      [{ role: 'system', content: P.BUSINESS_SYNTHESIS_SYSTEM_PROMPT },
        { role: 'user', content: P.buildBusinessSynthesisUserPrompt(dossier) }],
      0.3,
      S.parseSynthesis,
      { attempts: 2, timeoutMs: 120000, deadline, maxTokens: 6000 },
    );
  }

  verifyBusinessDna(dossier, draft, { deadline } = {}) {
    return this.chatValidated(
      [{ role: 'system', content: P.BUSINESS_VERIFY_SYSTEM_PROMPT },
        { role: 'user', content: P.buildBusinessVerifyUserPrompt(dossier, JSON.stringify(draft, null, 1)) }],
      0.1,
      S.parseBusinessDna,
      { attempts: 2, timeoutMs: 120000, deadline, maxTokens: 6000 },
    );
  }

  // A verdict per comment and a safe reply draft for non-bad ones. Only ids that
  // were asked about come back, once each.
  async reviewComments(comments, dna, business = null) {
    if (!comments.length) return [];
    const results = await this.chatValidated(
      [{ role: 'system', content: P.buildCommentReviewSystemPrompt(dna, business) },
        { role: 'user', content: P.buildCommentReviewUserPrompt(comments) }],
      0.4,
      S.parseCommentReview,
      { attempts: 2 },
    );
    const asked = new Set(comments.map((c) => c.id));
    const out = new Map();
    for (const r of results) {
      if (!asked.has(r.id) || out.has(r.id)) continue;
      const bad = r.verdict === 'bad';
      out.set(r.id, { ...r, category: bad ? r.category || 'other' : null, reply: bad ? null : S.sanitizeCommentReply(r.reply) });
    }
    return [...out.values()];
  }
}

// The DeepSeek client for a workspace: its own key + model from Settings, else the platform key.
export async function getTextAi(workspaceId) {
  const ai = await resolveAi(workspaceId, 'article', 'deepseek');
  const apiKey = ai.apiKey || config.deepseek.apiKey;
  if (!apiKey) throw Object.assign(new Error('No DeepSeek API key — add one in Settings.'), { status: 400 });
  return new DeepSeekJson({ apiKey, model: ai.model });
}
