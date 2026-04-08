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

## Supabase setup

This project now includes:

- local IndexedDB persistence
- Supabase auth + cloud snapshot sync scaffolding
- SQL migration for profiles, app snapshots, meal captures, and private meal image storage
- an `analyze-meal` edge function template for AI calorie recognition

### 1. Copy environment variables

```bash
cp .env.example .env.local
```

Then fill:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_MEAL_FUNCTION`
- `VITE_SITE_URL`

### 2. Create Supabase resources

Run the SQL in:

```text
supabase/migrations/20260408_init_momentum.sql
```

This creates:

- `profiles`
- `app_state_snapshots`
- `meal_captures`
- private `meal-captures` storage bucket

### 2.5. Recommended CLI flow

Use the scripts already wired into `package.json`:

```bash
npm run supabase:login
npm run supabase:link
npm run supabase:db:push
npm run supabase:functions:deploy
```

If you want a full local Supabase stack for development:

```bash
npm run supabase:start
```

### 3. Deploy the edge function

The function template lives in:

```text
supabase/functions/analyze-meal/index.ts
```

Function secrets expected by the backend:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- optional `EDAMAM_APP_ID`
- optional `EDAMAM_APP_KEY`
- optional `NUTRITIONIX_APP_ID`
- optional `NUTRITIONIX_APP_KEY`

Template for function secrets:

```text
supabase/functions/.env.example
```

### 4. Product behavior after setup

- users can connect with an email magic link
- device state can sync to cloud
- cloud backup can be restored on another phone
- calorie photo/voice capture can call the `analyze-meal` function

## GitHub setup

After creating a new empty GitHub repository, connect it from this folder:

```bash
git remote add origin <your-repo-url>
git add .
git commit -m "Initial Momentum prototype"
git push -u origin main
```
