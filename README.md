# Virtual Marauder's Map

A lightweight, immersive, Harry Potter–inspired multiplayer map where users appear as footprints and can chat when nearby. Built with Next.js 14, Tailwind CSS, Framer Motion, and Firebase Realtime Database.

## Overview

- **What it is:** Real-time, canvas-driven map with directional footprints, time-of-day effects, room zones, and proximity chat.
- **Primary use:** Prototype social interactions and spatial chat mechanics in a themed environment.

## Features

- Full-screen, parchment-styled map with burnt edges and candle flicker
- Direction-aware, house-colored footprints with ink-fade trails
- Moving staircases, room labels, secret passages, and common-room zones
- Proximity chat with whisper mode and owl notifications
- Block/report moderation and a 20-user-per-room cap

## Tech Stack

- Next.js 14 (App Router)
- Tailwind CSS
- Framer Motion
- Firebase Auth (Anonymous) + Realtime Database
- HTML5 Canvas for rendering

## Quick Start

1. Copy `.env.local.example` to `.env.local` and provide Firebase values.
2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

4. Open http://localhost:3000 in your browser.

## Controls

- Arrow keys / WASD — Move
- Shift + Move — Run (faster)
- Scroll — Zoom
- Drag — Pan
- Escape — Close map ("Mischief Managed")

## Firebase Setup

- Enable **Anonymous** authentication in Firebase Auth.
- Create a Realtime Database and apply rules from `firebase/database.rules.json`.

## Deployment

- Recommended: Vercel — connect the repository, set env vars, and deploy.
- Alternative: Firebase Hosting using the Firebase CLI (see project docs for export steps).

## Project Layout (key files)

- `src/app/*` — Root layout, global styles
- `src/components/MapContainer.js` — Canvas rendering and main map logic
- `src/components/ProximityChat.js` — Chat UI and notifications
- `src/lib/firebase.js` — Firebase client initialization
- `src/lib/canvas.js` — Drawing helpers (footprints, effects)

## Notes

- The project includes a parchment theme and time-of-day overlays; tweak `src/app/globals.css` and `tailwind.config.js` for styling.
- For local testing, using relaxed Firebase rules is common; tighten them before production.

---
