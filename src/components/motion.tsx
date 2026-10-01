/**
 * Small, calm motion. Everything is skipped when the phone's "Reduce motion"
 * (Remove animations) setting is on.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { usePalette } from './theme';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** Fades in and settles up a few pixels when it first appears. */
export function FadeIn({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduce) {
      v.setValue(1);
      return;
    }
    const anim = Animated.timing(v, { toValue: 1, duration: 320, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    const safety = setTimeout(() => v.setValue(1), delay + 900); // never leave content invisible
    return () => {
      anim.stop();
      clearTimeout(safety);
    };
  }, [v, delay, reduce]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** A green tick that pops and fades each time `pulse` changes (after a save). */
export function SaveCheck({ pulse }: { pulse: number }) {
  const p = usePalette();
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (pulse === 0 || reduce) return;
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 180, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
      Animated.timing(v, { toValue: 2, duration: 420, delay: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [pulse, reduce, v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.check,
        {
          backgroundColor: p.accent,
          opacity: v.interpolate({ inputRange: [0, 0.2, 1, 2], outputRange: [0, 1, 1, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1, 2], outputRange: [0.4, 1, 1.15] }) }],
        },
      ]}
    >
      <Icon name="check" size={34} color={p.accentText} />
    </Animated.View>
  );
}

/** Animates a number from its last value to the new one (for display only). */
export function useCountUp(target: number, duration = 550): number {
  const reduce = useReduceMotion();
  const [v] = useState(() => new Animated.Value(target));
  const [shown, setShown] = useState(target);
  useEffect(() => {
    const id = v.addListener(({ value }) => setShown(Math.round(value)));
    return () => v.removeListener(id);
  }, [v]);
  useEffect(() => {
    if (reduce) {
      v.setValue(target);
      return;
    }
    const anim = Animated.timing(v, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    const safety = setTimeout(() => v.setValue(target), duration + 400);
    return () => {
      anim.stop();
      clearTimeout(safety);
    };
  }, [target, duration, reduce, v]);
  return shown;
}

const styles = StyleSheet.create({
  check: {
    position: 'absolute', alignSelf: 'center', top: '18%', width: 64, height: 64, borderRadius: 32,
    alignItems: 'center', justifyContent: 'center',
  },
});
