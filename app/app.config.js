// Dynamic Expo config.
//
// The Arkose React Native SDK ships as a .tgz from your Arkose CSM (it is not on npm).
// Once you install it, the config plugin below MUST be enabled (SDK v2.15.0+), otherwise
// the native Android component is not wired in during `expo prebuild`. This file turns the
// plugin on automatically when the package is present, so the app still builds, in
// simulation mode, before you have the SDK.

const plugins = [
  'expo-router',
  // Dev only: lets Android talk to the local http:// mock server. Remove for production builds.
  ['expo-build-properties', { android: { usesCleartextTraffic: true } }],
];

let arkoseSdkInstalled = false;
try {
  require.resolve('react-native-arkoselabs/app.plugin.js');
  plugins.push('react-native-arkoselabs/app.plugin.js'); // explicit path, per the SDK docs
  arkoseSdkInstalled = true;
} catch {
  // SDK not installed yet: native flows run in simulation mode
}

module.exports = {
  expo: {
    name: 'Wayfarer (Arkose Demo)',
    slug: 'arkose-travel-demo',
    scheme: 'wayfarer',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.example.wayfarerdemo',
      infoPlist: {
        // Dev only: allow http:// to local-network hosts (the mock server on your LAN).
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      },
    },
    android: {
      package: 'com.example.wayfarerdemo',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: { bundler: 'metro', output: 'single', favicon: './assets/favicon.png' },
    plugins,
    extra: { arkoseSdkInstalled },
  },
};
