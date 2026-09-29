export interface CategoryDef {
  name: string;
  icon: string; // glyph key understood by the app's icon set
  color: string;
}

export const DEFAULT_CATEGORIES: readonly CategoryDef[] = [
  { name: 'Food', icon: 'food', color: '#34D399' },
  { name: 'Travel', icon: 'travel', color: '#22D3EE' },
  { name: 'Shopping', icon: 'shopping', color: '#A78BFA' },
  { name: 'Bills', icon: 'bills', color: '#FBBF24' },
  { name: 'Education', icon: 'education', color: '#60A5FA' },
  { name: 'Health', icon: 'health', color: '#F87171' },
  { name: 'Entertainment', icon: 'entertainment', color: '#F472B6' },
  { name: 'Rent', icon: 'rent', color: '#FB923C' },
  { name: 'Utilities', icon: 'utilities', color: '#2DD4BF' },
  { name: 'Subscriptions', icon: 'subscriptions', color: '#818CF8' },
  { name: 'Personal', icon: 'personal', color: '#E879F9' },
  { name: 'Business', icon: 'business', color: '#94A3B8' },
  { name: 'Other', icon: 'other', color: '#9CA3AF' },
];

export const CATEGORY_NAME_RE = /^[A-Za-z0-9\u0900-\u097F &'\-]{2,24}$/;

/** Very small keyword heuristic to pre-select a category from the reason. User always confirms. */
const KEYWORDS: [string, RegExp][] = [
  ['Food', /\b(food|lunch|dinner|breakfast|snack|tea|coffee|chai|restaurant|swiggy|zomato|meal|biryani|grocer)/i],
  ['Travel', /\b(cab|uber|ola|auto|taxi|bus|train|metro|flight|fuel|petrol|diesel|toll|parking|travel)/i],
  ['Rent', /\b(rent|pg|hostel|lease)/i],
  ['Bills', /\b(bill|electric|recharge|mobile|broadband|wifi|dth|gas)/i],
  ['Education', /\b(book|course|fee|tuition|college|school|exam|project|stationery)/i],
  ['Health', /\b(medicine|pharma|doctor|hospital|clinic|gym|medical)/i],
  ['Shopping', /\b(shop|cloth|shoe|amazon|flipkart|mall|gift)/i],
  ['Entertainment', /\b(movie|cinema|concert|game|party|netflix)/i],
  ['Subscriptions', /\b(subscription|membership|plan|prime|spotify)/i],
];
export function suggestCategory(reason: string): string | null {
  for (const [cat, re] of KEYWORDS) if (re.test(reason)) return cat;
  return null;
}
