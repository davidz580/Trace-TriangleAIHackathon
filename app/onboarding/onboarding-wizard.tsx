"use client";

import { useState } from "react";
import OrgProfileStep from "./steps/org-profile-step";
import ProgramsStep from "./steps/programs-step";
import GoalsStep from "./steps/goals-step";
import BackgroundStep from "./steps/background-step";
import QuestionsStep from "./steps/questions-step";

const steps = [
  "Organization Profile",
  "Programs & Activities",
  "Goals & Metrics",
  "Background Information",
  "Review Volunteer Questions",
];

export default function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [organizationId, setOrganizationId] = useState<string | null>(null);

  function handleNext() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome to Noteworthe</h1>
        <p className="text-muted-foreground">
          Set up your nonprofit to start collecting evidence for grants.
        </p>
      </div>

      <div className="flex items-center justify-center gap-2">
        {steps.map((label, idx) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                idx <= step
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
              title={label}
            >
              {idx + 1}
            </div>
            {idx < steps.length - 1 && (
              <div className={`h-1 w-8 rounded ${idx < step ? "bg-accent" : "bg-muted"}`} />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        {step === 0 && (
          <OrgProfileStep
            onCreated={(id) => {
              setOrganizationId(id);
              handleNext();
            }}
          />
        )}
        {step === 1 && organizationId && (
          <ProgramsStep organizationId={organizationId} onNext={handleNext} onBack={handleBack} />
        )}
        {step === 2 && organizationId && (
          <GoalsStep organizationId={organizationId} onNext={handleNext} onBack={handleBack} />
        )}
        {step === 3 && organizationId && (
          <BackgroundStep organizationId={organizationId} onNext={handleNext} onBack={handleBack} />
        )}
        {step === 4 && organizationId && (
          <QuestionsStep organizationId={organizationId} />
        )}
      </div>
    </div>
  );
}
