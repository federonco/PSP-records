import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const unifiedSectionId = searchParams.get("unified_section_id");
  const subsectionId = searchParams.get("subsection_id");
  const recipientEmail = searchParams.get("recipient_email");

  if (!unifiedSectionId) {
    return NextResponse.json({ error: "Missing unified_section_id" }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const response = await fetch(new URL("/api/psp/audit-report", request.url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      unified_section_id: unifiedSectionId,
      subsection_id: subsectionId,
      recipient_email: recipientEmail,
      locationName: unifiedSectionId,
    }),
  });

  const payload = await response.json();
  return NextResponse.json(payload, { status: response.status });
}
