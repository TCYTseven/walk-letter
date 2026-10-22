import type { Metadata, Viewport } from "next";
import { Caveat, Fredoka } from "next/font/google";
import "./globals.css";

const caveat = Caveat({ subsets: ["latin"], variable: "--font-hand", weight: ["400", "500", "600", "700"] });
const fredoka = Fredoka({ subsets: ["latin"], variable: "--font-ui", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "A golden-hour walk",
  description: "A photo walk and a letter you can make your own.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#cfe6ff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${caveat.variable} ${fredoka.variable}`}>
      <body>{children}</body>
    </html>
  );
}
