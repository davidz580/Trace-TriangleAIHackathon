"use client";

import { useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { submitReflection } from "@/app/actions/reflect-submit";

interface QuestionOption {
  value: string;
  label: string;
}

interface Question {
  id: string;
  question_key: string;
  question_text: string;
  question_type: "text" | "number" | "rating" | "boolean" | "single_choice" | "multi_choice";
  sort_order: number;
  is_required: boolean;
  options: QuestionOption[];
}

interface ReflectFormProps {
  token: string;
  sessionTitle: string;
  sessionDate: string;
  hostSiteName: string | null;
  categoryName: string | null;
  questions: Question[];
}

export default function ReflectForm({
  token,
  sessionTitle,
  sessionDate,
  hostSiteName,
  categoryName,
  questions,
}: ReflectFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [sensitiveWarning, setSensitiveWarning] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    setSensitiveWarning(false);

    const form = new FormData(e.currentTarget);
    form.append("token", token);

    const result = await submitReflection(form);

    setSubmitting(false);

    if (result.error) {
      setSubmitError(result.error);
      return;
    }

    if (result.success) {
      setSubmitted(true);
      if (result.hasSensitiveContent) {
        setSensitiveWarning(true);
      }
    }
  }

  if (submitted) {
    return (
      <div className="space-y-6 pt-8">
        <EmptyState
          title="Thank you"
          description="Your reflection has been recorded. Program staff will review it and may follow up if needed."
          icon={<ShieldCheck className="h-6 w-6 text-accent" />}
        />
        {sensitiveWarning && (
          <Card className="border-warning">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Content note
              </CardTitle>
              <CardDescription>
                We detected and removed potential names or location details from your reflection to protect privacy. Please avoid including names, room numbers, or health information in future submissions.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{sessionTitle}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {sessionDate}
          {hostSiteName ? ` · ${hostSiteName}` : ""}
          {categoryName ? ` · ${categoryName}` : ""}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Privacy note</CardTitle>
          <CardDescription>
            Please don&apos;t include names, room numbers, or anything about someone&apos;s health.
          </CardDescription>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Volunteer name — director-only metadata */}
        <Field label="Your name" helper="Visible only to program director">
          <Input name="volunteerName" placeholder="Your name" autoComplete="name" />
        </Field>

        {/* Standard activity metadata questions come first */}
        {questions.map((q) => (
          <DynamicQuestion key={q.id} question={q} />
        ))}

        {/* Quote capture — always present as optional */}
        <Field label="Optional quote from a resident, family member, or staff" helper="Please don't include names">
          <Textarea name="quoteText" placeholder="What did someone say that stood out?" rows={3} />
        </Field>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Speaker</label>
          <select
            name="quoteSpeaker"
            className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="resident">Resident</option>
            <option value="family member">Family member</option>
            <option value="staff">Staff</option>
          </select>
        </div>

        {submitError && <p className="text-sm text-danger">{submitError}</p>}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting && <Spinner size="sm" className="mr-2" />}
            Submit reflection
          </Button>
          <Badge variant="outline">
            {questions.filter((q) => q.is_required).length} required
          </Badge>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  children,
  helper,
  required,
}: {
  label: string;
  children: React.ReactNode;
  helper?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger ml-1">*</span>}
      </label>
      {children}
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
    </div>
  );
}

function DynamicQuestion({ question }: { question: Question }) {
  const name = `answer_${question.question_key}`;

  switch (question.question_type) {
    case "text":
      return (
        <Field label={question.question_text} required={question.is_required}>
          <Textarea
            name={name}
            placeholder="Your answer..."
            rows={3}
            required={question.is_required}
          />
        </Field>
      );

    case "number":
      return (
        <Field label={question.question_text} required={question.is_required}>
          <Input
            name={name}
            type="number"
            placeholder="0"
            required={question.is_required}
          />
        </Field>
      );

    case "rating":
      return (
        <Field
          label={question.question_text}
          helper="1 = lowest, 5 = highest"
          required={question.is_required}
        >
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex cursor-pointer flex-col items-center gap-1">
                <input
                  type="radio"
                  name={name}
                  value={n}
                  required={question.is_required}
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-xs text-muted-foreground">{n}</span>
              </label>
            ))}
          </div>
        </Field>
      );

    case "boolean":
      return (
        <Field label={question.question_text} required={question.is_required}>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={name}
                value="true"
                required={question.is_required}
                className="h-4 w-4 accent-accent"
              />
              Yes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={name}
                value="false"
                required={question.is_required}
                className="h-4 w-4 accent-accent"
              />
              No
            </label>
          </div>
        </Field>
      );

    case "single_choice":
      return (
        <Field label={question.question_text} required={question.is_required}>
          <select
            name={name}
            required={question.is_required}
            className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select an option</option>
            {question.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      );

    case "multi_choice":
      return (
        <Field label={question.question_text} required={question.is_required}>
          <div className="space-y-2">
            {question.options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name={name}
                  value={opt.value}
                  className="h-4 w-4 accent-accent"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </Field>
      );

    default:
      return (
        <Field label={question.question_text} required={question.is_required}>
          <Input name={name} placeholder="Your answer..." required={question.is_required} />
        </Field>
      );
  }
}
