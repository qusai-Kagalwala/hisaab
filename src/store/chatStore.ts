/** Hisaab Assistant (offline). Answers come from src/engine/chat.ts. */
import { create } from 'zustand';
import { addChat, clearChat, listChat, type ChatMessage } from '../db/smartQueries';
import type { Db } from '../db/types';
import { answer, type ChatContext } from '../engine/chat';
import { useLedgerStore } from './ledgerStore';

interface ChatState {
  messages: ChatMessage[];
  load: (db: Db) => Promise<void>;
  send: (db: Db, text: string) => Promise<void>;
  clear: (db: Db) => Promise<void>;
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
  load: async (db) => set({ messages: await listChat(db) }),
  send: async (db, text) => {
    const question = text.trim();
    if (!question) return;
    await addChat(db, 'user', question);
    await addChat(db, 'assistant', answer(question, chatContext()).text);
    await get().load(db);
  },
  clear: async (db) => {
    await clearChat(db);
    set({ messages: [] });
  },
}));
