import type { Metadata, Viewport } from "next";
import { Manrope, Newsreader } from "next/font/google";
import "./globals.css";

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const serif = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "ChessMind — Hear what you missed",
  description:
    "A voice-first chess coach for blind and visually impaired players. Import a game, let Stockfish find the turning points, and talk through them out loud.",
  applicationName: "ChessMind",
};

export const viewport: Viewport = {
  themeColor: "#f5f2e9",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>
        <a className="skip-link" href="#content">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
