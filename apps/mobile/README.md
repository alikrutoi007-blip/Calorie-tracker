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
