import { worstBrandRate } from '../../checks/disputeMath';
import type { CaseView } from '../../app/derive';
import { RULES_V1 } from '../../domain/ruleset';
import { monthLabel } from '../../lib/dates';
import { pct } from '../../lib/money';
import { Icon } from '../Icon';

const BRAND_NAME = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover' } as const;

// The one-sentence reading of the dispute rate, with live numbers (ARCHITECTURE.md §6).
export function PlainWords({ view }: { view: CaseView }) {
  const { stats, flags } = view;
  const first = stats.judgedMonths[0];
  const last = stats.judgedMonths[stats.judgedMonths.length - 1];
  const range = first === undefined || last === undefined ? '—' : `${monthLabel(first)}–${monthLabel(last)}`;
  const side = stats.judgedRate >= RULES_V1.limits.visa ? 'over' : 'under';
  const worst = worstBrandRate(stats, RULES_V1);
  const hidden = flags.some(f => f.id === 'rate-hidden-by-growth');
  return (
    <div className="plain">
      <Icon name="info" />
      <div>
        <b>In plain words:</b>{' '}
        {!Number.isFinite(stats.judgedRate) ? 'No sales are old enough to judge yet.' : (
          <>
            {hidden
              ? `the ${pct(stats.rate30d)} looks safe only because most sales are too new to have been disputed yet. On sales old enough to judge (${range}), `
              : `on sales old enough to judge (${range}), `}
            <b>{pct(stats.judgedRate)} of payments were disputed</b>
            {`, which is ${side} Visa's ${pct(RULES_V1.limits.visa)} line.`}
            {hidden && worst ? ` ${BRAND_NAME[worst.brand]} alone is at ${pct(worst.rate)}.` : ''}
          </>
        )}
      </div>
    </div>
  );
}
