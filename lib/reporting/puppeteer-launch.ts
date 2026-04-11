import fs from "fs";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

export async function getBrowserForPdf() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 900 },
      executablePath,
      headless: true,
    });
  }
  const localChromePaths = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.CHROME_PATH,
    process.env.CHROME_EXECUTABLE_PATH,
  ].filter(Boolean) as string[];

  const executablePath = localChromePaths.find((p) => {
    try {
      fs.accessSync(p);
      return true;
    } catch {
      return false;
    }
  });

  if (!executablePath) {
    throw new Error(
      "Chrome not found for local PDF generation. Install Google Chrome or set CHROME_PATH.",
    );
  }

  return puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1200, height: 900 },
    executablePath,
    headless: true,
  });
}
