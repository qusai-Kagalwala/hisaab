import { CATEGORY_ID as C, DEFAULT_CATEGORIES } from '../defaults';
import { merchantPattern, normalizeText, parseEntry } from '../parser';

const cats = [
  ...DEFAULT_CATEGORIES.map((c) => ({ ...c, hidden: false })),
  { id: 17, name: 'Balance update', keywords: ['balance'], hidden: true },
];
const p = (text: string, memory = []) => parseEntry(text, cats, memory);

describe('amounts', () => {
  it.each([
    ['chai 20', 2_000],
    ['₹200 lunch', 20_000],
    ['200rs lunch', 20_000],
    ['rs 45 samosa', 4_500],
    ['Rs.99 recharge', 9_900],
    ['2k rent', 200_000],
    ['1.5k kiraya', 150_000],
    ['1,500 shoes', 150_000],
    ['1,00,000 laptop', 10_000_000],
    ['12.50 bus', 1_250],
    ['0.5 toffee', 50],
    ['2 lakh bike', 20_000_000],
    ['auto 50/-', 5_000],
    ['२० चाय', 2_000],
  ])('%s → %i paise', (text, paise) => {
    expect(p(text).amount_paise).toBe(paise);
  });

  it.each([
    ['chai bees', 2_000],
    ['do sau sabzi', 20_000],
    ['paanch sau pachas groceries', 55_000],
    ['dedh hazaar kiraya', 150_000],
    ['ek hazaar fees', 100_000],
    ['two hundred fifty dinner', 25_000],
    ['पचास चाय', 5_000],
    ['दो सौ सब्ज़ी', 20_000],
  ])('spoken: %s → %i paise', (text, paise) => {
    expect(p(text).amount_paise).toBe(paise);
  });

  it('does not treat a units word stuck to a number as thousands', () => {
    expect(p('2kg aloo').amount_paise).toBe(200);
  });

  it('does not invent amounts', () => {
    expect(p('chai').amount_paise).toBeNull();
    expect(p('ek chai').amount_paise).toBeNull();
    expect(p('dedh').amount_paise).toBeNull();
    expect(p('').amount_paise).toBeNull();
  });
});

describe('categories', () => {
  it.each([
    ['chai 20', C.chai],
    ['₹200 lunch', C.food],
    ['auto 50 cash', C.transport],
    ['2k rent', C.rent],
    ['1.5k kiraya', C.rent],
    ['sabzi 60', C.groceries],
    ['doodh 30', C.groceries],
    ['vada pav 25', C.chai],
    ['movie 450', C.entertainment],
    ['salary 30000', C.salary],
    ['pocket money 500', C.pocketMoney],
    ['dawai 120', C.health],
    ['Food 90', C.food],
  ])('%s → category %i', (text, id) => {
    expect(p(text).category_id).toBe(id);
  });

  it('returns null when nothing matches, and never picks hidden categories', () => {
    expect(p('xyz 50').category_id).toBeNull();
    expect(p('balance 50').category_id).toBeNull();
  });

  it('prefers learned merchants over keywords, longest match first', () => {
    const memory = [
      { text_pattern: 'dmart', category_id: C.groceries, hit_count: 3 },
      { text_pattern: 'cafe', category_id: C.chai, hit_count: 1 },
      { text_pattern: 'cafe coffee day', category_id: C.food, hit_count: 1 },
    ];
    expect(parseEntry('dmart 450', cats, memory)).toMatchObject({ category_id: C.groceries, category_source: 'memory' });
    expect(parseEntry('coffee at cafe coffee day 180', cats, memory).category_id).toBe(C.food);
    expect(parseEntry('coffee 50', cats, memory)).toMatchObject({ category_id: C.chai, category_source: 'keyword' });
  });
});

describe('accounts and notes', () => {
  it('detects account words and strips them from the note', () => {
    expect(p('auto 50 cash')).toMatchObject({ account_type: 'cash', note: 'auto' });
    expect(p('swiggy 320 gpay')).toMatchObject({ account_type: 'upi_bank', note: 'swiggy' });
    expect(p('lunch 200 from upi')).toMatchObject({ account_type: 'upi_bank', note: 'lunch' });
    expect(p('lunch 200').account_type).toBeNull();
  });

  it('keeps a clean note', () => {
    expect(p('₹200 lunch with team').note).toBe('lunch with team');
    expect(merchantPattern('DMart 450!')).toBe('dmart');
    expect(normalizeText('  Chai,  ₹20!! ')).toBe('chai, ₹20');
  });
});
