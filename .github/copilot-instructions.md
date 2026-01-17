# Virtual Marauder's Map - Development Guide

## Project Overview
Harry Potter themed virtual Marauder's Map - a real-time multiplayer web application where users appear as footprints on an enchanted map.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: JavaScript
- **Styling**: Tailwind CSS with custom parchment theme
- **Animation**: Framer Motion
- **Backend**: Firebase (Anonymous Auth + Realtime Database)
- **Rendering**: HTML5 Canvas

## Key Files

### Components
- `src/components/MapContainer.js` - Main map component with Canvas rendering, all game logic
- `src/components/ProximityChat.js` - Chat UI with owl notifications

### Libraries
- `src/lib/canvas.js` - Canvas drawing utilities (footprints, effects, room labels, etc.)
- `src/lib/firebase.js` - Firebase client initialization
- `src/lib/npcs.js` - NPC system (currently disabled)
- `src/lib/proximity.js` - Distance calculation helpers
- `src/lib/moderation.js` - Content filtering for chat

### Styles
- `src/app/globals.css` - Parchment theme, magic animations, immersive effects
- `tailwind.config.js` - Custom color palette (parchment-50 to parchment-900)

## Firebase Structure
```
rooms/
  {roomId}/
    users/
      {uid}/
        x, y, house, name, isIdle, direction, isRunning, updatedAt
    messages/
      {chatId}/
        participants/
        messages/
        status/
    blocks/
      {uid}/
        {blockedUid}: true
    reports/
      {reportedUid}/
        {reporterUid}: true
```

## Features Implemented
- Full-screen immersive map with hidden UI panels
- Oath unlock ("I solemnly swear...")
- Mischief Managed close animation (Escape key)
- Candlelight flicker effect
- Parchment texture overlay with burnt edges
- Time of day system (morning/afternoon/evening/night)
- Curfew warnings after hours
- Room labels and secret passages on map
- Moving staircases
- House common room zones
- Realistic footprint pairs (left/right alternating)
- Direction-aware footprints
- Running with Shift key
- House-colored footprint trails
- Proximity chat with whisper mode
- Owl delivery notifications
- Block/report/unblock system
- Room system with 20-user cap

## Commands
- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run lint` - ESLint check

## Controls
- Arrow keys / WASD - Move
- Shift + Move - Run
- Scroll - Zoom
- Drag - Pan
- Escape - Close map

