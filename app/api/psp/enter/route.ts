import { NextRequest, NextResponse } from "next/server";
import { resolveQrScope } from "@/lib/psp/resolve-qr-scope";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 400 });
  }

  const resolved = await resolveQrScope(token);
  if (!resolved.ok) {
    if (resolved.status !== 404) {
      console.error("[psp/enter] resolve error", {
        tokenPrefix: token.slice(0, 8),
        error: resolved.error,
      });
    } else {
      console.error("[psp/enter] token not found", {
        tokenPrefix: token.slice(0, 8),
      });
    }
    return NextResponse.json(
      { error: resolved.error },
      { status: resolved.status },
    );
  }

  const { scope } = resolved;
  if (scope.type === "section") {
    return NextResponse.json({ type: "section", ...scope.section });
  }

  return NextResponse.json({
    type: "subsection",
    ...scope.subsection,
    sections: scope.section,
  });
}
