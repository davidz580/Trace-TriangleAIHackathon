"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { saveGrantAnalysis } from "@/app/actions/grants";
import { FileText, Plus, Trash2, ChevronRight } from "lucide-react";

interface Grant {
  id: string;
  title: string;
  funder_name: string | null;
  deadline: string | null;
  status: string;
  created_at: string;
}

interface GrantsListClientProps {
  organizationId: string;
  initialGrants: Grant[];
  initialError?: string;
}

export function GrantsListClient({
  organizationId,
  initialGrants,
  initialError,
}: GrantsListClientProps) {
  const router = useRouter();
  const [grants] = useState<Grant[]>(initialGrants);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(initialError ?? "");

  const [title, setTitle] = useState("");
  const [funderName, setFunderName] = useState("");
  const [opportunityName, setOpportunityName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [questions, setQuestions] = useState<{ text: string; maxWords: string }[]>([
    { text: "", maxWords: "" },
  ]);

  function addQuestion() {
    setQuestions((prev) => [...prev, { text: "", maxWords: "" }]);
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQuestion(idx: number, field: "text" | "maxWords", value: string) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
    );
  }

  async function handleSave() {
    setError("");
    const validQuestions = questions.filter((q) => q.text.trim());
    if (!title.trim() || validQuestions.length === 0) {
      setError("Enter a grant title and at least one question.");
      return;
    }

    setSaving(true);
    const result = await saveGrantAnalysis({
      organizationId,
      title: title.trim(),
      funderName: funderName.trim() || undefined,
      opportunityName: opportunityName.trim() || undefined,
      deadline: deadline || undefined,
      questions: validQuestions.map((q) => ({
        question_text: q.text.trim(),
        max_words: q.maxWords ? parseInt(q.maxWords, 10) : undefined,
      })),
    });
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.grantId) {
      router.push(`/grants/${result.grantId}`);
    }
  }

  return (
    <div className="space-y-6">
      {!showForm && (
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New grant analysis
        </Button>
      )}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Grant Analysis</CardTitle>
            <CardDescription>
              Enter the grant details and paste the application questions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Grant or funder name *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Community Care Corps"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Funding opportunity (optional)</label>
                <Input
                  value={opportunityName}
                  onChange={(e) => setOpportunityName(e.target.value)}
                  placeholder="e.g., Cohort 7 RFP"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="block text-sm font-medium">Funder name (optional)</label>
                <Input
                  value={funderName}
                  onChange={(e) => setFunderName(e.target.value)}
                  placeholder="e.g., Administration for Community Living"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Deadline (optional)</label>
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium">Grant questions *</label>
                <Button variant="ghost" size="sm" onClick={addQuestion}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add question
                </Button>
              </div>
              {questions.map((q, idx) => (
                <div key={idx} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <Textarea
                    value={q.text}
                    onChange={(e) => updateQuestion(idx, "text", e.target.value)}
                    placeholder={`Question ${idx + 1}`}
                    rows={2}
                  />
                  <Input
                    type="number"
                    value={q.maxWords}
                    onChange={(e) => updateQuestion(idx, "maxWords", e.target.value)}
                    placeholder="Max words"
                    className="w-28"
                  />
                  {questions.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeQuestion(idx)}>
                      <Trash2 className="h-4 w-4 text-danger" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex items-center gap-3">
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Spinner size="sm" className="mr-2" />}
                Save and analyze
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {grants.length === 0 && !showForm && (
          <EmptyState
            title="No grant analyses yet"
            description="Create your first grant analysis to get evidence-backed insights."
            icon={<FileText className="h-6 w-6 text-muted-foreground" />}
          />
        )}

        {grants.map((grant) => (
          <Card
            key={grant.id}
            className="cursor-pointer hover:border-accent transition-colors"
            onClick={() => router.push(`/grants/${grant.id}`)}
          >
            <CardContent className="flex items-center justify-between py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">{grant.title}</h3>
                  <Badge variant="secondary">{grant.status}</Badge>
                </div>
                {grant.funder_name && (
                  <p className="text-sm text-muted-foreground">{grant.funder_name}</p>
                )}
                {grant.deadline && (
                  <p className="text-sm text-muted-foreground">Deadline: {grant.deadline}</p>
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
