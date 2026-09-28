/**
 * Hisaab Assistant. Pipeline in src/ai/assistant.ts: intent → Context
 * Builder → engine → (optional) Gemini explains → guard → offline fallback.
 */
import { create } from 'zustand';
import { askAssistant } from '../ai/assistant';
import { addChat, clearChat, listChat, type ChatMessage } from '../db/smartQueries';
import type { Db } from '../db/types';
import { suggestAction, type ChatContext, type SuggestedAction } from '../engine/chat';
import { useAiStore } from './aiStore';
import { useLedgerStore } from './ledgerStore';

interface ChatState {
  messages: ChatMessage[];
  thinking: boolean;
  /** Engine-suggested action for the latest answer; runs only on a confirm tap. */
  action: SuggestedAction | null;
  load: (db: Db) => Promise<void>;
  send: (db: Db, text: string) => Promise<void>;
  clear: (db: Db) => Promise<void>;
  dismissAction: () => void;
}

/** Everything the assistant may use — engine numbers only. */
export function chatContext(nowMs = Date.now()): ChatContext {
  const s = useLedgerStore.getState();
  return {
    picture: s.picture,
    safe: s.safe,
    accounts: s.accounts.map((a) => ({ name: a.name, balance_paise: s.balances.get(a.id) ?? 0 })),
    goals: s.goals,
    categories: s.categories,
    month_spending: s.monthSpending,
    nowMs,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  thinking: false,
  action: null,
  load: async (db) => set({ messages: await listChat(db) }),
  send: async (db, text) => {
    const question = text.trim();
    if (!question || get().thinking) return;
    await addChat(db, 'user', question);
    set({ thinking: true, action: null, messages: await listChat(db) });
    try {
      const ctx = chatContext();
      const reply = await askAssistant(question, ctx, await useAiStore.getState().config());
      const content = reply.note ? `${reply.text}\n\n(${reply.note})` : reply.text;
      await addChat(db, reply.source === 'ai' ? 'ai' : 'assistant', content);
      set({ action: suggestAction(question, ctx) });
    } finally {
      set({ thinking: false, messages: await listChat(db) });
    }
  },
  clear: async (db) => {
    await clearChat(db);
    set({ messages: [], action: null });
  },
  dismissAction: () => set({ action: null }),
}));
