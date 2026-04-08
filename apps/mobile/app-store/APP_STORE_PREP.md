## Momentum App Store Prep

This folder is the release-prep pack for the native iPhone version of Momentum.

### Current status

- Expo mobile workspace: ready
- Supabase auth + sync lane: ready
- camera + voice meal capture lane: ready
- RevenueCat scaffolding: ready
- HealthKit lane: scaffolded
- Apple Developer membership: required before iOS release builds
- App Store Connect app record: still needed
- real subscription products in App Store Connect: still needed

### Suggested release sequence

1. Finish Apple Developer enrollment.
2. Create the app in App Store Connect using bundle ID `com.momentum.mobile`.
3. Create iOS subscription products:
   - monthly
   - yearly
4. Map those products in RevenueCat.
5. Create an internal preview build with `npm run ios:cloud`.
6. Test on iPhone.
7. Create a production build with `npm run ios:store`.
8. Submit through EAS or App Store Connect.

### App Store metadata draft

App name:

```text
Momentum
```

Subtitle:

```text
Habits, Calories, Daily Rhythm
```

Promotional text:

```text
Build a lighter daily rhythm with one-tap habits, photo-first calorie logging, and supportive insights that make it easier to come back tomorrow.
```

Description:

```text
Momentum helps you keep healthy routines without turning your phone into a spreadsheet.

Track daily habits with one-tap completion, log meals with photo, voice, or natural language, and see calm insights that support consistency instead of guilt.

Momentum is built around a low-friction loop:
- check in quickly
- close one habit
- confirm one meal
- return tomorrow without pressure

Key features:
- habit tracker designed for phones
- calorie tracking with photo, voice, and editable AI confirmation
- cloud sync with account login
- sleep and recovery lane prepared for HealthKit
- premium-ready subscription layer for advanced coaching

Momentum is designed to feel lightweight, focused, and easy to return to every day.
```

Keywords:

```text
habit tracker,calorie tracker,nutrition,wellness,meal log,sleep tracker,routine,self improvement,health
```

Support URL:

```text
replace-with-your-support-url
```

Marketing URL:

```text
replace-with-your-website-url
```

Privacy Policy URL:

```text
replace-with-your-privacy-policy-url
```

### Release notes draft

```text
Momentum launches with one-tap habit tracking, cloud sync, photo and voice calorie capture, favorites, recent meals, and a calm insights flow built for iPhone.
```

### Screenshot checklist

Prepare at least these iPhone screenshots:

- habits home with hero and rhythm cards
- calorie capture with photo + voice lane
- meal confirmation with macros
- insights screen
- settings / profile / subscriptions screen

### Review notes draft

```text
Momentum uses Supabase for account login and cloud sync. The calorie flow supports text, voice, and photo-based meal capture. Subscription products are managed by RevenueCat and App Store Connect. HealthKit is only used when the user explicitly grants access on supported iPhones.
```
