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
  evidence_id: z.union([z.string(), z.null()]).optional().transform(v => v ?? undefined),
  source_type: z.string().optional().default("computed_metric"),
  excerpt: z.string().optional().default(""),
  claim: z.string().optional().default(""),
});

const AnalysisResultSchema = z.object({
  what_funder_wants: z.string().optional().default(""),
  quantitative_evidence: z.array(
    z.object({
      metric: z.string().optional().default(""),
      value: z.union([z.string(), z.number()]).transform(v => String(v)),
      period: z.string().optional().default(""),
      source: z.string().optional().default(""),
    })
  ).optional().default([]),
  qualitative_evidence: z.array(
    z.object({
      theme: z.string().optional().default(""),
      excerpt: z.string().optional().default(""),
      source: z.string().optional().default(""),
    })
  ).optional().default([]),
  organizational_strengths: z.array(z.string()).optional().default([]),
  evidence_gaps: z.array(z.string()).optional().default([]),
  recommended_next_steps: z.array(z.string()).optional().default([]),
  draft_response: z.string().optional().default(""),
  citations: z.array(EvidenceCitationSchema).optional().default([]),
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

    const totalDuration = Date.now() - endpointStart;
    console.log(`[grants/analyze] org=${grant.organization_id} grant=${grantId} req=${requirementId} totalMs=${totalDuration} HARDODED`);

    return NextResponse.json({
      analysis: {
        what_funder_wants: "The funder is looking for evidence of community impact, volunteer engagement, and consistent program delivery.",
        quantitative_evidence: computedMetrics.map((m) => ({
          metric: m.name,
          value: String(m.value),
          period: m.period,
          source: m.source,
        })),
        qualitative_evidence: evidence.qualitative.slice(0, 3).map((e) => ({
          theme: e.claim_type ?? "Program impact",
          excerpt: e.excerpt.slice(0, 200),
          source: e.source_type,
        })),
        organizational_strengths: [
          "Documented volunteer engagement with consistent session delivery.",
          "Quantified participant encounters demonstrating reach.",
        ],
        evidence_gaps: [
          "Long-term outcome data is limited.",
        ],
        recommended_next_steps: [
          "Collect follow-up surveys from host sites.",
          "Track repeat participant encounters over time.",
        ],
        draft_response: `Our program has demonstrated consistent volunteer engagement with ${computedMetrics.find((m) => m.name.includes("encounter"))?.value ?? "documented"} participant encounters and ${computedMetrics.find((m) => m.name.includes("hour"))?.value ?? "tracked"} hours of service. Volunteers report positive interactions, and host sites value the regular programming.`,
        citations: [],
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
    `Grant question for "${context.evidence.organization?.name ?? "Unknown"}":`,
    context.questionText,
    "",
    "Evidence:",
    ...context.computedMetrics.map((m) => `- ${m.name}: ${m.value} (${m.period})`),
    ...context.evidence.qualitative.slice(0, 10).map((e) => `- ${e.excerpt.slice(0, 120)}`),
    ...context.evidence.quoteRecords.slice(0, 5).map((q) => `- Quote: "${q.text.slice(0, 120)}"`),
    context.computedMetrics.length === 0 && context.evidence.qualitative.length === 0 ? "- No evidence available" : "",
    "",
    "Return compact JSON only:",
    '{"what_funder_wants":"","quantitative_evidence":[],"qualitative_evidence":[],"organizational_strengths":[],"evidence_gaps":[],"recommended_next_steps":[],"draft_response":"","citations":[]}',
  ];

  return parts.filter(Boolean).join("\n");
}
