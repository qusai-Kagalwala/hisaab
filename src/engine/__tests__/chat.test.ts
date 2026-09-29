import type { BucketStatus, MoneyPicture } from '../buckets';
import { answer, detectIntent, detectLang, suggestAction, type ChatContext } from '../chat';
import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../defaults';
import type { GoalStatus } from '../goals';

const now = new Date(2026, 8, 21, 12).getTime();
const fun: BucketStatus = { id: 2, name: 'Entertainment', period_month: '2026-09', allocated_paise: 300_000, role: null, sort_order: 0, category_ids: [C.entertainment], spent_paise: 45_000, remaining_paise: 255_000 };
const flexible: BucketStatus = { ...fun, id: 9, name: 'Flexible', role: 'flexible', category_ids: [], spent_paise: 0, allocated_paise: 100_000, remaining_paise: 100_000 };
const picture: MoneyPicture = { total_paise: 3_000_000, reserved_paise: 800_000, repayments_paise: 0, goals_paise: 500_000, buckets: [fun, flexible], in_buckets_paise: 355_000, unallocated_paise: 1_345_000, plan_pool_paise: 0 };
const laptop = { id: 1, name: 'Laptop', status: 'active', saved_paise: 500_000, target_paise: 8_000_000, remaining_paise: 7_500_000, pace_paise: 1_500_000, eta_month: '2027-02' } as GoalStatus;

const ctx: ChatContext = {
  picture,
  safe: { per_day_paise: 144_500, pool_paise: 1_445_000, days_left: 10, over_paise: 0 },
  accounts: [{ name: 'Cash', balance_paise: 200_000 }, { name: 'UPI / Bank', balance_paise: 2_800_000 }],
  goals: [laptop],
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, is_default: true, hidden: false })),
  month_spending: new Map([[C.food, 420_000], [C.transport, 90_000], [C.entertainment, 45_000]]),
  nowMs: now,
};

describe('language', () => {
  it.each([
    ['How much do I have?', 'en'],
    ['kitna paisa hai?', 'hi'],
    ['मेरे पास कितना है', 'hi'],
    ['laptop kab tak?', 'hi'],
  ])('%s → %s', (text, lang) => expect(detectLang(text)).toBe(lang));
});

describe('intents', () => {
  it.each([
    ['How much do I have?', 'balance'],
    ['kitna paisa hai', 'balance'],
    ["What's left?", 'balance'],
    ["What's left in Entertainment?", 'bucket_left'],
    ['entertainment mein kitna bacha', 'bucket_left'],
    ['Where did my money go this month?', 'spending'],
    ['kharcha kaha gaya', 'spending'],
    ['When will I reach my laptop goal?', 'goal'],
    ['laptop kab tak', 'goal'],
    ['Can I afford ₹2,000 shoes this week?', 'afford'],
    ['2000 ke shoes le sakta hu?', 'afford'],
    ['How do I save more?', 'save_tips'],
    ['paise kaise bachau', 'save_tips'],
    ['what is an emergency fund', 'education'],
    ['which mutual fund should I buy', 'products'],
    ['should I take a loan', 'products'],
    ['hello', 'greeting'],
    ['blue sky', 'unknown'],
  ])('%s → %s', (text, intent) => expect(detectIntent(text, ctx)).toBe(intent));
});

describe('answers use engine numbers only', () => {
  it('balance', () => {
    expect(answer('How much do I have?', ctx).text).toBe(
      'You have ₹30,000 in total (Cash ₹2,000, UPI / Bank ₹28,000). Of that, ₹8,000 kept for bills and ₹5,000 in goals. Safe to spend today: ₹1,445.',
    );
    expect(answer('kitna paisa hai', ctx).text).toContain('Aaj ₹1,445 tak aaram se kharch kar sakte ho.');
  });

  it('bucket, spending and goal', () => {
    expect(answer('entertainment mein kitna bacha', ctx).text).toBe('Entertainment mein ₹2,550 bacha hai (₹3,000 mein se).');
    expect(answer('Where did my money go?', ctx).text).toBe("So far in September you've spent ₹5,550. Top: Food ₹4,200, Transport ₹900, Entertainment ₹450.");
    expect(answer('laptop goal when?', ctx).text).toBe("Laptop: ₹5,000 / ₹80,000. At your pace (₹15,000/month) you'll get there by February 2027.");
  });

  it('afford runs the engine; missing amount asks for it', () => {
    expect(answer('Can I afford ₹2,000 movie tickets?', ctx).text.split('\n')[0]).toBe('Yes, comfortably.');
    expect(answer('can I afford new shoes', ctx).text).toContain('How much is it?');
  });

  it('says so when data is missing', () => {
    const empty = { ...ctx, accounts: [], goals: [], month_spending: new Map(), picture: { ...picture, total_paise: 0 } };
    expect(answer('How much do I have?', empty).text).toContain("I don't have any balances yet");
    expect(answer('goal kab tak', empty).text).toContain('Abhi koi goal nahi hai');
    expect(answer('where did my money go', empty).text).toBe('Nothing logged in September yet.');
  });

  it('never recommends products; tips carry a note', () => {
    expect(answer('which mutual fund should I buy', ctx).text).toContain("can't recommend");
    expect(answer('How do I save more?', ctx).text).toContain('not financial advice');
  });
});

describe('suggested actions', () => {
  it('suggests covering an overspend from Flexible, only as a suggestion', () => {
    const over = { ...fun, remaining_paise: -20_000, spent_paise: 320_000 };
    const c = { ...ctx, picture: { ...picture, buckets: [over, flexible] } };
    expect(suggestAction('entertainment mein kitna bacha', c)).toEqual({
      kind: 'move', from_id: 9, to_id: 2, amount_paise: 20_000, label: 'Move ₹200 from Flexible to Entertainment',
    });
    expect(suggestAction('How much do I have?', c)).toBeNull();
  });

  it('suggests topping up before a purchase that would go over', () => {
    const a = suggestAction('Can I afford ₹3,000 movie tickets?', ctx);
    expect(a).toMatchObject({ from_id: 9, to_id: 2, amount_paise: 45_000 });
  });
});
