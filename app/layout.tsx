import type { Metadata, Viewport } from "next";
import "@fontsource-variable/oxanium/wght.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://joansterjo-celonis.github.io/Screensaver/"),
  title: "Always-On Frame",
  description:
    "A physical flip-dot clock with selectable live weather, 2,048 verified public-domain paintings, and Joan Sterjo’s Posterjo archive.",
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
      "A physical flip-dot clock with selectable live weather, 2,048 verified public-domain paintings, and Joan Sterjo’s Posterjo archive.",
    type: "website",
    images: [
      {
        url: "https://joansterjo-celonis.github.io/Screensaver/og-flip-dot.png",
        width: 1200,
        height: 630,
        alt: "Always-On Frame — flip-dot clock and weather, public-domain painting, and Posterjo artwork",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Always-On Frame",
    description:
      "A physical flip-dot clock with selectable live weather, 2,048 verified public-domain paintings, and Joan Sterjo’s Posterjo archive.",
    images: ["https://joansterjo-celonis.github.io/Screensaver/og-flip-dot.png"],
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
