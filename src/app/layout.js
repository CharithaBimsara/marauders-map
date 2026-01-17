import "./globals.css";

export const metadata = {
  title: "Virtual Marauder's Map",
  description: "A parchment-styled, real-time Hogwarts map experience.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen bg-parchment-100 text-parchment-900 font-magical touch-none">
        {children}
      </body>
    </html>
  );
}
