# Momentum

Momentum is an iPhone-first habit and nutrition app prototype built with Vite and React.
It is designed around low-friction daily return loops: one-tap habits, a 7-day rhythm, calorie tracking, sleep logging, insights, and a bottom journal.

## Current product scope

- Habit tracker with edit and delete flows
- Spark animation when habits are completed
- 7-day rhythm that fits a phone screen
- Calorie tracking with manual logging and quick-add chips
- Photo and voice capture lane prepared for future AI meal recognition
- Sleep tracking with manual entry
- Weekly insights and psychology-friendly summaries
- Onboarding for first launch

## Local development

```bash
npm install
npm run dev
```

To build production files:

```bash
npm run build
```

To lint the project:

```bash
npm run lint
```

## iPhone testing

Run the Vite dev server and open the local network URL on an iPhone that is connected to the same Wi-Fi network.

This web build is tuned for:

- Safari on iPhone
- Add to Home Screen mode
- safe-area aware bottom navigation

## Planned native path

The web version already prepares the product flow for:

- photo-based calorie capture
- voice meal logging
- future HealthKit sync
- Expo / App Store migration

Recommended next step for production iPhone features:

1. Migrate this UI to Expo / React Native.
2. Add native speech, camera, and HealthKit bridges.
3. Connect a nutrition pipeline for food recognition and calorie estimation.

## GitHub setup

After creating a new empty GitHub repository, connect it from this folder:

```bash
git remote add origin <your-repo-url>
git add .
git commit -m "Initial Momentum prototype"
git push -u origin main
```
