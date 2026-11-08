"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { publishFormVersion } from "@/app/actions/questions";
import { Check, X, Edit3, RotateCcw, Send, Plus } from "lucide-react";

interface ProposedQuestion {
  question_key: string;
  question_text: string;
  question_type: "text" | "number" | "rating" | "boolean" | "single_choice" | "multi_choice";
  options?: Array<{ value: string; label: string }>;
  rationale?: string;
}

interface QuestionItem extends ProposedQuestion {
  id: string;
  approved: boolean;
  rejected: boolean;
  editing: boolean;
  editedText: string;
}

interface QuestionsStepProps {
  organizationId: string;
}

export default function QuestionsStep({ organizationId }: QuestionsStepProps) {
  const router = useRouter();
  const [items, setItems] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customType, setCustomType] = useState<QuestionItem["question_type"]>("text");
  const [customKey, setCustomKey] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/questions/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to generate questions.");
        setItems([]);
      } else {
        const newItems: QuestionItem[] = (data.questions as ProposedQuestion[]).map((q, idx) => ({
          ...q,
          id: `${q.question_key}-${idx}`,
          approved: false,
          rejected: false,
          editing: false,
          editedText: q.question_text,
        }));
        setItems(newItems);
      }
    } catch {
      setError("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/questions/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ organizationId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          setError(data.error ?? "Failed to generate questions.");
          setItems([]);
        } else {
          const newItems: QuestionItem[] = (data.questions as ProposedQuestion[]).map((q, idx) => ({
            ...q,
            id: `${q.question_key}-${idx}`,
            approved: false,
            rejected: false,
            editing: false,
            editedText: q.question_text,
          }));
          setItems(newItems);
        }
      } catch {
        if (!cancelled) setError("Request failed. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [organizationId]);

  const approvedCount = items.filter((i) => i.approved && !i.rejected).length;
  const canPublish = approvedCount > 0 && approvedCount <= 10;

  function toggleApprove(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, approved: !i.approved, rejected: false } : i))
    );
  }

  function toggleReject(id: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, rejected: !i.rejected, approved: false } : i))
    );
  }

  function toggleEdit(id: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, editing: !i.editing, question_text: i.editedText } : i
      )
    );
  }

  function updateEditedText(id: string, text: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, editedText: text } : i)));
  }

  function handleAddCustomQuestion() {
    if (!customText.trim() || !customKey.trim()) return;
    const id = `custom-${Date.now()}`;
    const newItem: QuestionItem = {
      id,
      question_key: customKey.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 50),
      question_text: customText.trim(),
      question_type: customType,
      approved: true,
      rejected: false,
      editing: false,
      editedText: customText.trim(),
    };
    setItems((prev) => [...prev, newItem]);
    setCustomText("");
    setCustomKey("");
    setCustomType("text");
    setShowCustomForm(false);
  }

  function handleCancelCustom() {
    setShowCustomForm(false);
    setCustomText("");
    setCustomKey("");
    setCustomType("text");
  }

  async function handlePublish() {
    if (!canPublish) return;
    setPublishing(true);
    setError("");

    const approved = items.filter((i) => i.approved && !i.rejected);
    const questions = approved.map((q, idx) => ({
      question_key: q.question_key,
      question_text: q.editedText.trim() || q.question_text,
      question_type: q.question_type,
      sort_order: idx,
      is_required: true,
      options: q.options,
    }));

    const result = await publishFormVersion(organizationId, questions);
    if (result.error) {
      setError(result.error);
      setPublishing(false);
      return;
    }

    setPublishing(false);
    router.push("/");
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Review Volunteer Questions</h2>
          <Badge variant={approvedCount > 10 ? "danger" : "default"}>
            {approvedCount} / 10 approved
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Approve, edit, or reject each suggestion. You need at least one approved question (up to 10) to publish your volunteer form.
        </p>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-3">
          <Spinner size="lg" />
          <p className="text-sm text-muted-foreground">Generating your volunteer questions. This may take a few minutes.</p>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No suggestions were returned.</p>
      )}

      <div className="space-y-3">
        {items.map((item) => (
          <Card
            key={item.id}
            className={
              item.approved
                ? "border-accent ring-1 ring-accent"
                : item.rejected
                ? "opacity-60"
                : ""
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {item.editing ? (
                    <Textarea
                      value={item.editedText}
                      onChange={(e) => updateEditedText(item.id, e.target.value)}
                      rows={2}
                    />
                  ) : (
                    <CardTitle className="text-base font-medium text-foreground">
                      {item.editedText || item.question_text}
                    </CardTitle>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline">{item.question_type}</Badge>
                    {item.options && (
                      <Badge variant="secondary">{item.options.length} options</Badge>
                    )}
                    {item.approved && (
                      <Badge variant="accent">Question approved</Badge>
                    )}
                    {item.rejected && (
                      <Badge variant="danger">Question rejected</Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleEdit(item.id)}
                    aria-label="Edit"
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={item.approved ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => toggleApprove(item.id)}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {item.approved ? "Approved" : "Approve"}
                  </Button>
                  <Button
                    variant={item.rejected ? "danger" : "ghost"}
                    size="sm"
                    onClick={() => toggleReject(item.id)}
                    aria-label="Reject"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {item.rationale && (
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{item.rationale}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {!showCustomForm && (
        <Button variant="ghost" size="sm" onClick={() => setShowCustomForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add custom question
        </Button>
      )}

      {showCustomForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium text-foreground">Add custom question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Enter your question text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              rows={2}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Internal key
                </label>
                <input
                  type="text"
                  placeholder="e.g. volunteer_mood"
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Answer type
                </label>
                <select
                  value={customType}
                  onChange={(e) => setCustomType(e.target.value as QuestionItem["question_type"])}
                  className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground w-full"
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="rating">Rating</option>
                  <option value="boolean">Boolean</option>
                  <option value="single_choice">Single choice</option>
                  <option value="multi_choice">Multi choice</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleAddCustomQuestion}
                disabled={!customText.trim() || !customKey.trim()}
              >
                Add question
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCancelCustom}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={generate} disabled={loading}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Regenerate
        </Button>
        <Button onClick={handlePublish} disabled={!canPublish || publishing}>
          {publishing && <Spinner size="sm" className="mr-2" />}
          <Send className="h-4 w-4 mr-2" />
          Publish volunteer form
        </Button>
      </div>
    </div>
  );
}
