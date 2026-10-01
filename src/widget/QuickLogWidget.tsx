/**
 * The home-screen widget (Android). Only loaded when the native widget
 * module exists (the installed APK) — never in Expo Go. Rendered to native
 * views, so it uses the library's primitives, not React Native components.
 */
import glyphMap from '@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json';
import { FlexWidget, IconWidget, TextWidget } from 'react-native-android-widget';
import { formatINR } from '../engine/money';
import type { WidgetState } from './actions';

type HexColor = `#${string}`;
interface Colors {
  bg: HexColor;
  surface: HexColor;
  text: HexColor;
  muted: HexColor;
  accent: HexColor;
  accentText: HexColor;
  accentSoft: HexColor;
}
const LIGHT: Colors = {
  bg: '#FFFFFF', surface: '#F2F2EE', text: '#1B1B1A', muted: '#6B6B66',
  accent: '#1F7A5C', accentText: '#FFFFFF', accentSoft: '#DDF0E8',
};
const DARK: Colors = {
  bg: '#1E1E1C', surface: '#2A2A27', text: '#F2F2EE', muted: '#A3A39C',
  accent: '#4CC79B', accentText: '#0E2A20', accentSoft: '#1D3A2F',
};

const ICON_FONT = 'MaterialCommunityIcons';
const glyph = (name: string): string | null => {
  const code = (glyphMap as Record<string, number>)[name];
  return code ? String.fromCodePoint(code) : null;
};

function Glyph({ name, size, color }: { name: string; size: number; color: HexColor }) {
  const g = glyph(name);
  return g ? (
    <IconWidget font={ICON_FONT} icon={g} size={size} style={{ color }} />
  ) : (
    <TextWidget text={name} style={{ fontSize: size - 2, color }} />
  );
}

function Body({ state, c }: { state: WidgetState; c: Colors }) {
  const amount = formatINR(state.safe_per_day_paise, { paise: 'never' });
  return (
    <FlexWidget
      style={{
        height: 'match_parent', width: 'match_parent', backgroundColor: c.bg, borderRadius: 22,
        padding: 14, flexDirection: 'column', justifyContent: 'space-between',
      }}
      clickAction="OPEN_APP"
      accessibilityLabel={state.hidden ? 'Hisaab. Locked' : `Hisaab. Safe to spend today ${amount}`}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <FlexWidget style={{ flexDirection: 'column' }}>
          <TextWidget
            text={state.hidden ? 'Hisaab' : state.last_saved ? state.last_saved.label : 'Safe to spend today'}
            style={{ fontSize: 12, color: state.last_saved && !state.hidden ? c.accent : c.muted }}
          />
          <TextWidget
            text={state.hidden ? 'Locked · tap to open' : state.has_money ? amount : 'Add your balance'}
            style={{ fontSize: state.has_money && !state.hidden ? 26 : 16, fontWeight: '700', color: c.text }}
          />
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
          {state.last_saved && (
            <FlexWidget
              clickAction="UNDO"
              accessibilityLabel="Undo"
              style={{ backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <TextWidget text="Undo" style={{ fontSize: 13, fontWeight: '700', color: c.text }} />
            </FlexWidget>
          )}
          <FlexWidget
            clickAction="OPEN_URI"
            clickActionData={{ uri: 'hisaab://' }}
            accessibilityLabel="Add an expense"
            style={{ backgroundColor: c.accent, borderRadius: 20, width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}
          >
            <Glyph name="plus" size={24} color={c.accentText} />
          </FlexWidget>
        </FlexWidget>
      </FlexWidget>

      {state.picks.length > 0 ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
          {state.picks.map((p) => (
            <FlexWidget
              key={`${p.category_id}-${p.amount_paise}`}
              clickAction="LOG"
              clickActionData={{ category_id: p.category_id, amount_paise: p.amount_paise }}
              accessibilityLabel={`Log ${formatINR(p.amount_paise)} ${p.name}`}
              style={{
                flex: 1, backgroundColor: c.accentSoft, borderRadius: 14, paddingVertical: 9,
                flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGap: 6,
              }}
            >
              <Glyph name={p.icon} size={16} color={c.accent} />
              <TextWidget text={formatINR(p.amount_paise)} style={{ fontSize: 14, fontWeight: '700', color: c.text }} />
            </FlexWidget>
          ))}
        </FlexWidget>
      ) : state.hidden ? (
        <TextWidget text="Amounts are hidden while Hisaab is locked." style={{ fontSize: 12, color: c.muted }} />
      ) : (
        <TextWidget text="Log a spend in the app and it shows up here for one-tap logging." style={{ fontSize: 12, color: c.muted }} />
      )}
    </FlexWidget>
  );
}

/** Light and dark versions; Android picks the one matching the phone theme. */
export function quickLogWidget(state: WidgetState) {
  return { light: <Body state={state} c={LIGHT} />, dark: <Body state={state} c={DARK} /> };
}
