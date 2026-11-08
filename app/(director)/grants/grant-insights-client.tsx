"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { updateGrantResponse } from "@/app/actions/grants";
import {
  Lightbulb,
  BarChart3,
  MessageSquareQuote,
  CheckCircle2,
  AlertCircle,
  ListChecks,
  FileEdit,
  Copy,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ExternalLink,
  Wrench,
} from "lucide-react";

interface Requirement {
  id: string;
  requirement_key: string;
  question_text: string;
  max_words: number | null;
  sort_order: number;
}

interface AnalysisResult {
  what_funder_wants: string;
  quantitative_evidence: Array<{ metric: string; value: string; period?: string; source: string }>;
  qualitative_evidence: Array<{ theme: string; excerpt: string; source: string }>;
  organizational_strengths: string[];
  evidence_gaps: string[];
  recommended_next_steps: string[];
  draft_response: string;
  citations: Array<{
    evidence_id?: string;
    source_type: string;
    excerpt: string;
    claim: string;
  }>;
}

interface GrantInsightsClientProps {
  grantId: string;
  organizationId: string;
  requirements: Requirement[];
}

export function GrantInsightsClient({
  grantId,
  organizationId,
  requirements,
}: GrantInsightsClientProps) {
  const router = useRouter();
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult | null>>({});
  const [loadingReqId, setLoadingReqId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [editingDraft, setEditingDraft] = useState<Record<string, boolean>>({});
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [savingDraft, setSavingDraft] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});

  const analyzeRequirement = useCallback(
    async (req: Requirement) => {
      setLoadingReqId(req.id);
      setErrors((prev) => ({ ...prev, [req.id]: "" }));
      try {
        const res = await fetch("/api/grants/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grantId,
            requirementId: req.id,
            questionText: req.question_text,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setErrors((prev) => ({ ...prev, [req.id]: data.error ?? "Analysis failed." }));
        } else {
          setAnalyses((prev) => ({ ...prev, [req.id]: data.analysis }));
          setDraftTexts((prev) => ({ ...prev, [req.id]: data.analysis.draft_response }));
          setExpanded((prev) => ({ ...prev, [req.id]: true }));
        }
      } catch {
        setErrors((prev) => ({ ...prev, [req.id]: "Request failed. Please try again." }));
      } finally {
        setLoadingReqId(null);
      }
    },
    [grantId]
  );

  async function handleSaveDraft(reqId: string) {
    setSavingDraft((prev) => ({ ...prev, [reqId]: true }));
    const result = await updateGrantResponse(organizationId, reqId, draftTexts[reqId] ?? "");
    setSavingDraft((prev) => ({ ...prev, [reqId]: false }));
    if (result.error) {
      setErrors((prev) => ({ ...prev, [reqId]: result.error ?? "Save failed." }));
    } else {
      setEditingDraft((prev) => ({ ...prev, [reqId]: false }));
    }
  }

  function handleCopy(text: string, reqId: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied((prev) => ({ ...prev, [reqId]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [reqId]: false })), 2000);
    });
  }

  if (requirements.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No questions were saved for this grant.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {requirements.map((req) => {
        const analysis = analyses[req.id];
        const isLoading = loadingReqId === req.id;
        const isExpanded = expanded[req.id];
        const isEditing = editingDraft[req.id];
        const draftText = draftTexts[req.id] ?? analysis?.draft_response ?? "";

        return (
          <Card key={req.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Q{req.sort_order + 1}</Badge>
                    {req.max_words && (
                      <Badge variant="secondary">Max {req.max_words} words</Badge>
                    )}
                  </div>
                  <CardTitle className="text-base font-medium leading-snug">
                    {req.question_text}
                  </CardTitle>
                </div>
                {!analysis && !isLoading && (
                  <Button size="sm" onClick={() => analyzeRequirement(req)}>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Analyze
                  </Button>
                )}
                {analysis && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [req.id]: !prev[req.id] }))
                    }
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>

            {isLoading && (
              <CardContent className="space-y-3 py-8">
                <div className="flex items-center justify-center gap-3">
                  <Spinner size="sm" />
                  <p className="text-sm text-muted-foreground">
                    Analyzing your evidence and drafting a response...
                  </p>
                </div>
              </CardContent>
            )}

            {errors[req.id] && !isLoading && (
              <CardContent>
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Analysis failed</p>
                    <p>{errors[req.id]}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-auto p-0 text-danger underline"
                      onClick={() => analyzeRequirement(req)}
                    >
                      Retry
                    </Button>
                  </div>
                </div>
              </CardContent>
            )}

            {analysis && isExpanded && (
              <CardContent className="space-y-5">
                {/* What funder wants */}
                <Section icon={<Lightbulb className="h-4 w-4" />} title="What the funder is asking">
                  <p className="text-sm text-foreground">{analysis.what_funder_wants}</p>
                </Section>

                {/* Quantitative evidence */}
                {analysis.quantitative_evidence.length > 0 && (
                  <Section icon={<BarChart3 className="h-4 w-4" />} title="Quantitative evidence">
                    <ul className="space-y-2">
                      {analysis.quantitative_evidence.map((q, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{q.metric}:</span>{" "}
                          <span className="text-foreground">{q.value}</span>
                          {q.period && (
                            <span className="text-muted-foreground"> ({q.period})</span>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">{q.source}</p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* Qualitative evidence */}
                {analysis.qualitative_evidence.length > 0 && (
                  <Section
                    icon={<MessageSquareQuote className="h-4 w-4" />}
                    title="Qualitative evidence"
                  >
                    <ul className="space-y-2">
                      {analysis.qualitative_evidence.map((q, i) => (
                        <li key={i} className="text-sm">
                          <span className="font-medium">{q.theme}</span>
                          <blockquote className="mt-1 border-l-2 border-accent-subtle pl-3 text-muted-foreground italic">
                            &ldquo;{q.excerpt}&rdquo;
                          </blockquote>
                          <p className="text-xs text-muted-foreground mt-0.5">{q.source}</p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* Strengths */}
                {analysis.organizational_strengths.length > 0 && (
                  <Section
                    icon={<CheckCircle2 className="h-4 w-4" />}
                    title="Organizational strengths"
                  >
                    <ul className="list-disc list-inside space-y-1">
                      {analysis.organizational_strengths.map((s, i) => (
                        <li key={i} className="text-sm text-foreground">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* Gaps */}
                {analysis.evidence_gaps.length > 0 && (
                  <>
                    <Section icon={<AlertCircle className="h-4 w-4" />} title="Evidence gaps">
                      <ul className="list-disc list-inside space-y-1">
                        {analysis.evidence_gaps.map((g, i) => (
                          <li key={i} className="text-sm text-foreground">
                            {g}
                          </li>
                        ))}
                      </ul>
                    </Section>

                    {/* Form optimizer integrated recommendation */}
                    <div className="rounded-lg border border-accent-subtle bg-accent-subtle/20 p-3">
                      <div className="flex items-start gap-2">
                        <Wrench className="h-4 w-4 mt-0.5 text-accent" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">Form optimizer recommendation</p>
                          <p className="text-xs text-muted-foreground">
                            Evidence gaps often stem from missing questions on the volunteer form.
                            Review your questionnaire in Onboarding to capture this data.
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-0 text-accent underline"
                            onClick={() => router.push("/onboarding")}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Edit volunteer questionnaire
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Next steps */}
                {analysis.recommended_next_steps.length > 0 && (
                  <Section icon={<ListChecks className="h-4 w-4" />} title="Recommended next steps">
                    <ul className="list-disc list-inside space-y-1">
                      {analysis.recommended_next_steps.map((s, i) => (
                        <li key={i} className="text-sm text-foreground">
                          {s}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* Draft response */}
                <Section icon={<FileEdit className="h-4 w-4" />} title="Draft response">
                  <Badge variant="accent" className="mb-2">
                    AI-generated draft — review before using
                  </Badge>

                  {isEditing ? (
                    <div className="space-y-2">
                      <Textarea
                        value={draftText}
                        onChange={(e) =>
                          setDraftTexts((prev) => ({
                            ...prev,
                            [req.id]: e.target.value,
                          }))
                        }
                        rows={6}
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveDraft(req.id)}
                          disabled={savingDraft[req.id]}
                        >
                          {savingDraft[req.id] && <Spinner size="sm" className="mr-1" />}
                          Save draft
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDraft((prev) => ({ ...prev, [req.id]: false }))}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap">
                        {draftText}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDraft((prev) => ({ ...prev, [req.id]: true }))}
                        >
                          <FileEdit className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(draftText, req.id)}
                        >
                          <Copy className="h-4 w-4 mr-1" />
                          {copied[req.id] ? "Copied!" : "Copy"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Section>

                {/* Citations */}
                {analysis.citations.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sources cited</p>
                    <div className="flex flex-wrap gap-2">
                      {analysis.citations.map((c, i) => (
                        <CitationBadge key={i} citation={c} />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h4>
      {children}
    </div>
  );
}

function CitationBadge({
  citation,
}: {
  citation: {
    evidence_id?: string;
    source_type: string;
    excerpt: string;
    claim: string;
  };
}) {
  const label = citation.source_type.replace(/_/g, " ");
  let href = "";
  if (citation.source_type === "volunteer_reflection") href = "/sessions";
  else if (citation.source_type === "historical_upload" || citation.source_type === "director_input") href = "/evidence";

  if (href) {
    return (
      <a href={href} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-accent-subtle hover:text-accent transition-colors">
        {label}
        {citation.evidence_id ? `: ${citation.evidence_id.slice(0, 8)}` : ""}
        <ExternalLink className="h-3 w-3 text-muted-foreground" />
      </a>
    );
  }

  return (
    <Badge variant="outline" className="text-xs">
      {label}
      {citation.evidence_id ? `: ${citation.evidence_id.slice(0, 8)}` : ""}
    </Badge>
  );
}
