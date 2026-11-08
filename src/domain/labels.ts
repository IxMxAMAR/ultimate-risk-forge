import type { ActionKind, DisputeReason, Trigger } from './types';

const EARLY_RELEASE: Partial<Record<ActionKind, string>> = { deny: 'Deny early release', 'partial-release': 'Partial release', approve: 'Release the hold' };
const GENERAL: Record<ActionKind, string> = {
  approve: 'Approve', 'approve-smaller-hold': 'Approve with a smaller hold', 'partial-release': 'Partial release', deny: 'Deny',
  'hold-payouts': 'Hold payouts', 'refund-buyers': 'Refund buyers', block: 'Block', escalate: 'Escalate',
};

export const actionLabel = (a: ActionKind, trigger: Trigger['kind']): string => (trigger === 'early-release' ? EARLY_RELEASE[a] : undefined) ?? GENERAL[a];

const REASONS: Record<DisputeReason, string> = {
  fraudulent: 'fraudulent', not_received: 'not received', subscription_canceled: 'subscription canceled',
  product_unacceptable: 'product unacceptable', credit_not_processed: 'credit not processed',
};

export const reasonLabel = (r: DisputeReason): string => REASONS[r];
