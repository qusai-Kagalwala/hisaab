/**
 * "Engine calculates, AI explains": an AI reply may only contain money-sized
 * numbers that were in the facts we sent. Otherwise it is discarded.
 */
const NUMBER_RE = /(₹\s*)?(\d[\d,]*(?:\.\d+)?)/g;

function numbersIn(text: string): { value: string; rupee: boolean }[] {
  const out: { value: string; rupee: boolean }[] = [];
  for (const m of text.matchAll(NUMBER_RE)) {
    out.push({ value: m[2].replace(/,/g, '').replace(/\.0+$/, ''), rupee: !!m[1] });
  }
  return out;
}

/** Small counts like "3 tips" or "50/30/20" are fine; ₹ amounts and numbers ≥ 100 must come from the facts. */
export function numbersAreGrounded(reply: string, facts: string): boolean {
  const allowed = new Set(numbersIn(facts).map((n) => n.value));
  return numbersIn(reply).every((n) => allowed.has(n.value) || (!n.rupee && Number(n.value) < 100));
}

const PRODUCT_RE = /\b(mutual fund|sip|stock|shares?|equity|crypto|bitcoin|loan|emi|credit card|insurance|fixed deposit|\bfd\b|ppf|nps|elss|ulip|gold bond)s?\b/i;

/** Replies must not recommend financial products. */
export function mentionsProducts(reply: string): boolean {
  return PRODUCT_RE.test(reply);
}
