import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://joansterjo-celonis.github.io/Screensaver/"),
  title: "Always-On Frame",
  description:
    "A living display with 18 generative signal scenes, 300 verified public-domain paintings, and 32 smart editorial compositions.",
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
      "A living display with 18 generative signal scenes, 300 verified public-domain paintings, and 32 smart editorial compositions.",
    type: "website",
    images: [
      {
        url: "https://joansterjo-celonis.github.io/Screensaver/og.png",
        width: 1731,
        height: 909,
        alt: "Always-On Frame — generative typography meets public-domain painting",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Always-On Frame",
    description:
      "A living display with 18 generative signal scenes, 300 verified public-domain paintings, and 32 smart editorial compositions.",
    images: ["https://joansterjo-celonis.github.io/Screensaver/og.png"],
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
