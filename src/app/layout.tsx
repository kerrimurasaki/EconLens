import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EconLens AI", template: "%s · EconLens AI" },
  description: "Turn real-world events into rigorous, interactive economics lessons.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
