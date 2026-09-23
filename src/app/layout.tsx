import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getCurrentUser } from "@/lib/auth/session";
import { ToastProvider } from "@/components/ui/toast";
import "../styles/globals.css";

/**
 * Inter is loaded through `next/font` so it is self-hosted, subset and
 * preloaded — no render-blocking request to a third party, and no layout
 * shift when it arrives.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Livn",
    template: "%s - Livn",
  },
  description:
    "Personal Life OS: rencanakan, kerjakan, catat, ukur, lalu perbaiki.",
  applicationName: "Livn",
  robots: { index: false, follow: false },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#131312" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // The theme must be on <html> before first paint, otherwise a dark-mode user
  // sees a white flash. A blocking inline script is the only way to do this
  // correctly with server rendering.
  //
  // A signed-in user's own choice wins. Everyone else follows the OS, including
  // the public landing page — the grid backdrop carries tokens for both palettes
  // so it reads correctly either way.
  const theme = user?.themePreference ?? "system";

  return (
    <html lang="id" data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <head>
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=${JSON.stringify(theme)};if(t==="system"||!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}if(t!=="system"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-md focus:border focus:border-border-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-raised"
        >
          Lompat ke konten utama
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
