import type { CaseTypeId } from '../../domain/types';
import type { IconName } from '../Icon';

export interface CaseTypeCard { type: CaseTypeId; title: string; blurb: string; tags: string[]; icon: IconName; special?: boolean }

export const CASE_TYPE_CARDS: CaseTypeCard[] = [
  { type: 'forged-statement', title: 'Forged statement', blurb: "Bank statements that don't add up, sent to unlock faster payouts.", tags: ['Statements'], icon: 'file' },
  { type: 'bought-history', title: 'Bought its own history', blurb: 'Money paid out comes back as “sales” to fake a good track record.', tags: ['Transactions', 'Links'], icon: 'repeat' },
  { type: 'hidden-by-growth', title: 'Hidden by growth', blurb: 'Fast growth makes the dispute rate look safer than it is.', tags: ['Disputes'], icon: 'trend' },
  { type: 'refund-ring', title: 'Refund-for-hire ring', blurb: 'One group files look-alike disputes across many sellers.', tags: ['Disputes', 'Links'], icon: 'users' },
  { type: 'card-testing', title: 'Card testing & cash-out', blurb: 'Stolen cards tested, then the money is pulled out fast.', tags: ['Transactions', 'Balance'], icon: 'zap' },
  { type: 'sanctions-owners', title: 'Sanctions & owners', blurb: 'A loud false alarm, and a real problem hiding in who owns what.', tags: ['Owners'], icon: 'bank' },
  { type: 'fake-views', title: 'Fake views campaign', blurb: "Clips paid per view, with views that aren't real.", tags: ['Payouts'], icon: 'eye' },
  { type: 'affiliate-self', title: 'Affiliate buying from itself', blurb: 'Commissions paid out before the refunds come in.', tags: ['Payouts', 'Links'], icon: 'link' },
  { type: 'lifetime-liability', title: 'Lifetime-access liability', blurb: 'Money in now, promises owed for years. How much to hold?', tags: ['Balance'], icon: 'inf' },
  { type: 'tz-billing-bug', title: 'Billing time-zone bug', blurb: 'Buyers charged after cancelling. Is it fraud, or a broken tool?', tags: ['Disputes'], icon: 'clock' },
  { type: 'two-at-once', title: 'Two at once', blurb: 'Two kinds of problem in one seller. Harder to untangle.', tags: ['Mixed'], icon: 'layers', special: true },
  { type: 'surprise', title: 'Surprise me', blurb: 'Any kind of case. You find out what it is by investigating.', tags: ['Random'], icon: 'dice', special: true },
];

export const FILTER_TAGS = ['Statements', 'Transactions', 'Disputes', 'Owners', 'Payouts'];
