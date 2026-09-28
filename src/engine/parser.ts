/**
 * Offline text parser for quick entries typed (or dictated through the
 * phone keyboard's mic): "chai 20", "₹200 lunch", "auto 50 cash", "2k rent",
 * "1.5k kiraya", "do sau sabzi", "पचास चाय". Money is built with integer
 * paise only.
 */
import { assertPaise, type Paise } from './money';
import type { AccountType, Category } from './types';

export interface MerchantMemory {
  text_pattern: string;
  category_id: number;
  hit_count: number;
}

export interface ParsedEntry {
  amount_paise: Paise | null;
  category_id: number | null;
  /** How the category was found. */
  category_source: 'memory' | 'keyword' | null;
  account_type: AccountType | null;
  /** What's left once amount and account words are removed. */
  note: string;
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Lowercase, Devanagari digits → ASCII, punctuation → spaces. */
export function normalizeText(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    const d = DEVANAGARI_DIGITS.indexOf(ch);
    out += d >= 0 ? String(d) : ch;
  }
  return out.replace(/[^\p{L}\p{M}\p{N}₹.,/\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const MULTIPLIERS: Record<string, number> = {
  k: 1_000, thousand: 1_000, hazaar: 1_000, hazar: 1_000, hajar: 1_000, 'हज़ार': 1_000, 'हजार': 1_000,
  lakh: 100_000, lac: 100_000, lakhs: 100_000, 'लाख': 100_000,
};

// "12", "1,500", "1,00,000", "12.50", optionally "₹" before, "k"/"lakh" and "rs" after.
const AMOUNT_RE =
  /(?:₹|rs\.?|inr)?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(k|thousand|hazaa?r|hajar|हज़ार|हजार|lakhs?|lac|लाख)(?![\p{L}]))?\s*(?:rs\.?|rupees?|rupaye|rupaiye|rupay|रुपये|\/-)?/iu;

function digitsAmount(text: string): { paise: Paise; match: string } | null {
  const m = AMOUNT_RE.exec(text);
  if (!m) return null;
  const whole = parseInt(m[1].replace(/,/g, ''), 10);
  const fraction = m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0;
  const multiplier = m[3] ? MULTIPLIERS[m[3].toLowerCase()] ?? 1 : 1;
  const paise = (whole * 100 + fraction) * multiplier;
  if (!Number.isSafeInteger(paise) || paise <= 0) return null;
  return { paise, match: m[0] };
}

const UNITS: Record<string, number> = {
  // Hinglish
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chah: 6, chhah: 6,
  saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, pandrah: 15, bees: 20, bis: 20, pachchis: 25,
  pacchis: 25, tees: 30, chalis: 40, chaalis: 40, pachas: 50, pachaas: 50, pachchas: 50, sattar: 70,
  assi: 80, nabbe: 90, dedh: 1.5, dhai: 2.5,
  // Devanagari
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पांच': 5, 'पाँच': 5, 'छह': 6, 'सात': 7, 'आठ': 8, 'नौ': 9,
  'दस': 10, 'बीस': 20, 'पच्चीस': 25, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60, 'सत्तर': 70,
  'अस्सी': 80, 'नब्बे': 90, 'डेढ़': 1.5, 'ढाई': 2.5,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const HUNDREDS = new Set(['sau', 'so', 'hundred', 'सौ']);
const THOUSANDS = new Set(['hazaar', 'hazar', 'hajar', 'thousand', 'हज़ार', 'हजार']);
const AMBIGUOUS_ALONE = new Set(['ek', 'do', 'one', 'two', 'एक', 'दो', 'so']);
const NUMBER_FILLERS = new Set(['and', 'aur', 'rupees', 'rupaye', 'rupay', 'rs', 'रुपये', 'ka', 'ki', 'ke']);

/**
 * Spoken numbers: "do sau pachas" = 250, "dedh hazaar" = 1500,
 * "two hundred fifty" = 250. Half-units (dedh/dhai) only count before a
 * multiplier. Works in whole rupees (tenths for dedh/dhai), returned as paise.
 */
function wordsAmount(words: string[]): { paise: Paise; used: Set<number> } | null {
  let best: { paise: Paise; used: Set<number> } | null = null;
  let i = 0;
  while (i < words.length) {
    // tenths of a rupee so dedh (1.5) and dhai (2.5) stay integers
    let total = 0;
    let current = 0;
    let found = false;
    const used = new Set<number>();
    let j = i;
    for (; j < words.length; j++) {
      const w = words[j];
      if (w in UNITS) {
        current += Math.round(UNITS[w] * 10);
      } else if (HUNDREDS.has(w) && found) {
        current = (current || 10) * 100;
      } else if (THOUSANDS.has(w) && found) {
        total += (current || 10) * 1000;
        current = 0;
      } else if (NUMBER_FILLERS.has(w) && found) {
        // allowed inside a number phrase
      } else {
        break;
      }
      found = true;
      used.add(j);
    }
    const tenths = total + current;
    // Plain half-units ("dedh" alone) aren't amounts, and a lone "ek"/"do"
    // ("ek chai", "do it") is too ambiguous to be one.
    const loneAmbiguous = used.size === 1 && AMBIGUOUS_ALONE.has(words[i]);
    if (found && !loneAmbiguous && tenths % 10 === 0 && tenths >= 10) {
      const paise = tenths * 10;
      if (!best || paise > best.paise) best = { paise, used };
    }
    i = Math.max(j, i + 1);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Accounts and categories
// ---------------------------------------------------------------------------

const ACCOUNT_WORDS: Record<string, AccountType> = {
  cash: 'cash', nakad: 'cash', nagad: 'cash', 'नकद': 'cash', 'कैश': 'cash',
  upi: 'upi_bank', gpay: 'upi_bank', phonepe: 'upi_bank', paytm: 'upi_bank', bhim: 'upi_bank',
  card: 'upi_bank', bank: 'upi_bank', online: 'upi_bank', netbanking: 'upi_bank',
};

function containsPhrase(haystack: string, phrase: string): boolean {
  if (!phrase) return false;
  return (` ${haystack} `).includes(` ${phrase} `);
}

/** Pattern stored in merchant memory for a note: normalised, no amounts, capped. */
export function merchantPattern(note: string): string {
  return normalizeText(note)
    .replace(/[\d₹.,/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export function parseEntry(
  input: string,
  categories: readonly Pick<Category, 'id' | 'keywords' | 'hidden' | 'name'>[],
  memory: readonly MerchantMemory[] = [],
): ParsedEntry {
  const text = normalizeText(input);
  let rest = text;

  // 1. Amount: digits first, then spoken number words.
  let amount: Paise | null = null;
  const digits = digitsAmount(rest);
  if (digits) {
    amount = digits.paise;
    rest = rest.replace(digits.match, ' ');
  } else {
    const words = rest.split(' ');
    const spoken = wordsAmount(words);
    if (spoken) {
      amount = spoken.paise;
      rest = words.filter((_, k) => !spoken.used.has(k)).join(' ');
    }
  }
  if (amount != null) assertPaise(amount);

  // 2. Account words.
  let accountType: AccountType | null = null;
  rest = rest
    .split(' ')
    .filter((w) => {
      const t = ACCOUNT_WORDS[w];
      if (t && !accountType) {
        accountType = t;
        return false;
      }
      return !['se', 'from', 'via', 'by', 'mein', 'me', 'on', 'for', 'ka', 'ki', 'ke', 'rs', 'rupees', 'rupaye'].includes(w) || false;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 3. Category: learned merchants (longest match) beat the keyword dictionary.
  const visible = categories.filter((c) => !c.hidden);
  const visibleIds = new Set(visible.map((c) => c.id));
  let categoryId: number | null = null;
  let source: ParsedEntry['category_source'] = null;
  const pattern = merchantPattern(rest);
  const learned = [...memory]
    .filter((m) => visibleIds.has(m.category_id) && containsPhrase(pattern, m.text_pattern))
    .sort((a, b) => b.text_pattern.length - a.text_pattern.length || b.hit_count - a.hit_count)[0];
  if (learned) {
    categoryId = learned.category_id;
    source = 'memory';
  } else {
    let bestLen = 0;
    for (const c of visible) {
      for (const k of [c.name.toLowerCase(), ...c.keywords]) {
        if (k.length > bestLen && containsPhrase(pattern, k)) {
          bestLen = k.length;
          categoryId = c.id;
          source = 'keyword';
        }
      }
    }
  }

  return { amount_paise: amount, category_id: categoryId, category_source: source, account_type: accountType, note: rest };
}
