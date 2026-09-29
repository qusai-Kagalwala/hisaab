import type { BucketStatus, MoneyPicture } from '../../engine/buckets';
import type { ChatContext } from '../../engine/chat';
import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../../engine/defaults';
import { askAssistant } from '../assistant';
import { buildFacts } from '../context';
import { chainFor, runWithFallback } from '../fallback';
import { GeminiError, generate, listModels, type FetchLike } from '../gemini';
import { mentionsProducts, numbersAreGrounded } from '../guard';
import { getIdeas, groupByBand, offlineIdeas, parseIdeas } from '../ideas';

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const reply = (text: string) => json(200, { candidates: [{ content: { parts: [{ text }] } }] });

/** Fake Gemini: per-model responses, records calls. */
function fakeGemini(byModel: Record<string, () => Promise<Response>>) {
  const calls: { url: string; body: any; headers: any }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, headers: init?.headers });
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)?.[1] ?? '');
    return (byModel[model] ?? (() => json(404, { error: { message: 'no such model' } })))();
  };
  return { fetchImpl, calls };
}

const now = new Date(2026, 8, 21, 12).getTime();
const fun: BucketStatus = { id: 2, name: 'Entertainment', period_month: '2026-09', allocated_paise: 300_000, role: null, sort_order: 0, category_ids: [C.entertainment], spent_paise: 45_000, remaining_paise: 255_000 };
const picture: MoneyPicture = { total_paise: 3_000_000, reserved_paise: 800_000, repayments_paise: 0, goals_paise: 0, buckets: [fun], in_buckets_paise: 255_000, unallocated_paise: 1_945_000, plan_pool_paise: 0 };
const ctx: ChatContext = {
  picture,
  safe: { per_day_paise: 194_500, pool_paise: 1_945_000, days_left: 10, over_paise: 0 },
  accounts: [{ name: "Papa's card", balance_paise: 3_000_000 }],
  goals: [],
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, is_default: true, hidden: false })),
  month_spending: new Map([[C.food, 420_000]]),
  nowMs: now,
};
const on = (models: string[]) => ({ enabled: true, apiKey: 'test-key', models });

describe('gemini client', () => {
  it('sends the key as a header (never in the URL) and reads the text', async () => {
    const { fetchImpl, calls } = fakeGemini({ 'm-light': () => reply('Hello') });
    expect(await generate('k', { model: 'm-light', system: 's', prompt: 'p', search: true }, fetchImpl)).toBe('Hello');
    expect(calls[0].url).not.toContain('k');
    expect(calls[0].headers['x-goog-api-key']).toBe('k');
    expect(calls[0].body.tools).toEqual([{ google_search: {} }]);
    expect(calls[0].body.systemInstruction.parts[0].text).toBe('s');
  });

  it('lists only text-generation models', async () => {
    const fetchImpl: FetchLike = () => json(200, { models: [
      { name: 'models/alpha-flash', displayName: 'Alpha Flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/text-embedding-x', supportedGenerationMethods: ['embedContent'] },
      { name: 'models/alpha-image', supportedGenerationMethods: ['generateContent'] },
    ] });
    expect(await listModels('k', fetchImpl)).toEqual([{ id: 'alpha-flash', displayName: 'Alpha Flash' }]);
    await expect(listModels('bad', () => json(400, { error: { message: 'API key not valid' } }))).rejects.toThrow('API key not valid');
  });
});

describe('fallback chain', () => {
  it('moves down on 429/503/404 and stops on a bad request', async () => {
    const { fetchImpl, calls } = fakeGemini({
      a: () => json(429, { error: { message: 'quota' } }),
      b: () => json(503, { error: { message: 'overloaded' } }),
      c: () => reply('ok'),
    });
    const r = await runWithFallback(['a', 'b', 'c'], (m) => generate('k', { model: m, system: '', prompt: '' }, fetchImpl));
    expect(r).toEqual({ result: 'ok', model: 'c' });
    expect(calls).toHaveLength(3);

    const bad = fakeGemini({ a: () => json(400, { error: { message: 'bad' } }), b: () => reply('never') });
    await expect(runWithFallback(['a', 'b'], (m) => generate('k', { model: m, system: '', prompt: '' }, bad.fetchImpl))).rejects.toBeInstanceOf(GeminiError);
    expect(bad.calls).toHaveLength(1);
  });

  it('puts pro-style models first for strong tasks', () => {
    expect(chainFor('strong', ['x-flash', 'x-pro', 'y-flash'])).toEqual(['x-pro', 'x-flash', 'y-flash']);
    expect(chainFor('light', ['x-flash', 'x-pro'])).toEqual(['x-flash', 'x-pro']);
  });
});

describe('guard', () => {
  const facts = 'Total: ₹30,000\nSafe to spend today: ₹1,945\nDays left in September: 10';
  it('allows only numbers from the facts', () => {
    expect(numbersAreGrounded('You have ₹30,000; about ₹1,945 a day for 10 days.', facts)).toBe(true);
    expect(numbersAreGrounded('Try 3 small changes, like 50/30/20.', facts)).toBe(true);
    expect(numbersAreGrounded('You could save ₹5,000 a month.', facts)).toBe(false);
    expect(numbersAreGrounded('Save ₹50 a day.', facts)).toBe(false);
    expect(numbersAreGrounded('That is 2400 over.', facts)).toBe(false);
  });
  it('spots product recommendations', () => {
    expect(mentionsProducts('Start a SIP in a good mutual fund')).toBe(true);
    expect(mentionsProducts('Keep chai spends small')).toBe(false);
  });
});

describe('context builder sends the minimum', () => {
  it('never includes account names or notes', () => {
    const facts = buildFacts('balance', 'how much do I have', ctx);
    expect(facts).toContain('Total money in all accounts: ₹30,000');
    expect(facts).not.toContain('Papa');
  });
  it('bucket and afford facts come from the engine', () => {
    expect(buildFacts('bucket_left', "what's left in entertainment", ctx)).toContain('Bucket Entertainment: planned ₹3,000, spent ₹450, left ₹2,550');
    expect(buildFacts('afford', 'can I afford 2000 shoes', ctx)).toContain('Engine verdict: Yes, comfortably.');
  });
});

describe('assistant', () => {
  it('uses the offline answer when AI is off or has no key', async () => {
    const r = await askAssistant('How much do I have?', ctx, { enabled: false, apiKey: 'k', models: ['a'] });
    expect(r.source).toBe('offline');
    const r2 = await askAssistant('How much do I have?', ctx, { enabled: true, apiKey: null, models: ['a'] });
    expect(r2.source).toBe('offline');
  });

  it('returns the AI explanation when its numbers check out', async () => {
    const { fetchImpl, calls } = fakeGemini({ a: () => reply('Aapke paas ₹30,000 hai, aaj ₹1,945 tak aaram se.') });
    const r = await askAssistant('kitna paisa hai', ctx, on(['a']), fetchImpl);
    expect(r).toMatchObject({ source: 'ai', model: 'a' });
    expect(calls[0].body.contents[0].parts[0].text).toContain('FACTS');
    expect(JSON.stringify(calls[0].body)).not.toContain('Papa');
    expect(calls[0].body.systemInstruction.parts[0].text).toContain('Hinglish');
  });

  it('discards invented numbers and product talk', async () => {
    const invented = fakeGemini({ a: () => reply('Save ₹7,777 every month!') });
    expect((await askAssistant('How much do I have?', ctx, on(['a']), invented.fetchImpl)).source).toBe('offline');
    const products = fakeGemini({ a: () => reply('Put it in a mutual fund.') });
    expect((await askAssistant('How do I save more?', ctx, on(['a']), products.fetchImpl)).source).toBe('offline');
  });

  it('never sends product questions to the AI', async () => {
    const { fetchImpl, calls } = fakeGemini({ a: () => reply('x') });
    const r = await askAssistant('which mutual fund should I buy', ctx, on(['a']), fetchImpl);
    expect(r.source).toBe('offline');
    expect(calls).toHaveLength(0);
  });

  it('falls back offline when unreachable', async () => {
    const r = await askAssistant('How much do I have?', ctx, on(['a']), () => Promise.reject(new Error('offline')));
    expect(r).toMatchObject({ source: 'offline', note: expect.stringContaining('unavailable') });
  });
});

describe('ideas', () => {
  it('offline ideas fit the budget and mood', () => {
    const ideas = offlineIdeas(200, 'food');
    expect(ideas.length).toBeGreaterThan(0);
    expect(ideas.every((i) => i.price_rupees <= 200)).toBe(true);
    expect(groupByBand(offlineIdeas(150, null), 150).map((g) => g.band)).toEqual(['<100', '100-200']);
  });

  it('parses AI lines and drops over-budget or malformed ones', () => {
    const text = '<100 | Marine Drive walk | ₹0 | Free sea breeze\n- 200-500 | Café | ₹350 | Cosy\n500+ | Concert | ₹1,500 | Too pricey\nnonsense line';
    expect(parseIdeas(text, 400)).toEqual([
      { band: '<100', title: 'Marine Drive walk', price_rupees: 0, why: 'Free sea breeze' },
      { band: '200-500', title: 'Café', price_rupees: 350, why: 'Cosy' },
    ]);
  });

  it('sends only budget, city and mood', async () => {
    const { fetchImpl, calls } = fakeGemini({ a: () => reply('<100 | Walk | ₹0 | Free') });
    const r = await getIdeas(300, 'Mumbai', 'outdoor', on(['a']), fetchImpl);
    expect(r.source).toBe('ai');
    expect(calls[0].body.contents[0].parts[0].text).toBe('Budget: up to ₹300 per person.\nCity: Mumbai.\nMood: outdoor.');
  });
});
