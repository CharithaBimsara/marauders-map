"use client";

import dynamic from "next/dynamic";

const MapContainer = dynamic(() => import("@/components/MapContainer"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-parchment-900 via-parchment-800 to-parchment-900">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">✨</div>
        <p className="text-parchment-300 text-sm">Loading the map...</p>
      </div>
    </div>
  )
});

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <MapContainer />
    </main>
  );
}
