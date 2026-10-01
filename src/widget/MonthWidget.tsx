/**
 * "Hisaab this month" widget (Android, APK only): spent so far, safe to spend
 * today, and a day-by-day bar chart. Tapping opens Insights.
 */
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { formatINR } from '../engine/money';
import type { MonthWidgetState } from './actions';

type HexColor = `#${string}`;
const LIGHT = { bg: '#FFFFFF' as HexColor, text: '#1B1B1A' as HexColor, muted: '#6B6B66' as HexColor, bar: '#2a78d6' as HexColor, today: '#1F7A5C' as HexColor, empty: '#ECECE6' as HexColor };
const DARK = { bg: '#1E1E1C' as HexColor, text: '#F2F2EE' as HexColor, muted: '#A3A39C' as HexColor, bar: '#3987e5' as HexColor, today: '#4CC79B' as HexColor, empty: '#2A2A27' as HexColor };
const CHART_HEIGHT = 54;

function Body({ s, c }: { s: MonthWidgetState; c: typeof LIGHT }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'hisaab:///insights' }}
      accessibilityLabel={s.hidden ? 'Hisaab this month. Locked' : `Hisaab. Spent ${formatINR(s.spent_paise)} in ${s.month_name}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget text={`${s.month_name} so far`} style={{ fontSize: 12, color: c.muted }} />
          <TextWidget
            text={s.hidden ? 'Locked · tap to open' : formatINR(s.spent_paise, { paise: 'never' })}
            style={{ fontSize: s.hidden ? 15 : 24, fontWeight: '700', color: c.text }}
          />
        </FlexWidget>
        {!s.hidden && s.has_money && (
          <FlexWidget style={{ flexDirection: 'column', alignItems: 'flex-end' }}>
            <TextWidget text="Safe today" style={{ fontSize: 12, color: c.muted }} />
            <TextWidget text={formatINR(s.safe_per_day_paise, { paise: 'never' })} style={{ fontSize: 16, fontWeight: '700', color: c.today }} />
          </FlexWidget>
        )}
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', height: CHART_HEIGHT, flexDirection: 'row', alignItems: 'flex-end', flexGap: 2 }}>
        {s.bars.map((b, i) => (
          <FlexWidget
            key={i}
            style={{
              flex: 1,
              height: b == null || s.hidden ? 3 : Math.max(3, Math.round(b * CHART_HEIGHT)),
              backgroundColor: b == null || s.hidden ? c.empty : i + 1 === s.today ? c.today : c.bar,
              borderRadius: 2,
            }}
          />
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

export function monthWidget(state: MonthWidgetState) {
  return { light: <Body s={state} c={LIGHT} />, dark: <Body s={state} c={DARK} /> };
}
