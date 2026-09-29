/**
 * Model fallback chain: PRIMARY → FALLBACK_1 → … On quota/unavailable
 * errors move down the chain. One key only — never rotate keys.
 */
import { GeminiError } from './gemini';

export async function runWithFallback<T>(
  chain: readonly string[],
  call: (model: string) => Promise<T>,
): Promise<{ result: T; model: string }> {
  if (chain.length === 0) throw new GeminiError('No model selected', 0, false);
  let last: unknown = null;
  for (const model of chain) {
    try {
      return { result: await call(model), model };
    } catch (e) {
      last = e;
      if (!(e instanceof GeminiError) || !e.retryable) throw e;
    }
  }
  throw last;
}

/** Light tasks use the chain as ordered; strong tasks prefer "pro"-style models first. */
export function chainFor(task: 'light' | 'strong', chain: readonly string[]): string[] {
  if (task === 'light') return [...chain];
  const strong = chain.filter((m) => /pro/i.test(m));
  return [...strong, ...chain.filter((m) => !strong.includes(m))];
}
