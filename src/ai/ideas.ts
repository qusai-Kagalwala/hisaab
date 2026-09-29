/**
 * Ideas — "What can I do under ₹X?" Online: Gemini + Google Search with only
 * budget, city and mood. Offline: built-in evergreen ideas. All prices are
 * approximate; no booking links.
 */
import { chainFor, runWithFallback } from './fallback';
import { generate, type FetchLike } from './gemini';
import { ideasPrompt, ideasSystem } from './prompts';
import type { AiConfig } from './assistant';
import { aiReady } from './assistant';

export type Mood = 'outdoor' | 'food' | 'chill' | 'social';
export type Band = '<100' | '100-200' | '200-500' | '500+';
export const BANDS: readonly Band[] = ['<100', '100-200', '200-500', '500+'];
export const BAND_LABEL: Record<Band, string> = {
  '<100': 'Under ₹100',
  '100-200': '₹100–200',
  '200-500': '₹200–500',
  '500+': '₹500+',
};
const BAND_MIN_RUPEES: Record<Band, number> = { '<100': 0, '100-200': 100, '200-500': 200, '500+': 500 };

export interface Idea {
  band: Band;
  title: string;
  /** Approximate, in whole rupees. */
  price_rupees: number;
  why: string;
}

export const OFFLINE_IDEAS: readonly (Idea & { moods: Mood[] })[] = [
  { band: '<100', title: 'Sunset walk at a nearby park or promenade', price_rupees: 0, why: 'Free, fresh air, good for thinking', moods: ['outdoor', 'chill'] },
  { band: '<100', title: 'Cutting chai + bun maska with a friend', price_rupees: 60, why: 'Cheap and cheerful catch-up', moods: ['food', 'social'] },
  { band: '<100', title: 'Library visit or a free museum day', price_rupees: 20, why: 'Quiet, cheap, often free entry', moods: ['chill'] },
  { band: '<100', title: 'Home movie night with popcorn', price_rupees: 80, why: 'Cosy and costs almost nothing', moods: ['chill', 'social'] },
  { band: '<100', title: 'Street food tasting — one plate each of two things', price_rupees: 90, why: 'Try something new locally', moods: ['food'] },
  { band: '100-200', title: 'Local train or bus ride to a new area', price_rupees: 120, why: 'Explore your own city', moods: ['outdoor'] },
  { band: '100-200', title: 'Thali lunch at a local joint', price_rupees: 180, why: 'A full, filling meal', moods: ['food'] },
  { band: '100-200', title: 'Board games at home — snacks shared', price_rupees: 150, why: 'Fun with friends, split the snacks', moods: ['social', 'chill'] },
  { band: '100-200', title: 'Cycle on rent for an hour', price_rupees: 150, why: 'Exercise with a view', moods: ['outdoor'] },
  { band: '200-500', title: 'Weekday movie matinee', price_rupees: 250, why: 'Matinees are usually cheaper', moods: ['chill', 'social'] },
  { band: '200-500', title: 'Café hangout — one drink each', price_rupees: 350, why: 'Nice place to sit and talk', moods: ['social', 'food'] },
  { band: '200-500', title: 'Short trek or fort visit (travel + snacks)', price_rupees: 400, why: 'A proper day out', moods: ['outdoor'] },
  { band: '200-500', title: 'Bowling or a game zone session', price_rupees: 450, why: 'Active fun with friends', moods: ['social'] },
  { band: '500+', title: 'Dinner out at a mid-range restaurant', price_rupees: 700, why: 'A treat to look forward to', moods: ['food', 'social'] },
  { band: '500+', title: 'Beginner workshop — pottery, art or dance', price_rupees: 800, why: 'Learn something new', moods: ['chill', 'social'] },
  { band: '500+', title: 'Day trip to a nearby town', price_rupees: 900, why: 'Change of scene, plan it cheap', moods: ['outdoor'] },
];

export function bandFor(rupees: number): Band {
  if (rupees < 100) return '<100';
  if (rupees < 200) return '100-200';
  if (rupees < 500) return '200-500';
  return '500+';
}

/** Offline ideas that fit the budget (and mood, if picked). */
export function offlineIdeas(budgetRupees: number, mood: Mood | null): Idea[] {
  return OFFLINE_IDEAS.filter((i) => i.price_rupees <= budgetRupees && (!mood || i.moods.includes(mood))).map(
    ({ moods: _m, ...idea }) => idea,
  );
}

/** Parse "BAND | TITLE | PRICE | WHY" lines; ignore anything malformed or over budget. */
export function parseIdeas(text: string, budgetRupees: number): Idea[] {
  const out: Idea[] = [];
  for (const raw of text.split('\n')) {
    const parts = raw.replace(/^[-*•\d.)\s]+/, '').split('|').map((s) => s.trim());
    if (parts.length < 4) continue;
    const price = parseInt(parts[2].replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(price) || price > budgetRupees || !parts[1]) continue;
    out.push({ band: bandFor(price), title: parts[1].slice(0, 60), price_rupees: price, why: parts[3].slice(0, 100) });
  }
  return out.slice(0, 12);
}

export function groupByBand(ideas: readonly Idea[], budgetRupees: number): { band: Band; ideas: Idea[] }[] {
  return BANDS.filter((b) => BAND_MIN_RUPEES[b] <= budgetRupees)
    .map((band) => ({ band, ideas: ideas.filter((i) => i.band === band).sort((a, b) => a.price_rupees - b.price_rupees) }))
    .filter((g) => g.ideas.length > 0);
}

export async function getIdeas(
  budgetRupees: number,
  city: string,
  mood: Mood | null,
  config: AiConfig,
  fetchImpl?: FetchLike,
): Promise<{ ideas: Idea[]; source: 'ai' | 'offline'; note?: string }> {
  const offline = { ideas: offlineIdeas(budgetRupees, mood), source: 'offline' as const };
  if (!aiReady(config)) return offline;
  try {
    const { result } = await runWithFallback(chainFor('light', config.models), (m) =>
      generate(config.apiKey!, {
        model: m, system: ideasSystem(), prompt: ideasPrompt(budgetRupees, city, mood), search: true,
        maxOutputTokens: 800, temperature: 0.7,
      }, fetchImpl),
    );
    const ideas = parseIdeas(result, budgetRupees);
    if (ideas.length === 0) return { ...offline, note: "Couldn't read the online ideas — here are some classics." };
    return { ideas, source: 'ai' };
  } catch {
    return { ...offline, note: 'Offline — here are some classics.' };
  }
}
