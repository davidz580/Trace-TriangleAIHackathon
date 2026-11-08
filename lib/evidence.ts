"use server";

import { createClient } from "@/lib/supabase/server";

export interface QuantitativeEvidence {
  id: string;
  source_type: "volunteer_reflection" | "historical_upload" | "director_input";
  metric_name: string | null;
  value: number | null;
  unit: string | null;
  period: string | null;
  excerpt: string;
  source_record_id: string | null;
  organization_id: string;
}

export interface QualitativeEvidence {
  id: string;
  source_type: "volunteer_reflection" | "historical_upload" | "director_input";
  claim_type: string | null;
  tags: string[] | null;
  excerpt: string;
  source_record_id: string | null;
  organization_id: string;
  created_at: string;
}

export interface OrgEvidenceBundle {
  organization: {
    name: string;
    mission: string | null;
    history: string | null;
    service_region: string | null;
  } | null;
  programs: { name: string; description: string | null }[];
  goals: { title: string; description: string | null }[];
  metrics: { name: string; unit: string | null; aggregation_type: string }[];
  hostSites: { name: string; address: string | null }[];
  quantitative: QuantitativeEvidence[];
  qualitative: QualitativeEvidence[];
  reflections: {
    id: string;
    date: string | null;
    participant_encounters: number | null;
    minutes_performed: number | null;
    format: string | null;
    host_site_name: string | null;
  }[];
  directorInputs: { category: string; prompt_text: string; response_text: string }[];
  historicalSources: { title: string; content_excerpt: string | null }[];
  quoteRecords: {
    id: string;
    text: string;
    speaker: string | null;
    consent_status: string | null;
  }[];
}

export async function gatherOrganizationEvidence(
  organizationId: string
): Promise<OrgEvidenceBundle> {
  const supabase = await createClient();

  const [{ data: org }, { data: programs }, { data: goals }, { data: metrics }, { data: hostSites }] =
    await Promise.all([
      supabase.from("organizations").select("name, mission, history, service_region").eq("id", organizationId).single(),
      supabase.from("organization_programs").select("name, description").eq("organization_id", organizationId),
      supabase.from("organization_goals").select("title, description").eq("organization_id", organizationId),
      supabase.from("metric_definitions").select("name, unit, aggregation_type").eq("organization_id", organizationId),
      supabase.from("host_sites").select("name, address").eq("organization_id", organizationId),
    ]);

  // Reflections with host site names
  const { data: reflections } = await supabase
    .from("volunteer_reflections")
    .select("id, date, participant_encounters, minutes_performed, format, host_site_id")
    .eq("organization_id", organizationId)
    .order("date", { ascending: false })
    .limit(15);

  const reflectionRows =
    reflections?.map((r) => ({
      id: r.id,
      date: r.date,
      participant_encounters: r.participant_encounters,
      minutes_performed: r.minutes_performed,
      format: r.format,
      host_site_name: r.host_site_id ?? null,
    })) ?? [];

  const { data: directorInputs } = await supabase
    .from("director_inputs")
    .select("category, prompt_text, response_text")
    .eq("organization_id", organizationId)
    .limit(10);

  const { data: historicalSources } = await supabase
    .from("historical_sources")
    .select("title, content_excerpt")
    .eq("organization_id", organizationId)
    .limit(10);

  const { data: quoteRecords } = await supabase
    .from("quote_records")
    .select("id, text, speaker, consent_status")
    .eq("organization_id", organizationId)
    .limit(8);

  // Build evidence_items as qualitative + quantitative
  const { data: evidenceItems } = await supabase
    .from("evidence_items")
    .select("id, source_volunteer_reflection_id, source_historical_source_id, source_director_input_id, excerpt, claim_type, tags, verification_status, created_at")
    .eq("organization_id", organizationId)
    .limit(20);

  const qualitative: QualitativeEvidence[] = [];
  const quantitative: QuantitativeEvidence[] = [];

  for (const item of evidenceItems ?? []) {
    const sourceType: QualitativeEvidence["source_type"] =
      item.source_volunteer_reflection_id
        ? "volunteer_reflection"
        : item.source_historical_source_id
        ? "historical_upload"
        : "director_input";

    const sourceId =
      item.source_volunteer_reflection_id ??
      item.source_historical_source_id ??
      item.source_director_input_id;

    qualitative.push({
      id: item.id,
      source_type: sourceType,
      claim_type: item.claim_type,
      tags: item.tags,
      excerpt: String(item.excerpt ?? "").slice(0, 200),
      source_record_id: sourceId,
      organization_id: organizationId,
      created_at: item.created_at,
    });

    // Try to extract numbers from evidence items for quantitative
    const numMatch = item.excerpt.match(/(\d+(?:\.\d+)?)\s*(\w+%?)/);
    if (numMatch && item.claim_type === "metric") {
      quantitative.push({
        id: item.id,
        source_type: sourceType,
        metric_name: item.claim_type,
        value: parseFloat(numMatch[1]),
        unit: numMatch[2] || null,
        period: null,
        excerpt: item.excerpt,
        source_record_id: sourceId,
        organization_id: organizationId,
      });
    }
  }

  return {
    organization: org ?? null,
    programs: programs ?? [],
    goals: goals ?? [],
    metrics: metrics ?? [],
    hostSites: hostSites ?? [],
    quantitative,
    qualitative,
    reflections: reflectionRows,
    directorInputs: directorInputs ?? [],
    historicalSources: historicalSources ?? [],
    quoteRecords:
      quoteRecords?.filter((q) => q.consent_status !== "denied") ?? [],
  };
}
