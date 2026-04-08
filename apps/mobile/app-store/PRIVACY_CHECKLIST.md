## Privacy Checklist

Use this as a working draft before filling App Store privacy answers.

### Data we currently expect

- account email
- optional profile display name
- habit state
- calorie / meal history
- meal photos if uploaded by the user
- voice meal note if recorded by the user
- subscription status

### Device capabilities used

- camera
- microphone
- notifications
- HealthKit on iPhone when explicitly enabled

### Things to prepare before submission

1. Publish a privacy policy URL.
2. Decide how long meal photos are retained.
3. Decide whether voice uploads are stored or only transcribed transiently.
4. Confirm what analytics stack will be used in production.
5. Confirm whether any third-party ad SDKs will exist. Right now they do not.

### Current app architecture notes

- Supabase stores account state, snapshots, and meal history.
- RevenueCat manages subscription status.
- OpenAI is used in the meal analysis backend flow.
- HealthKit should stay opt-in only.
