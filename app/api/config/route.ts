import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    reportDefaultEmail: process.env.REPORT_DEFAULT_EMAIL ?? "",
  });
}
