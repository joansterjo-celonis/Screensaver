import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://joansterjo-celonis.github.io/Screensaver/"),
  title: "Always-On Frame",
  description:
    "A living portrait display for generative typography and Renaissance painting.",
  applicationName: "Always-On Frame",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Always-On Frame",
  },
  formatDetection: { telephone: false },
  openGraph: {
    title: "Always-On Frame",
    description:
      "A living portrait display for generative typography and Renaissance painting.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Always-On Frame",
    description:
      "A living portrait display for generative typography and Renaissance painting.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#160c0f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
