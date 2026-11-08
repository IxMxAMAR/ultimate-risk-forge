import type { Cents } from '../lib/money';

export const CASE_TYPES = ['forged-statement','bought-history','hidden-by-growth','refund-ring','card-testing','sanctions-owners','fake-views','affiliate-self','lifetime-liability','tz-billing-bug','two-at-once','surprise'] as const;
export type CaseTypeId = typeof CASE_TYPES[number];
export const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export const SIZES = ['small', 'medium', 'large'] as const;
export type SellerSize = typeof SIZES[number];
export interface CaseSpec { version: number; type: CaseTypeId; difficulty: Difficulty; size: SellerSize; seed: number }
export type Brand = 'visa' | 'mastercard' | 'amex' | 'discover';
export type DisputeReason = 'fraudulent' | 'not_received' | 'subscription_canceled' | 'product_unacceptable' | 'credit_not_processed';
export interface Payment { id: string; ts: string; amount: Cents; brand: Brand; last4: string; buyerId: string }
export interface Dispute { id: string; paymentId: string; filedTs: string; amount: Cents; brand: Brand; reason: DisputeReason; status: 'open' | 'won' | 'lost' }
export interface Refund { id: string; paymentId: string; ts: string; amount: Cents }
export interface Hold { kind: 'fixed'; amount: Cents; releaseDate: string }
export interface Subject { kind: 'seller' | 'business-applicant' | 'campaign' | 'affiliate' | 'seller-group'; name: string; initials: string; accountAgeMonths: number }
export interface Trigger { kind: 'early-release'; heldAmount: Cents }
export interface EvidenceDoc { kind: 'ad-campaign-receipts'; title: string; note: string }
export type FlagKind = 'rate-hidden-by-growth' | 'mc-over-limit' | 'visa-over-limit' | 'refunds-low-disputes-high' | 'young-account-fast-growth';
export type Severity = 'critical' | 'high' | 'medium';
export type ActionKind = 'approve' | 'approve-smaller-hold' | 'partial-release' | 'deny' | 'hold-payouts' | 'refund-buyers' | 'block' | 'escalate';
export type DataTab = 'overview' | 'transactions' | 'disputes' | 'balance' | 'statements' | 'owners' | 'links' | 'payout-programs';
export interface Evidence { tab: DataTab; ids: string[] }
export interface Flag { id: string; kind: FlagKind | 'analyst'; severity: Severity; title: string; why: string; evidence: Evidence; state: 'raised' | 'confirmed' | 'dismissed'; note: string; addedBy: 'rules' | 'analyst' }
export interface Decision { action: ActionKind; keep: Cents; release: Cents; reviewDate: string }
export interface GroundTruth { planted: FlagKind[]; lookAlikes: FlagKind[]; acceptable: ActionKind[]; adjacent: ActionKind[] }
export interface ForgedCase { code: string; displayId: string; spec: CaseSpec; actualType: CaseTypeId; surprise: boolean; asOf: string; subject: Subject; trigger: Trigger; payments: Payment[]; disputes: Dispute[]; refunds: Refund[]; holds: Hold[]; docs: EvidenceDoc[]; story: string; groundTruth: GroundTruth; policyAffectedEstimate: number }
export interface ActivityEntry { ts: string; who: string; what: string }
