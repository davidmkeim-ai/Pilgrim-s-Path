// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Deno runtime, not part of the Expo/RN TS project -- has its own global types.
    ignores: ["dist/*", "supabase/functions/**"],
  }
]);
