import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Forms" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
