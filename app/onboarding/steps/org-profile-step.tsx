"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { createOrganization, updateOrganizationProfile } from "@/app/actions/organization";

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

export default function OrgProfileStep({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [mission, setMission] = useState("");
  const [serviceRegion, setServiceRegion] = useState("");
  const [history, setHistory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleNameChange(value: string) {
    setName(value);
    if (slug === "" || slug === slugify(name)) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setLoading(true);

    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("slug", slug.trim());

    const createResult = await createOrganization(formData);
    if (!("organizationId" in createResult)) {
      if ("fieldErrors" in createResult) {
        setFieldErrors(createResult.fieldErrors);
      } else {
        setError(createResult.error ?? "Failed to create organization.");
      }
      setLoading(false);
      return;
    }

    const orgId = createResult.organizationId;
    const updateResult = await updateOrganizationProfile(orgId, {
      mission: mission.trim() || undefined,
      history: history.trim() || undefined,
      service_region: serviceRegion.trim() || undefined,
    });

    if (updateResult.error) {
      setError(updateResult.error);
      setLoading(false);
      return;
    }

    setLoading(false);
    onCreated(orgId);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Organization Profile</h2>
        <p className="text-sm text-muted-foreground">
          Tell us about your nonprofit. You can update this later.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="org-name" className="block text-sm font-medium text-foreground">
            Organization name <span className="text-danger">*</span>
          </label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="e.g., Harmony Arts Initiative"
            required
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="org-slug" className="block text-sm font-medium text-foreground">
            URL slug <span className="text-danger">*</span>
          </label>
          <Input
            id="org-slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="harmony-arts-initiative"
            required
            pattern="^[a-z0-9-]+$"
            title="Lowercase letters, numbers, and hyphens only"
          />
          {fieldErrors.slug && <p className="text-sm text-danger">{fieldErrors.slug}</p>}
          <p className="text-xs text-muted-foreground">Used in URLs. Lowercase letters, numbers, and hyphens only.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="org-mission" className="block text-sm font-medium text-foreground">
            Mission
          </label>
          <Textarea
            id="org-mission"
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            placeholder="What does your organization aim to achieve?"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="org-region" className="block text-sm font-medium text-foreground">
            Service region
          </label>
          <Input
            id="org-region"
            value={serviceRegion}
            onChange={(e) => setServiceRegion(e.target.value)}
            placeholder="e.g., Greater Seattle Area"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="org-history" className="block text-sm font-medium text-foreground">
            Background and history
          </label>
          <Textarea
            id="org-history"
            value={history}
            onChange={(e) => setHistory(e.target.value)}
            placeholder="How was your organization founded? What is its story?"
            rows={4}
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end">
        <Button type="submit" disabled={loading || !name.trim() || !slug.trim()}>
          {loading && <Spinner size="sm" className="mr-2" />}
          Create organization & continue
        </Button>
      </div>
    </form>
  );
}
