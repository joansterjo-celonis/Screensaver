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
    "A living display of generative signal scenes, 2,048 verified public-domain paintings, and Joan Sterjo’s Posterjo artwork archive.",
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
      "Generative signal scenes, 2,048 verified public-domain paintings, and Joan Sterjo’s Posterjo artwork archive.",
    type: "website",
    images: [
      {
        url: "https://joansterjo-celonis.github.io/Screensaver/og-posterjo.png",
        width: 1731,
        height: 909,
        alt: "Always-On Frame — generative typography, public-domain painting, and Posterjo artwork",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Always-On Frame",
    description:
      "Generative signal scenes, 2,048 verified public-domain paintings, and Joan Sterjo’s Posterjo artwork archive.",
    images: ["https://joansterjo-celonis.github.io/Screensaver/og-posterjo.png"],
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
