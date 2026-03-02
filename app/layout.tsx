import type { Metadata } from "next";
import { DM_Mono, Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const displayFont = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const codeFont = DM_Mono({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "500"],
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
        className={`${displayFont.variable} ${bodyFont.variable} ${codeFont.variable} antialiased`}
      >
        <Providers>
          <div className="flex min-h-screen flex-col">
            <div className="flex-1">{children}</div>
            <footer className="px-6 pb-6 pt-2 text-center text-xs text-[var(--muted-foreground)]">
              <div>
                AppName - Version - Created By{" "}
              <a
                href="https://www.readx.com.au"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 align-middle -translate-y-[2px]"
              >
                <img
                  src="https://github.com/federonco/readx-assets/blob/main/readX%20orange.png?raw=true"
                  alt="readX"
                  className="h-2.5"
                />
                <sup className="text-[8px]">TM</sup>
              </a>{" "}
              </div>
              <div>All Rights Reserved</div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
