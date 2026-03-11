import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "PSP Lodge",
  description: "PSP logging and reporting",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} antialiased`}
      >
        <Providers>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <footer className="px-6 pb-6 pt-2 text-center text-xs text-[var(--muted-foreground)]">
              <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1">
                <span>Created by</span>
                <a
                  href="https://www.readx.com.au"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 align-middle -translate-y-[1px]"
                >
                  <img src="/readx.png" alt="readX" className="h-2.5 w-auto" />
                </a>
                <span>- OnSite-B - All rights reserved.</span>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
