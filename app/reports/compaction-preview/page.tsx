import { renderCompactionHTML } from "@/lib/reports/compaction-html";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getHistoricalBlocksFromChainages } from "@/lib/psp-logic";
import type { CompactionTemplateData } from "@/lib/reporting/compaction";

type PreviewProps = {
  searchParams?: Promise<{ location_id?: string; reportNum?: string; blockId?: string; dateFrom?: string; dateTo?: string }>;
};

function extractPreviewHtml(html: string) {
  const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const style = styleMatch ? `<style>${styleMatch[1]}</style>` : "";
  const body = bodyMatch ? bodyMatch[1] : html;
  return `${style}${body}`;
}

export default async function CompactionPreviewPage({ searchParams }: PreviewProps) {
  const params = searchParams ? await searchParams : undefined;
  const supabase = getSupabaseServer({ useServiceRole: true });
  const reportNum = Number.parseInt(params?.reportNum ?? "1", 10);

  const { data: locations, error: locationError } = await supabase
    .from("locations")
    .select("id,name")
    .eq("location_type", "psp")
    .limit(100);

  if (locationError || !locations?.length) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        No locations found. Add one in Supabase to preview.
      </div>
    );
  }

  const locationId = params?.location_id ?? params?.blockId ?? locations[0].id;
  const locationName = locations.find((loc) => loc.id === locationId)?.name ?? locations[0].name;

  const { data: chainageRows, error: chainageError } = await supabase
    .from("psp_records")
    .select("chainage")
    .eq("location_id", locationId);

  if (chainageError) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Failed to load chainages: {chainageError.message}
      </div>
    );
  }

  const chainages = (chainageRows ?? [])
    .map((row) => row.chainage)
    .filter((value) => Number.isFinite(value));
  const blocks = getHistoricalBlocksFromChainages(chainages);
  const block = blocks.find((item) => item.index === reportNum) ?? blocks[0];

  if (!block) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        No blocks available for preview.
      </div>
    );
  }

  const { data: records, error: recordsError } = await supabase
    .from("psp_records")
    .select(
      "recorded_at,chainage,l1_150,l1_450,l1_750,l2_150,l2_450,l2_750,l3_150,l3_450,l3_750,site_inspector",
    )
    .eq("location_id", locationId)
    .in("chainage", block.expected)
    .order("chainage", { ascending: false });

  if (recordsError) {
    return (
      <div className="p-6 text-sm text-[var(--muted-foreground)]">
        Failed to load records: {recordsError.message}
      </div>
    );
  }

  const recordMap = new Map<number, (typeof records)[number]>();
  (records ?? []).forEach((record) => {
    recordMap.set(record.chainage, record);
  });

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Perth",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const reportDate = dateFormatter.format(new Date());
  const recordsPayload = block.expected.map((chainage) => {
    const record = recordMap.get(chainage);
    return {
      date: record?.recorded_at ? dateFormatter.format(new Date(record.recorded_at)) : "",
      ch: record ? chainage : "",
      l1_a: record?.l1_150 ?? "",
      l1_b: record?.l1_450 ?? "",
      l1_c: record?.l1_750 ?? "",
      l2_a: record?.l2_150 ?? "",
      l2_b: record?.l2_450 ?? "",
      l2_c: record?.l2_750 ?? "",
      l3_a: record?.l3_150 ?? "",
      l3_b: record?.l3_450 ?? "",
      l3_c: record?.l3_750 ?? "",
    };
  });

  let supervisorName = "";
  for (let idx = block.expected.length - 1; idx >= 0; idx -= 1) {
    const record = recordMap.get(block.expected[idx]);
    if (record?.site_inspector) {
      supervisorName = record.site_inspector;
      break;
    }
  }

  const templateData: CompactionTemplateData = {
    REPORT_DATE: reportDate,
    SUPERVISOR_NAME: supervisorName,
    WORK_LOCATION: locationName,
    PROJECT_NAME: "Alkimos DN1600 Trunk Main",
    PROJECT_NUMBER: "C1/1000004254",
    records: recordsPayload,
  };

  const html = renderCompactionHTML(templateData);

  return (
    <div dangerouslySetInnerHTML={{ __html: extractPreviewHtml(html) }} />
  );
}
