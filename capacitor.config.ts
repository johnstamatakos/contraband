import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.contraband.game',
  appName: 'Contraband',
  webDir: 'dist',
  server: {
    // Use https scheme on Android to avoid mixed-content issues with localStorage
    androidScheme: 'https',
  },
  ios: {
    // Allows WebGL (required for PixiJS) in WKWebView
    allowsLinkPreview: false,
    scrollEnabled: false,
  },
  plugins: {
    // No plugins needed yet — add as required (e.g. PushNotifications, Haptics)
  },
}

export default config
