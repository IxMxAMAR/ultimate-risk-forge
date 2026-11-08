export const RULES_V1 = {
  version: '1.1',
  judgedAfterDays: 60,
  windowDays: 30,
  minBrandPayments: 30,
  limits: { visa: 0.015, mcEcm: 0.015, mcHecm: 0.03 },
  mcFines: { ecm: [0, 100000, 100000, 500000], hecm: [0, 100000, 200000, 1000000] },
  disputeFeeAssumed: 1500,
  holdBuffer: 1.05,
  holdRoundTo: 100000,
  secondReviewAt: 5000000,
  growthMin: 3,
  hiddenRatioMin: 2,
  refundsLowRatio: 0.5,
  refundsLowMinRate: 0.01,
  youngAccountMonths: 6,
  escalateAt: 2,
} as const;
export type Ruleset = typeof RULES_V1;
