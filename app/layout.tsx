import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Escrow Account & Funds Release Management System",
  description:
    "Secure escrow management prototype for regulated institutions. All data shown is TEST/DEVELOPMENT DATA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
