import { redirect } from "next/navigation";

/** Legacy URL: forwards query params to /login */
export default async function LegacyAuthLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  const r = sp.redirect;
  if (typeof r === "string" && r.startsWith("/")) q.set("next", r);
  const qs = q.toString();
  redirect(`/login${qs ? `?${qs}` : ""}`);
}
