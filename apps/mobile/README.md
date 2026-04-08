## Momentum Mobile

Expo workspace for the native iPhone version of Momentum.

### Setup

```bash
cp .env.example .env
npm install
npm run start
```

Fill these env values before testing cloud or subscriptions:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`

### What is already scaffolded

- Habits, calories, insights, and settings tabs
- local reminder flow with `expo-notifications`
- email/password Supabase auth lane with session persistence
- real camera + voice capture path for meal analysis
- RevenueCat product and checkout scaffolding
- HealthKit lane for an iPhone dev build

### What still needs native wiring

- install dependencies with `npm install`
- run `npx expo prebuild` from this folder, not from the repo parent
- on Windows use `eas build -p ios --profile preview` instead of `expo run:ios`
- add App Store Connect products and RevenueCat offerings

### EAS build flow

For the first installable iPhone build on Windows:

```bash
npm run eas:login
npm run eas:configure
npm run ios:cloud
```

Build profiles:

- `npm run ios:dev`
  Creates a development client build.
- `npm run ios:cloud`
  Creates an internal preview build without requiring `expo-dev-client`.
- `npm run ios:store`
  Creates the future App Store build.

### Apple account note

`EAS Build` for iOS needs an Apple account that is enrolled in the Apple Developer Program.
Without that membership, cloud iOS signing and TestFlight/App Store delivery will fail even if Expo login succeeds.
