# Virtual Marauder's Map

A fully immersive Harry Potter themed virtual Marauder's Map built with Next.js 14, Tailwind CSS, Framer Motion, and Firebase Realtime Database.

## ✨ Features

### Immersive Experience
- **Full-screen map** - The map covers the entire browser viewport
- **"I solemnly swear..."** - Oath unlock screen to enter the map
- **"Mischief Managed"** - Press Escape to close the map with animation
- **Candlelight flicker effect** - Dynamic lighting overlay
- **Parchment texture** - Aged paper grain and burnt edges
- **Time of day** - Morning/Afternoon/Evening/Night with visual overlays
- **Curfew warnings** - Alert when out after hours

### Map Features
- **Room labels** - Great Hall, Library, Common Rooms, etc.
- **Secret passages** - Hidden dotted paths between locations
- **Moving staircases** - Animated staircase positions
- **House common room zones** - Glowing areas for each house

### Movement & Footprints
- **Arrow keys or WASD** - Move around the map
- **Shift to run** - Faster movement with running animation
- **Realistic footprint pairs** - Left/right alternating footsteps
- **Direction-aware footprints** - Footprints rotate based on movement
- **Ink fade effect** - Footprints fade like ink over time
- **House-colored trails** - Footprints match your house color

### Social Features
- **Proximity chat** - Talk to nearby wizards within range
- **Whisper mode** - Shorter chat range for private conversations
- **Owl delivery notifications** - Animated owl brings message alerts
- **Block & report system** - Safety features for moderation
- **Room system** - Auto-balancing chambers (20 users max each)

### Hidden UI
- **Slide-out panels** - UI hidden until hovered
- **Block list panel** - Slides from right edge
- **Chat panel** - Slides up from bottom

## Quick Start

1. Copy `.env.local.example` to `.env.local` and fill in Firebase config values.
2. Install dependencies: `npm install`
3. Run the dev server: `npm run dev`
4. Open http://localhost:3000

## Controls

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move |
| Shift + Move | Run (faster) |
| Scroll | Zoom in/out |
| Drag | Pan the map |
| Escape | Close map ("Mischief Managed") |

## Firebase Setup

- Enable **Anonymous** authentication in Firebase Auth.
- Create a **Realtime Database** (in test mode for local testing).
- Apply rules from `firebase/database.rules.json`.

## Free Hosting Options

### Option A: Vercel (recommended)
1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Set the environment variables from `.env.local.example` in the Vercel project settings.
4. Deploy. Vercel provides a public URL.

### Option B: Firebase Hosting
1. Install Firebase CLI and run `firebase login`.
2. Run `firebase init hosting` and select the project.
3. Set build output to `out` and run `npm run build` followed by `npx next export`.
4. Deploy with `firebase deploy`.

## Required Assets

- Add a parchment-style Hogwarts map image at `public/hogwarts-map.jpg`.

## Project Structure

```
src/
├── app/
│   ├── globals.css      # Parchment theme, animations
│   ├── layout.js        # Root layout
│   └── page.js          # Home page
├── components/
│   ├── MapContainer.js  # Main map logic, canvas rendering
│   └── ProximityChat.js # Chat UI with owl notifications
└── lib/
    ├── canvas.js        # Canvas drawing utilities, effects
    ├── firebase.js      # Firebase client setup
    ├── moderation.js    # Content filtering
    ├── npcs.js          # NPC system (disabled by default)
    └── proximity.js     # Distance helpers
```

## Tech Stack

- **Next.js 14** - App Router, React Server Components
- **Tailwind CSS** - Parchment color theme
- **Framer Motion** - Smooth animations
- **Firebase** - Auth + Realtime Database
- **HTML5 Canvas** - Efficient rendering with effects
