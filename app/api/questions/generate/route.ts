import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { callTinker } from "@/lib/tinker";

const RequestSchema = z.object({
  organizationId: z.string().uuid(),
});

const ProposedOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
});

const ProposedQuestionSchema = z.object({
  question_key: z.string().min(1).max(50),
  question_text: z.string().min(1).max(500),
  question_type: z.enum([
    "text",
    "number",
    "rating",
    "boolean",
    "single_choice",
    "multi_choice",
  ]),
  options: z.array(ProposedOptionSchema).optional(),
  rationale: z.string().max(1000).optional(),
});

const GenerateResponseSchema = z.object({
  questions: z.array(ProposedQuestionSchema).max(10),
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

    const orgId = parsed.data.organizationId;

    // Verify membership
    const { data: membership } = await supabase
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", orgId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch organization profile
    const { data: org } = await supabase
      .from("organizations")
      .select("name, mission, history, service_region")
      .eq("id", orgId)
      .single();

    // Fetch programs
    const { data: programs } = await supabase
      .from("organization_programs")
      .select("name, description")
      .eq("organization_id", orgId);

    // Fetch categories
    const { data: categories } = await supabase
      .from("activity_categories")
      .select("name, description")
      .eq("organization_id", orgId);

    // Fetch goals
    const { data: goals } = await supabase
      .from("organization_goals")
      .select("title, description")
      .eq("organization_id", orgId);

    // Fetch metrics
    const { data: metrics } = await supabase
      .from("metric_definitions")
      .select("name, unit, aggregation_type")
      .eq("organization_id", orgId);

    // Fetch background sources
    const { data: sources } = await supabase
      .from("historical_sources")
      .select("title, content_excerpt")
      .eq("organization_id", orgId)
      .limit(5);

    const prompt = buildPrompt({
      org,
      programs: programs ?? [],
      categories: categories ?? [],
      goals: goals ?? [],
      metrics: metrics ?? [],
      sources: sources ?? [],
    });

    const { data: result, meta } = await callTinker({
      messages: [
        {
          role: "system",
          content:
            "You are an expert nonprofit program evaluator who designs volunteer reflection questions. Be concise.",
        },
        { role: "user", content: prompt },
      ],
      schema: GenerateResponseSchema,
      maxRetries: 2,
    });

    // Append rationale defaults if missing
    const questions = result.questions.map((q) => ({
      ...q,
      rationale: q.rationale || "Suggested based on the organization's profile and goals.",
    }));

    const totalDuration = Date.now() - endpointStart;
    console.log(
      `[questions/generate] org=${orgId} totalMs=${totalDuration} tinkerMs=${meta.durationMs} status=${meta.status} finish_reason=${meta.finishReason ?? "unknown"} tokens=${meta.tokenUsage?.total_tokens ?? "unknown"}`
    );

    return NextResponse.json({ questions });
  } catch (error) {
    const totalDuration = Date.now() - endpointStart;
    const message = error instanceof Error ? error.message : "Unknown error";
    const isTruncation = message.includes("truncated");
    console.error(
      `[questions/generate] FAILED after ${totalDuration}ms: ${message}${isTruncation ? " (token limit)" : ""}`
    );
    return NextResponse.json(
      { error: isTruncation ? "Question generation was cut short. Please try again with a shorter organization profile or fewer programs." : message },
      { status: 500 }
    );
  }
}

function buildPrompt(context: {
  org: { name: string; mission: string | null; history: string | null; service_region: string | null } | null;
  programs: { name: string; description: string | null }[];
  categories: { name: string; description: string | null }[];
  goals: { title: string; description: string | null }[];
  metrics: { name: string; unit: string | null; aggregation_type: string }[];
  sources: { title: string; content_excerpt: string | null }[];
}) {
  const parts = [
    "Generate 5-8 concise volunteer reflection questions for this nonprofit.",
    "",
    "Requirements:",
    "- Questions must be specific to this nonprofit's programs and goals.",
    "- Easy for volunteers to answer after an activity session.",
    "- Produce evidence useful for future grant applications.",
    "- Focus on information volunteers can reasonably observe or report.",
    "- Do NOT ask for sensitive health information, diagnoses, or identifying information.",
    "- Use question_type: text, number, rating, boolean, single_choice, multi_choice.",
    "- For rating, explain the scale in the question text (e.g., 1 to 5).",
    "- For single_choice or multi_choice, include an 'options' array with value and label.",
    "- Use snake_case question_key strings.",
    "- Keep question_text under 200 characters when possible.",
    "- Keep rationale under 150 characters when possible.",
    "",
    "Organization Profile:",
    `Name: ${context.org?.name ?? "Unknown"}`,
    `Mission: ${context.org?.mission ?? "Not provided"}`,
    `Service Region: ${context.org?.service_region ?? "Not provided"}`,
    `Background/History: ${context.org?.history ?? "Not provided"}`,
    "",
    "Programs:",
    ...context.programs.map((p) => `- ${p.name}: ${p.description ?? ""}`),
    context.programs.length === 0 ? "- None provided" : "",
    "",
    "Activity Categories:",
    ...context.categories.map((c) => `- ${c.name}: ${c.description ?? ""}`),
    context.categories.length === 0 ? "- None provided" : "",
    "",
    "Goals:",
    ...context.goals.map((g) => `- ${g.title}: ${g.description ?? ""}`),
    context.goals.length === 0 ? "- None provided" : "",
    "",
    "Metrics:",
    ...context.metrics.map((m) => `- ${m.name} (${m.aggregation_type})${m.unit ? ` [unit: ${m.unit}]` : ""}`),
    context.metrics.length === 0 ? "- None provided" : "",
    "",
    "Background Sources:",
    ...context.sources.map((s) => `- ${s.title}: ${s.content_excerpt ?? ""}`),
    context.sources.length === 0 ? "- None provided" : "",
    "",
    "Return ONLY compact raw JSON. No markdown fences, no extra text.",
    JSON.stringify({
      questions: [
        {
          question_key: "short_snake_case_key",
          question_text: "The question text?",
          question_type: "text | number | rating | boolean | single_choice | multi_choice",
          options: [{ value: "option_value", label: "Option Label" }],
          rationale: "Why this question supports the organization's goals.",
        },
      ],
    }),
  ];

  return parts.join("\n");
}
