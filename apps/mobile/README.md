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
- Supabase mobile config reader
- RevenueCat preview setup
- HealthKit preview lane for a later iPhone dev build

### What still needs native wiring

- real camera and photo capture
- microphone / speech capture
- HealthKit bridge in a custom dev build
- App Store Connect products and RevenueCat offerings
