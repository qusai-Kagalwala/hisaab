import type { AccountType, CategoryKind } from './types';

/**
 * Seed data. Ids are fixed so engine rules (e.g. the time-of-day guess) can
 * refer to default categories even if the user renames them.
 */
export const CATEGORY_ID = {
  food: 1,
  chai: 2,
  transport: 3,
  groceries: 4,
  shopping: 5,
  bills: 6,
  rent: 7,
  entertainment: 8,
  health: 9,
  education: 10,
  family: 11,
  other: 12,
  salary: 13,
  pocketMoney: 14,
  gift: 15,
  otherIncome: 16,
} as const;

export interface DefaultCategory {
  id: number;
  name: string;
  icon: string;
  kind: CategoryKind;
  keywords: string[];
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { id: CATEGORY_ID.food, name: 'Food', icon: '🍛', kind: 'expense',
    keywords: ['food', 'lunch', 'dinner', 'breakfast', 'khana', 'thali', 'biryani', 'swiggy', 'zomato', 'restaurant', 'dhaba'] },
  { id: CATEGORY_ID.chai, name: 'Chai & Snacks', icon: '☕', kind: 'expense',
    keywords: ['chai', 'tea', 'coffee', 'snacks', 'nashta', 'samosa', 'vada pav', 'maggi', 'juice'] },
  { id: CATEGORY_ID.transport, name: 'Transport', icon: '🛺', kind: 'expense',
    keywords: ['auto', 'rickshaw', 'bus', 'train', 'local', 'metro', 'cab', 'uber', 'ola', 'rapido', 'petrol', 'fuel', 'taxi'] },
  { id: CATEGORY_ID.groceries, name: 'Groceries', icon: '🛒', kind: 'expense',
    keywords: ['groceries', 'grocery', 'sabzi', 'doodh', 'milk', 'kirana', 'ration', 'vegetables', 'fruits', 'blinkit', 'zepto'] },
  { id: CATEGORY_ID.shopping, name: 'Shopping', icon: '🛍️', kind: 'expense',
    keywords: ['shopping', 'clothes', 'kapde', 'shoes', 'amazon', 'flipkart', 'myntra'] },
  { id: CATEGORY_ID.bills, name: 'Bills & Recharge', icon: '📱', kind: 'expense',
    keywords: ['bill', 'recharge', 'electricity', 'bijli', 'wifi', 'internet', 'gas', 'mobile', 'dth'] },
  { id: CATEGORY_ID.rent, name: 'Rent', icon: '🏠', kind: 'expense',
    keywords: ['rent', 'kiraya', 'pg', 'hostel'] },
  { id: CATEGORY_ID.entertainment, name: 'Entertainment', icon: '🎬', kind: 'expense',
    keywords: ['movie', 'film', 'netflix', 'spotify', 'game', 'outing', 'party'] },
  { id: CATEGORY_ID.health, name: 'Health', icon: '💊', kind: 'expense',
    keywords: ['medicine', 'dawai', 'doctor', 'chemist', 'pharmacy', 'hospital', 'gym'] },
  { id: CATEGORY_ID.education, name: 'Education', icon: '📚', kind: 'expense',
    keywords: ['books', 'fees', 'course', 'tuition', 'stationery', 'xerox', 'college'] },
  { id: CATEGORY_ID.family, name: 'Family', icon: '👪', kind: 'expense',
    keywords: ['family', 'ghar', 'parents', 'mummy', 'papa'] },
  { id: CATEGORY_ID.other, name: 'Other', icon: '📦', kind: 'expense', keywords: [] },
  { id: CATEGORY_ID.salary, name: 'Salary', icon: '💼', kind: 'income',
    keywords: ['salary', 'tankha', 'stipend', 'pay'] },
  { id: CATEGORY_ID.pocketMoney, name: 'Pocket money', icon: '👛', kind: 'income',
    keywords: ['pocket money', 'kharcha', 'allowance'] },
  { id: CATEGORY_ID.gift, name: 'Gift', icon: '🎁', kind: 'income',
    keywords: ['gift', 'shagun', 'birthday'] },
  { id: CATEGORY_ID.otherIncome, name: 'Other income', icon: '💰', kind: 'income', keywords: [] },
];

export interface DefaultAccount {
  id: number;
  name: string;
  type: AccountType;
}

export const DEFAULT_ACCOUNTS: readonly DefaultAccount[] = [
  { id: 1, name: 'Cash', type: 'cash' },
  { id: 2, name: 'UPI / Bank', type: 'upi_bank' },
];
