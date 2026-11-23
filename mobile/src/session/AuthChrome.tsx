import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../ui/theme';

/**
 * Relay's auth screen atmosphere, from frontend/src/auth.css: a soft top accent glow and a
 * diagonal sun-ray beam behind the centred logo and card. Static by design so reduced motion
 * needs no special handling.
 */
export function AuthBackdrop() {
  const { scheme, colors } = useTheme();
  const dark = scheme === 'dark';
  const base = dark ? '#050607' : colors.page;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { backgroundColor: base }]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 400 850" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="authTopGlow" cx="50%" cy="6%" rx="68%" ry="38%">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity={dark ? 0.34 : 0.16} />
            <Stop offset="55%" stopColor={colors.accent} stopOpacity={dark ? 0.1 : 0.05} />
            <Stop offset="100%" stopColor={base} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="authSunRay" x1="18%" y1="0%" x2="82%" y2="100%">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity={0} />
            <Stop offset="34%" stopColor={colors.accent} stopOpacity={dark ? 0.2 : 0.11} />
            <Stop offset="52%" stopColor={colors.accentText} stopOpacity={dark ? 0.24 : 0.13} />
            <Stop offset="72%" stopColor={colors.accent} stopOpacity={dark ? 0.08 : 0.04} />
            <Stop offset="100%" stopColor={base} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="authTopFade" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor={base} stopOpacity={0.9} />
            <Stop offset="100%" stopColor={base} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="400" height="850" fill={base} />
        <Rect x="0" y="0" width="400" height="520" fill="url(#authTopGlow)" />
        <Polygon points="85,0 320,0 190,850 -40,850" fill="url(#authSunRay)" />
        <Rect x="0" y="0" width="400" height="120" fill="url(#authTopFade)" />
      </Svg>
    </View>
  );
}

/** Centred Relay icon, wordmark and tagline, matching AuthBrand on the web. */
export function AuthBrand({ showTagline = true }: { showTagline?: boolean }) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.brand}>
      <View style={[styles.logoFrame, { boxShadow: `0 10px 28px ${colors.shadow}` }]}>
        <Image style={styles.logo} source={require('../../assets/icon.png')} />
      </View>
      <Text style={[styles.wordmark, { color: colors.text }]}>Relay</Text>
      {showTagline && (
        <Text style={[type.footnote, { color: colors.muted, fontSize: 14 }]}>
          Log every set, track every PR.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { alignItems: 'center', gap: 6, marginBottom: 4 },
  logoFrame: { width: 72, height: 72, borderRadius: 16, overflow: 'hidden', marginBottom: 6 },
  logo: { width: 72, height: 72, borderRadius: 16 },
  wordmark: { fontSize: 28, fontWeight: '700', letterSpacing: -0.7, lineHeight: 31 },
});
