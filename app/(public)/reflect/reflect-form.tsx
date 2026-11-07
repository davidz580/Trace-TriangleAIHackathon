"use client";

import { useState } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { ShieldCheck } from "lucide-react";

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
      {children}
    </label>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground">{children}</p>;
}

function Field({ label, children, helper }: { label: string; children: React.ReactNode; helper?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {helper && <Helper>{helper}</Helper>}
    </div>
  );
}

interface ReflectFormProps {
  defaultDate: string;
}

export default function ReflectForm({ defaultDate }: ReflectFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    // Placeholder: no actual submission yet
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="pt-8">
        <EmptyState
          title="Thank you"
          description="Your reflection has been recorded. Program staff will review it and may follow up if needed."
          icon={<ShieldCheck className="h-6 w-6 text-accent" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Volunteer Reflection</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Share a few details about your visit. This helps us document impact for future grants.
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

        {/* 1. Performance date */}
        <Field label="Performance date">
          <Input name="performanceDate" type="date" defaultValue={defaultDate} required />
        </Field>

        {/* 2. Host site */}
        <Field label="Host site">
          <Input name="hostSite" placeholder="e.g., Sunnyvale Senior Center" required />
        </Field>

        {/* 3. Performance format */}
        <Field label="Performance format">
          <select
            name="format"
            required
            className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Select a format</option>
            <option value="solo">Solo</option>
            <option value="small-group">Small group</option>
            <option value="sing-along">Sing-along</option>
            <option value="interactive">Interactive</option>
          </select>
        </Field>

        {/* 4. Approximate number of attendees */}
        <Field label="Approximate number of attendees" helper="Count encounters, not unique individuals">
          <Input name="attendees" type="number" min={0} placeholder="e.g., 15" required />
        </Field>

        {/* 5. Minutes performed */}
        <Field label="Minutes performed">
          <Input name="minutes" type="number" min={1} placeholder="e.g., 45" required />
        </Field>

        {/* 6. Audience engagement */}
        <Field label="Audience engagement" helper="1 = mostly listening quietly, 5 = singing, clapping, or requesting songs">
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex cursor-pointer flex-col items-center gap-1">
                <input
                  type="radio"
                  name="engagement"
                  value={n}
                  required
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-xs text-muted-foreground">{n}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* 7. How the performance went for you */}
        <Field label="How did the performance go for you?" helper="1 = very difficult, 5 = very rewarding">
          <div className="flex items-center gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className="flex cursor-pointer flex-col items-center gap-1">
                <input
                  type="radio"
                  name="volunteerExperience"
                  value={n}
                  required
                  className="h-4 w-4 accent-accent"
                />
                <span className="text-xs text-muted-foreground">{n}</span>
              </label>
            ))}
          </div>
        </Field>

        {/* 8. One standout moment */}
        <Field label="One standout moment">
          <Textarea name="standoutMoment" placeholder="What moment stood out to you?" rows={3} required />
        </Field>

        {/* 9. What would make the next visit better? */}
        <Field label="What would make the next visit better?">
          <Textarea name="improvement" placeholder="Any suggestions or observations?" rows={3} required />
        </Field>

        {/* 10. Custom question */}
        <Field label="Which songs did you play?" helper="Optional custom question">
          <Textarea name="customAnswer" placeholder="List any songs you performed" rows={2} />
        </Field>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting && <Spinner size="sm" className="mr-2" />}
            Submit reflection
          </Button>
          <Badge variant="outline">10 of 10 questions</Badge>
        </div>
      </form>
    </div>
  );
}
