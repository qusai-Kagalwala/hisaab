/**
 * Minimal Gemini REST client (single provider). The key is the user's own
 * and goes only to Google. `fetchImpl` is injectable for tests.
 */
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Worth trying the next model in the chain (quota, overload, not found). */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** 429/5xx and "model not found" move down the chain; bad key/request stops. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 404 || status >= 500;
}

export interface GeminiModel {
  /** e.g. "gemini-x-flash" (without the "models/" prefix) */
  id: string;
  displayName: string;
}

/** Models this key can use for text generation, as reported by Google. */
export async function listModels(apiKey: string, fetchImpl: FetchLike = fetch): Promise<GeminiModel[]> {
  const out: GeminiModel[] = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const url = `${GEMINI_BASE}/models?pageSize=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetchImpl(url, { headers: { 'x-goog-api-key': apiKey } });
    if (!res.ok) throw new GeminiError(await errorMessage(res), res.status, false);
    const body = (await res.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      nextPageToken?: string;
    };
    for (const m of body.models ?? []) {
      if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
      const id = m.name.replace(/^models\//, '');
      if (/embedding|aqa|imagen|veo|tts|image|audio|live/i.test(id)) continue;
      out.push({ id, displayName: m.displayName ?? id });
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return out;
}

export interface GenerateRequest {
  model: string;
  system: string;
  prompt: string;
  /** Ground with Google Search (Ideas). */
  search?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
}

export async function generate(apiKey: string, req: GenerateRequest, fetchImpl: FetchLike = fetch): Promise<string> {
  const body: Record<string, unknown> = {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
    generationConfig: { temperature: req.temperature ?? 0.4, maxOutputTokens: req.maxOutputTokens ?? 400 },
  };
  if (req.search) body.tools = [{ google_search: {} }];
  let res: Response;
  try {
    res = await fetchImpl(`${GEMINI_BASE}/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GeminiError('No internet connection', 0, false);
  }
  if (!res.ok) throw new GeminiError(await errorMessage(res), res.status, isRetryableStatus(res.status));
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new GeminiError('Empty answer', 200, true);
  return text;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
