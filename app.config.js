// Extends app.json. The "preview-small" EAS profile sets HISAAB_SHRINK=1 to
// try Android code shrinking (R8) — smaller APK, but test that build fully
// before relying on it. Normal builds are unchanged.
module.exports = ({ config }) => {
  if (process.env.HISAAB_SHRINK !== '1') return config;
  return {
    ...config,
    plugins: [
      ...config.plugins,
      ['expo-build-properties', { android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } }],
    ],
  };
};
