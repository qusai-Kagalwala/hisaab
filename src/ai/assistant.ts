/**
 * Hisaab Assistant pipeline:
 *   intent detection → Context Builder → engine calculates → Gemini explains
 * Falls back to the offline answer whenever AI is off, unreachable, or its
 * reply contains numbers the engine did not provide.
 */
import { answer, type ChatContext, type Intent } from '../engine/chat';
import { buildFacts } from './context';
import { chainFor, runWithFallback } from './fallback';
import { generate, type FetchLike } from './gemini';
import { mentionsProducts, numbersAreGrounded } from './guard';
import { assistantPrompt, assistantSystem } from './prompts';

export interface AiConfig {
  enabled: boolean;
  apiKey: string | null;
  models: string[];
}

export interface AssistantReply {
  text: string;
  source: 'ai' | 'offline';
  model?: string;
  /** Why the offline answer was used although AI is on. */
  note?: string;
}

const STRONG: ReadonlySet<Intent> = new Set(['goal', 'save_tips']);

export function aiReady(config: AiConfig): boolean {
  return config.enabled && !!config.apiKey && config.models.length > 0;
}

export async function askAssistant(
  question: string,
  ctx: ChatContext,
  config: AiConfig,
  fetchImpl?: FetchLike,
): Promise<AssistantReply> {
  const offline = answer(question, ctx);
  // Product questions never go to the AI.
  if (!aiReady(config) || offline.intent === 'products') return { text: offline.text, source: 'offline' };

  const facts = buildFacts(offline.intent, question, ctx);
  try {
    const { result, model } = await runWithFallback(
      chainFor(STRONG.has(offline.intent) ? 'strong' : 'light', config.models),
      (m) => generate(config.apiKey!, {
        model: m,
        system: assistantSystem(offline.lang),
        prompt: assistantPrompt(question, facts),
        maxOutputTokens: 300,
      }, fetchImpl),
    );
    if (!numbersAreGrounded(result, facts) || mentionsProducts(result)) {
      return { text: offline.text, source: 'offline', note: "The AI's answer couldn't be checked, so here's the app's own answer." };
    }
    return { text: result, source: 'ai', model };
  } catch {
    return { text: offline.text, source: 'offline', note: 'AI is unavailable right now — offline answer.' };
  }
}
