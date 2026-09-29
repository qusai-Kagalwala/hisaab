/**
 * AI settings. The Gemini key lives only in expo-secure-store (encrypted,
 * on this phone); everything else is in the settings table.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { AiConfig } from '../ai/assistant';
import { listModels, type GeminiModel } from '../ai/gemini';
import { getSetting, setSetting } from '../db/queries';
import type { Db } from '../db/types';

const KEY_NAME = 'gemini_api_key';
export const SETTING_AI_ENABLED = 'ai_enabled';
export const SETTING_AI_MODELS = 'ai_models';
export const SETTING_CITY = 'city';
export const SETTING_WEEKLY = 'weekly_summary';

let cachedKey: string | null | undefined;

async function readKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  try {
    cachedKey = await SecureStore.getItemAsync(KEY_NAME);
  } catch {
    cachedKey = null; // e.g. web: no secure storage, so no AI
  }
  return cachedKey;
}

interface AiState {
  loaded: boolean;
  enabled: boolean;
  models: string[];
  city: string;
  weekly: boolean;
  hasKey: boolean;
  keyStorageOk: boolean;
  available: GeminiModel[];
  load: (db: Db) => Promise<void>;
  config: () => Promise<AiConfig>;
  saveKey: (key: string) => Promise<GeminiModel[]>;
  removeKey: (db: Db) => Promise<void>;
  setEnabled: (db: Db, on: boolean) => Promise<void>;
  setModels: (db: Db, models: string[]) => Promise<void>;
  setCity: (db: Db, city: string) => Promise<void>;
  setWeekly: (db: Db, on: boolean) => Promise<void>;
}

export const useAiStore = create<AiState>((set, get) => ({
  loaded: false,
  enabled: false,
  models: [],
  city: '',
  weekly: false,
  hasKey: false,
  keyStorageOk: true,
  available: [],

  load: async (db) => {
    const [enabled, models, city, weekly] = await Promise.all([
      getSetting(db, SETTING_AI_ENABLED),
      getSetting(db, SETTING_AI_MODELS),
      getSetting(db, SETTING_CITY),
      getSetting(db, SETTING_WEEKLY),
    ]);
    let keyStorageOk = true;
    try {
      keyStorageOk = await SecureStore.isAvailableAsync();
    } catch {
      keyStorageOk = false;
    }
    const key = keyStorageOk ? await readKey() : null;
    let parsed: string[] = [];
    try {
      parsed = models ? (JSON.parse(models) as string[]).filter((m) => typeof m === 'string') : [];
    } catch {
      parsed = [];
    }
    set({
      loaded: true, enabled: enabled === '1', models: parsed, city: city ?? '', weekly: weekly === '1',
      hasKey: !!key, keyStorageOk,
    });
  },

  config: async () => ({ enabled: get().enabled, apiKey: await readKey(), models: get().models }),

  /** Checks the key with Google (lists its models) before saving it. */
  saveKey: async (key) => {
    const trimmed = key.trim();
    const available = await listModels(trimmed);
    await SecureStore.setItemAsync(KEY_NAME, trimmed);
    cachedKey = trimmed;
    set({ hasKey: true, available });
    return available;
  },

  removeKey: async (db) => {
    try {
      await SecureStore.deleteItemAsync(KEY_NAME);
    } catch {
      // nothing stored
    }
    cachedKey = null;
    set({ hasKey: false, available: [], enabled: false });
    await setSetting(db, SETTING_AI_ENABLED, '0');
  },

  setEnabled: async (db, on) => {
    set({ enabled: on });
    await setSetting(db, SETTING_AI_ENABLED, on ? '1' : '0');
  },
  setModels: async (db, models) => {
    set({ models });
    await setSetting(db, SETTING_AI_MODELS, JSON.stringify(models));
  },
  setCity: async (db, city) => {
    set({ city });
    await setSetting(db, SETTING_CITY, city.trim());
  },
  setWeekly: async (db, on) => {
    set({ weekly: on });
    await setSetting(db, SETTING_WEEKLY, on ? '1' : '0');
  },
}));

/** Refresh the model list for an already-saved key. */
export async function refreshModels(): Promise<GeminiModel[]> {
  const key = await readKey();
  if (!key) return [];
  const available = await listModels(key);
  useAiStore.setState({ available });
  return available;
}
