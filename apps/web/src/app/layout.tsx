import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Analytics } from "@vercel/analytics/react";

import { EnvironmentBanner } from "@/components/shared/EnvironmentBanner";
import {
  ENVIRONMENT_BANNER_OFFSET,
  isEnvironmentBannerShown,
} from "@/lib/environmentBanner";

import "./globals.css";
import { Providers } from "./providers";

const title = "L@tr.link";
const description = "Save now. Read later. Yours everywhere.";

export const metadata: Metadata = {
  metadataBase: new URL("https://latr.link"),
  applicationName: title,
  title: {
    default: title,
    template: `%s · ${title}`,
  },
  description,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  referrer: "origin-when-cross-origin",
  openGraph: {
    title,
    description,
    url: "https://latr.link",
    siteName: title,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const htmlStyle = {
    "--env-banner-offset": isEnvironmentBannerShown()
      ? ENVIRONMENT_BANNER_OFFSET
      : "0px",
  } as CSSProperties;

  return (
    <html lang="en" className="h-full antialiased" style={htmlStyle}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if(location.protocol==="http:"&&(location.hostname==="localhost"||location.hostname==="[::1]")){location.replace("http://127.0.0.1"+(location.port?":"+location.port:"")+location.pathname+location.search+location.hash)}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
        <Providers>
          <EnvironmentBanner />
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
