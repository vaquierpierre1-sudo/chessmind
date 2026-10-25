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
  title: "Blindchess — Hear what you missed",
  description:
    "Blindchess is a talk-first chess coach for blind and visually impaired players. Import a finished game, hear every move reviewed by Stockfish, and ask the coach anything out loud.",
  applicationName: "Blindchess",
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
