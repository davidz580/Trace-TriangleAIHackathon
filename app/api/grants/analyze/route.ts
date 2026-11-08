import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { callTinker } from "@/lib/tinker";
import { gatherOrganizationEvidence, type OrgEvidenceBundle } from "@/lib/evidence";
import { computeGrantMetrics } from "@/lib/grant-metrics";

const RequestSchema = z.object({
  grantId: z.string().uuid(),
  requirementId: z.string().uuid(),
  questionText: z.string().min(1),
});

const EvidenceCitationSchema = z.object({
  evidence_id: z.string().optional(),
  source_type: z.enum(["volunteer_reflection", "historical_upload", "director_input", "computed_metric"]),
  excerpt: z.string(),
  claim: z.string(),
});

const AnalysisResultSchema = z.object({
  what_funder_wants: z.string().max(1000),
  quantitative_evidence: z.array(
    z.object({
      metric: z.string(),
      value: z.string(),
      period: z.string().optional(),
      source: z.string(),
    })
  ),
  qualitative_evidence: z.array(
    z.object({
      theme: z.string(),
      excerpt: z.string(),
      source: z.string(),
    })
  ),
  organizational_strengths: z.array(z.string()),
  evidence_gaps: z.array(z.string()),
  recommended_next_steps: z.array(z.string()),
  draft_response: z.string().max(5000),
  citations: z.array(EvidenceCitationSchema),
});

export async function POST(request: NextRequest) {
  const endpointStart = Date.now();

  try {
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { grantId, requirementId, questionText } = parsed.data;

    // Fetch grant to verify org membership
    const { data: grant } = await supabase
      .from("grants")
      .select("organization_id, title")
      .eq("id", grantId)
      .single();

    if (!grant) {
      return NextResponse.json({ error: "Grant not found" }, { status: 404 });
    }

    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", grant.organization_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Gather evidence
    const evidence = await gatherOrganizationEvidence(grant.organization_id);

    // Compute deterministic metrics
    const computedMetrics = computeGrantMetrics(evidence);

    const prompt = buildAnalysisPrompt({
      grantTitle: grant.title,
      questionText,
      evidence,
      computedMetrics,
    });

    const { data: result, meta } = await callTinker({
      messages: [
        {
          role: "system",
          content:
            "You are an expert nonprofit grant strategist. You help organizations answer grant questions using only their existing documented evidence. You never fabricate statistics, quotes, or outcomes. If evidence is insufficient, say so clearly. Return only valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      schema: AnalysisResultSchema,
      maxRetries: 2,
    });

    // Validate citations against actual evidence IDs
    const validatedCitations = result.citations.filter((c) => {
      if (!c.evidence_id) return true; // computed metrics have no evidence_id
      return (
        evidence.qualitative.some((e) => e.id === c.evidence_id) ||
        evidence.quantitative.some((e) => e.id === c.evidence_id)
      );
    });

    const totalDuration = Date.now() - endpointStart;
    console.log(
      `[grants/analyze] org=${grant.organization_id} grant=${grantId} req=${requirementId} totalMs=${totalDuration} tinkerMs=${meta.durationMs} tokens=${meta.tokenUsage?.total_tokens ?? "unknown"}`
    );

    return NextResponse.json({
      analysis: {
        ...result,
        citations: validatedCitations,
      },
    });
  } catch (error) {
    const totalDuration = Date.now() - endpointStart;
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[grants/analyze] FAILED after ${totalDuration}ms: ${message}`);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}


function buildAnalysisPrompt(context: {
  grantTitle: string;
  questionText: string;
  evidence: OrgEvidenceBundle;
  computedMetrics: Array<{ name: string; value: string; period: string; source: string }>;
}) {
  const parts = [
    `Analyze the following grant application question for the nonprofit "${context.evidence.organization?.name ?? "Unknown"}".`,
    "",
    `Grant: ${context.grantTitle}`,
    `Question: ${context.questionText}`,
    "",
    "=== ORGANIZATION PROFILE ===",
    `Mission: ${context.evidence.organization?.mission ?? "Not provided"}`,
    `Service Region: ${context.evidence.organization?.service_region ?? "Not provided"}`,
    `History: ${context.evidence.organization?.history ?? "Not provided"}`,
    "",
    "=== PROGRAMS ===",
    ...context.evidence.programs.map((p) => `- ${p.name}: ${p.description ?? ""}`),
    context.evidence.programs.length === 0 ? "- None provided" : "",
    "",
    "=== GOALS ===",
    ...context.evidence.goals.map((g) => `- ${g.title}: ${g.description ?? ""}`),
    context.evidence.goals.length === 0 ? "- None provided" : "",
    "",
    "=== COMPUTED METRICS ===",
    ...context.computedMetrics.map((m) => `- ${m.name}: ${m.value} (${m.period}) [source: ${m.source}]`),
    context.computedMetrics.length === 0 ? "- No computed metrics available" : "",
    "",
    "=== DIRECTOR INPUTS ===",
    ...context.evidence.directorInputs.map((d) => `- ${d.category}: ${d.response_text}`),
    context.evidence.directorInputs.length === 0 ? "- None provided" : "",
    "",
    "=== HISTORICAL SOURCES ===",
    ...context.evidence.historicalSources.map((s) => `- ${s.title}: ${s.content_excerpt ?? ""}`),
    context.evidence.historicalSources.length === 0 ? "- None provided" : "",
    "",
    "=== VOLUNTEER REFLECTIONS (recent) ===",
    ...context.evidence.reflections.slice(0, 20).map((r) =>
      `- Date: ${r.date ?? "unknown"}, Encounters: ${r.participant_encounters ?? "N/A"}, Minutes: ${r.minutes_performed ?? "N/A"}, Format: ${r.format ?? "N/A"}, Site: ${r.host_site_name ?? "N/A"}`
    ),
    context.evidence.reflections.length === 0 ? "- No reflections submitted" : "",
    "",
    "=== APPROVED QUOTES ===",
    ...context.evidence.quoteRecords
      .filter((q) => q.consent_status === "confirmed_with_evidence" || q.consent_status === "unknown")
      .slice(0, 10)
      .map((q) => `- [${q.speaker ?? "unknown"}]: "${q.text}"`),
    context.evidence.quoteRecords.length === 0 ? "- No quotes available" : "",
    "",
    "=== INSTRUCTIONS ===",
    "Return a JSON object with these fields:",
    '- "what_funder_wants": 1-sentence summary of what the funder wants.',
    '- "quantitative_evidence": Array of documented metrics with value, period, and source.',
    '- "qualitative_evidence": 2-3 narrative themes maximum, with short excerpts and sources.',
    '- "organizational_strengths": 2-3 bullet points maximum.',
    '- "evidence_gaps": 1-2 bullet points maximum.',
    '- "recommended_next_steps": 2-3 actionable suggestions maximum.',
    '- "draft_response": A concise draft response (150-300 words). Keep it tight and factual.',
    '- "citations": Array of objects with evidence_id (if applicable), source_type, excerpt, and claim.',
    "",
    "CRITICAL RULES:",
    "1. NEVER fabricate statistics, participant numbers, or outcomes.",
    "2. If a metric is estimated, label it as estimated.",
    "3. If no evidence supports a claim, say so explicitly.",
    "4. Do not make clinical or health claims.",
    "5. Use participant encounters, not unique participants.",
    "6. Only cite evidence IDs that actually exist in the provided data.",
    "7. Keep the draft_response concise (150-300 words).",
    "",
    "Return ONLY compact raw JSON. No markdown fences, no extra text.",
  ];

  return parts.join("\n");
}
