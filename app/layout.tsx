import type { Metadata } from "next";
import Image from "next/image";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSplashGate } from "@/components/workspace/app-splash-gate";
import "./globals.css";

export const metadata: Metadata = {
  title: "Markune",
  description: "A quiet Markdown workspace for local notes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" data-app-splash="active">
        <div className="app-splash" aria-label="Markune is loading">
          <main className="app-splash__content">
            <Image
              className="app-splash__logo block dark:hidden"
              src="/brand/markune-logo-dark.svg"
              alt=""
              width={32}
              height={32}
              priority
            />
            <Image
              className="app-splash__logo hidden dark:block"
              src="/brand/markune-logo-light.svg"
              alt=""
              width={32}
              height={32}
              priority
            />
            <div className="app-splash__line" aria-hidden="true">
              <span />
            </div>
          </main>
        </div>
        <ThemeProvider>
          <AppSplashGate />
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
