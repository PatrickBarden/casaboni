<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Casaboni - Setup Local

This project was exported from AI Studio and adapted to run locally with Firebase + Gemini.

## Prerequisites

- Node.js 20+

## Run locally

1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example`
3. Fill at least:
   - `GEMINI_API_KEY`
   - `APP_URL` (for local use, `http://localhost:3000`)
4. Start development server:
   `npm run dev`
5. Open:
   `http://localhost:3000`

## Optional: use a different local port

Set `PORT` in `.env.local` (example: `PORT=3100`).

## Database connection (Casaboni Firebase/Firestore)

By default, the app uses `firebase-applet-config.json`.
To connect to the real Casaboni Firebase project, set these variables in `.env.local`:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (optional)
- `VITE_FIREBASE_DATABASE_ID` (Firestore database id)

After saving `.env.local`, restart `npm run dev`.
