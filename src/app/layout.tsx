import type { Metadata } from "next";

import "./globals.css";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { Providers } from "@/components/Providers";
import { SmoothScroll } from "@/components/SmoothScroll";


export const metadata: Metadata = {
  title: "Skillforce Cloud",
  description:
    "Our LMS is a complete e-learning solution with modern, interactive learning.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* THEME INIT SCRIPT */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
          try {
            const theme = localStorage.getItem('theme') || 'system';
            if (
              theme === 'dark' ||
              (theme === 'system' &&
                window.matchMedia('(prefers-color-scheme: dark)').matches)
            ) {
              document.documentElement.classList.add('dark');
            }
          } catch (e) {}
        `,
          }}
        />

        {/* ✅ FAVICONS (IMPORTANT) */}
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>

      <body suppressHydrationWarning>
        <Providers>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
         

            {children}

            {/* UI / utilities */}
            <SmoothScroll />
            <Toaster />
            <Analytics />
            <SpeedInsights />
          </ThemeProvider>
        </Providers>
      </body>

    </html>
  );
}
