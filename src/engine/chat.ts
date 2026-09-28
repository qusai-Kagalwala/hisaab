/**
 * Offline Hisaab Assistant: keyword intents (English + Hinglish, basic
 * Devanagari) and templated answers. Every number comes from the engine;
 * when data is missing the answer says so. No product recommendations.
 */
import { canIAfford } from './afford';
import type { MoneyPicture, SafeToSpend } from './buckets';
import { monthKey, monthName } from './calendar';
import type { GoalStatus } from './goals';
import { addPaise, formatINR, type Paise } from './money';
import { normalizeText, parseEntry } from './parser';
import type { Category } from './types';

export type Lang = 'en' | 'hi';
export type Intent =
  | 'greeting'
  | 'balance'
  | 'bucket_left'
  | 'spending'
  | 'goal'
  | 'afford'
  | 'save_tips'
  | 'education'
  | 'products'
  | 'unknown';

export interface ChatContext {
  picture: MoneyPicture;
  safe: SafeToSpend;
  accounts: { name: string; balance_paise: Paise }[];
  goals: GoalStatus[];
  categories: Category[];
  /** Everyday spending this month by category id. */
  month_spending: Map<number | null, Paise>;
  nowMs: number;
}

export interface ChatAnswer {
  intent: Intent;
  lang: Lang;
  text: string;
}

const HINGLISH = new Set([
  'kitna', 'kitne', 'kitni', 'hai', 'hain', 'kya', 'mein', 'mera', 'meri', 'mere', 'bacha', 'bache', 'kab',
  'sakta', 'sakti', 'sakte', 'paisa', 'paise', 'kharcha', 'kharch', 'kaha', 'kahan', 'kaise', 'hu', 'hoon',
  'tak', 'lu', 'loon', 'bata', 'batao', 'gaya', 'gaye', 'kaun', 'kyun', 'ke', 'ka', 'ki', 'aur', 'abhi',
]);

export function detectLang(text: string): Lang {
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  const words = normalizeText(text).split(' ');
  return words.filter((w) => HINGLISH.has(w)).length >= 1 ? 'hi' : 'en';
}

const has = (t: string, re: RegExp) => re.test(t);

export function detectIntent(text: string, ctx: Pick<ChatContext, 'picture' | 'goals'>): Intent {
  const t = ` ${normalizeText(text)} `;
  if (has(t, /\b(stock|stocks|share market|shares|mutual fund|mf|sip|crypto|bitcoin|loan|emi|credit card|insurance policy|invest in|kaha invest|कहाँ निवेश)\b/)) return 'products';
  if (has(t, /(afford|le sakt|kharid sakt|khareed sakt|buy|lu kya|loon kya|lena hai|खरीद|ले सकत)/)) return 'afford';
  if (ctx.goals.some((g) => t.includes(` ${g.name.toLowerCase()} `)) || has(t, /\b(goal|goals|kab tak|by when|eta|target|लक्ष्य)\b/)) return 'goal';
  if (ctx.picture.buckets.some((b) => t.includes(` ${b.name.toLowerCase()} `)) && has(t, /(left|bacha|bache|remaining|kitna|how much|बचा)/)) return 'bucket_left';
  if (has(t, /(where did|where does|kaha gaya|kahan gaya|kaha gaye|kahan gaye|kharcha|kharch kaha|spent|spending|spend on|kis par|kispe|top categor|खर्च)/)) return 'spending';
  if (has(t, /(emergency fund|50 ?30 ?20|budget rule|budgeting)/)) return 'education';
  if (has(t, /(save|saving|savings|bachat|bachau|bachaun|bachana|bacha sak|kam kharch|बचत)/)) return 'save_tips';
  if (has(t, /(how much|kitna paisa|kitne paise|balance|total|what s left|whats left|what is left|kitna bacha|mere paas|मेरे पास|कितना)/)) return 'balance';
  if (has(t, /^\s*(hi|hello|hey|namaste|namaskar|नमस्ते)\b/)) return 'greeting';
  return 'unknown';
}

const fmt = (p: Paise) => formatINR(p, { paise: 'never' });

function balanceAnswer(ctx: ChatContext, lang: Lang): string {
  const { picture, safe } = ctx;
  if (ctx.accounts.length === 0 || (picture.total_paise === 0 && ctx.accounts.every((a) => a.balance_paise === 0))) {
    return lang === 'hi'
      ? 'Abhi mere paas aapke accounts ka koi balance nahi hai. Accounts mein "Update" dabakar batao kitna paisa hai.'
      : "I don't have any balances yet. Tap Update on the Accounts screen to tell me what you have.";
  }
  const parts = ctx.accounts.map((a) => `${a.name} ${fmt(a.balance_paise)}`).join(', ');
  const setAside: string[] = [];
  if (picture.reserved_paise > 0) setAside.push(lang === 'hi' ? `${fmt(picture.reserved_paise)} bills ke liye` : `${fmt(picture.reserved_paise)} kept for bills`);
  if (picture.goals_paise > 0) setAside.push(lang === 'hi' ? `${fmt(picture.goals_paise)} goals mein` : `${fmt(picture.goals_paise)} in goals`);
  if (lang === 'hi') {
    return `Aapke paas total ${fmt(picture.total_paise)} hai (${parts}).` +
      (setAside.length ? ` Isme se ${setAside.join(', ')} rakha hai.` : '') +
      ` Aaj ${fmt(safe.per_day_paise)} tak aaram se kharch kar sakte ho.`;
  }
  return `You have ${fmt(picture.total_paise)} in total (${parts}).` +
    (setAside.length ? ` Of that, ${setAside.join(' and ')}.` : '') +
    ` Safe to spend today: ${fmt(safe.per_day_paise)}.`;
}

function bucketAnswer(text: string, ctx: ChatContext, lang: Lang): string {
  const t = ` ${normalizeText(text)} `;
  const bucket = ctx.picture.buckets.find((b) => t.includes(` ${b.name.toLowerCase()} `));
  if (!bucket) return balanceAnswer(ctx, lang);
  if (bucket.remaining_paise >= 0) {
    return lang === 'hi'
      ? `${bucket.name} mein ${fmt(bucket.remaining_paise)} bacha hai (${fmt(bucket.allocated_paise)} mein se).`
      : `${bucket.name} has ${fmt(bucket.remaining_paise)} left of ${fmt(bucket.allocated_paise)}.`;
  }
  return lang === 'hi'
    ? `${bucket.name} ${fmt(-bucket.remaining_paise)} zyada ho gaya hai. Kisi aur bucket se cover kar sakte ho.`
    : `${bucket.name} is ${fmt(-bucket.remaining_paise)} over plan. You can cover it from another bucket.`;
}

function spendingAnswer(ctx: ChatContext, lang: Lang): string {
  const entries = [...ctx.month_spending.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const month = monthName(monthKey(ctx.nowMs));
  if (entries.length === 0) {
    return lang === 'hi' ? `Is mahine (${month}) abhi tak kuch log nahi hua.` : `Nothing logged in ${month} yet.`;
  }
  const total = addPaise(...entries.map(([, v]) => v));
  const name = (id: number | null) => ctx.categories.find((c) => c.id === id)?.name ?? 'Other';
  const top = entries.slice(0, 3).map(([id, v]) => `${name(id)} ${fmt(v)}`).join(', ');
  return lang === 'hi'
    ? `${month} mein ab tak ${fmt(total)} kharch hua. Sabse zyada: ${top}.`
    : `So far in ${month} you've spent ${fmt(total)}. Top: ${top}.`;
}

function goalAnswer(text: string, ctx: ChatContext, lang: Lang): string {
  const active = ctx.goals.filter((g) => g.status === 'active');
  if (active.length === 0) {
    return lang === 'hi'
      ? 'Abhi koi goal nahi hai. Goals mein jaakar ek banao, jaise "Laptop ₹80,000".'
      : 'You have no goals yet. Add one in Goals, like "Laptop ₹80,000".';
  }
  const t = ` ${normalizeText(text)} `;
  const named = active.filter((g) => t.includes(` ${g.name.toLowerCase()} `));
  return (named.length ? named : active)
    .slice(0, 3)
    .map((g) => {
      const progress = `${g.name}: ${fmt(g.saved_paise)} / ${fmt(g.target_paise)}`;
      if (g.remaining_paise === 0) return lang === 'hi' ? `${progress} — pura ho gaya! 🎉` : `${progress} — reached! 🎉`;
      if (!g.eta_month) {
        return lang === 'hi'
          ? `${progress}. ETA ke liye pehle kuch paisa daalo.`
          : `${progress}. Put some money in to see an ETA.`;
      }
      const when = `${monthName(g.eta_month)} ${g.eta_month.slice(0, 4)}`;
      return lang === 'hi'
        ? `${progress}. Is speed (${fmt(g.pace_paise)}/mahina) se ${when} tak ho jayega.`
        : `${progress}. At your pace (${fmt(g.pace_paise)}/month) you'll get there by ${when}.`;
    })
    .join('\n');
}

function affordAnswer(text: string, ctx: ChatContext, lang: Lang): string {
  const parsed = parseEntry(text, ctx.categories);
  if (!parsed.amount_paise) {
    return lang === 'hi'
      ? 'Kitne ka hai? Aise poochho: "2000 ke shoes le sakta hu?"'
      : 'How much is it? Try: "Can I afford ₹2,000 shoes?"';
  }
  const r = canIAfford({
    picture: ctx.picture, amount_paise: parsed.amount_paise, category_id: parsed.category_id,
    goals: ctx.goals, nowMs: ctx.nowMs,
  });
  if (lang === 'hi') {
    const head = {
      comfortable: 'Haan, aaram se.',
      tight: 'Haan, par thoda tight hoga.',
      bucket_over: `Haan, par ${r.bucket?.name ?? 'bucket'} ${fmt(-(r.bucket?.remaining_after ?? 0))} zyada ho jayega.`,
      short: `Is mahine ke free paise se nahi — ${fmt(r.short_paise)} kam padenge.`,
    }[r.verdict];
    const lines = [head, `Safe to spend: ${fmt(r.safe_before.per_day_paise)} → ${fmt(r.safe_after.per_day_paise)} roz.`];
    if (r.goal_delay) lines.push(`${r.goal_delay.name} lagbhag ${r.goal_delay.months} mahina aage ja sakta hai.`);
    lines.push('Faisla aapka — main bas numbers dikha raha hoon.');
    return lines.join('\n');
  }
  return [r.headline, ...r.details].join('\n');
}

function saveTipsAnswer(ctx: ChatContext, lang: Lang): string {
  const top = [...ctx.month_spending.entries()].filter(([id, v]) => id != null && v > 0).sort((a, b) => b[1] - a[1])[0];
  const topName = top ? ctx.categories.find((c) => c.id === top[0])?.name : null;
  const tips: string[] = [];
  if (lang === 'hi') {
    if (top && topName) tips.push(`Is mahine sabse zyada ${topName} par gaya (${fmt(top[1])}). Iske liye ek chhota weekly limit rakh ke dekho.`);
    tips.push('Salary/pocket money aate hi pehle Savings bucket ya goal mein daalo, baad mein kharch karo.');
    tips.push('Roz ke chhote kharche (chai, snacks) quick chips se log karo — dikhte rahenge toh kam honge.');
    tips.push('(General tips hain, financial advice nahi.)');
  } else {
    if (top && topName) tips.push(`Your biggest spend this month is ${topName} (${fmt(top[1])}). Try a small weekly limit for it.`);
    tips.push('When money comes in, move some to Savings or a goal first, then spend the rest.');
    tips.push('Log small daily spends (chai, snacks) with quick chips — seeing them makes them shrink.');
    tips.push('(General tips, not financial advice.)');
  }
  return tips.join('\n');
}

function educationAnswer(text: string, lang: Lang): string {
  const t = normalizeText(text);
  if (/50 ?30 ?20/.test(t)) {
    return lang === 'hi'
      ? '50/30/20 ek simple tareeka hai: 50% zaroori cheezein, 30% shauk, 20% bachat. Yeh ek starting point hai — apni situation ke hisaab se badlo. (General jaankari, financial advice nahi.)'
      : '50/30/20 is a simple rule of thumb: 50% needs, 30% wants, 20% savings. It is a starting point — adjust it to your situation. (General information, not financial advice.)';
  }
  return lang === 'hi'
    ? 'Emergency fund woh paisa hai jo achanak ke kharchon ke liye alag rakha jaata hai — aam taur par 3–6 mahine ke zaroori kharche. Ek goal bana ke dheere dheere bhar sakte ho. (General jaankari, financial advice nahi.)'
    : 'An emergency fund is money kept aside for surprises — commonly 3–6 months of essential expenses. You can build one slowly with a goal. (General information, not financial advice.)';
}

export function answer(text: string, ctx: ChatContext): ChatAnswer {
  const lang = detectLang(text);
  const intent = detectIntent(text, ctx);
  let reply: string;
  switch (intent) {
    case 'greeting':
      reply = lang === 'hi'
        ? 'Namaste! Poochho: "kitna paisa hai?", "kharcha kaha gaya?", "laptop kab tak?", "2000 ke shoes le sakta hu?"'
        : 'Hi! Ask me: "How much do I have?", "Where did my money go?", "When will I reach my goal?", "Can I afford ₹2,000 shoes?"';
      break;
    case 'balance':
      reply = balanceAnswer(ctx, lang);
      break;
    case 'bucket_left':
      reply = bucketAnswer(text, ctx, lang);
      break;
    case 'spending':
      reply = spendingAnswer(ctx, lang);
      break;
    case 'goal':
      reply = goalAnswer(text, ctx, lang);
      break;
    case 'afford':
      reply = affordAnswer(text, ctx, lang);
      break;
    case 'save_tips':
      reply = saveTipsAnswer(ctx, lang);
      break;
    case 'education':
      reply = educationAnswer(text, lang);
      break;
    case 'products':
      reply = lang === 'hi'
        ? 'Main stocks, funds, loans ya kisi product ki salah nahi deta. Iske liye kisi registered financial advisor se baat karo. Main yeh bata sakta hoon ki aap har mahine kitna bacha sakte ho.'
        : "I can't recommend stocks, funds, loans or other products — for that, please talk to a registered financial advisor. I can show you how much you're able to set aside each month.";
      break;
    default:
      reply = lang === 'hi'
        ? 'Yeh main samajh nahi paya. Main in cheezon mein madad kar sakta hoon: kitna bacha hai, kharcha kaha gaya, goals, "₹X le sakta hu?", aur bachat ke tips.'
        : "I didn't catch that. I can help with: what's left, where your money went, goals, \"can I afford ₹X?\", and saving tips.";
  }
  return { intent, lang, text: reply };
}
