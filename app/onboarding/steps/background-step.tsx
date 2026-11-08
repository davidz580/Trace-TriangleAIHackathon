"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { addBackgroundSource, extractTextFromFile } from "@/app/actions/background";
import { FileText, Upload, Trash2 } from "lucide-react";

interface BackgroundStepProps {
  organizationId: string;
  onNext: () => void;
  onBack: () => void;
}

export default function BackgroundStep({ organizationId, onNext, onBack }: BackgroundStepProps) {
  const [sources, setSources] = useState<Array<{ id: string; title: string }>>([]);
  const [tab, setTab] = useState<"paste" | "upload">("paste");

  const [pastedTitle, setPastedTitle] = useState("");
  const [pastedText, setPastedText] = useState("");

  const [file, setFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAddPasted() {
    if (!pastedTitle.trim() || !pastedText.trim()) return;
    setLoading(true);
    setError("");
    const result = await addBackgroundSource(organizationId, {
      title: pastedTitle.trim(),
      content: pastedText.trim(),
      sourceType: "director_input",
    });
    if (result.source) {
      setSources((prev) => [...prev, result.source]);
      setPastedTitle("");
      setPastedText("");
    } else {
      setError(result.error ?? "Failed to save.");
    }
    setLoading(false);
  }

  async function handleAddUpload() {
    if (!file || !uploadTitle.trim()) return;
    setLoading(true);
    setError("");

    const extracted = await extractTextFromFile(file);
    if (extracted.error || !extracted.text) {
      setError(extracted.error ?? "Could not read file.");
      setLoading(false);
      return;
    }

    const result = await addBackgroundSource(organizationId, {
      title: uploadTitle.trim(),
      content: extracted.text,
      sourceType: "historical_upload",
      originalFilename: file.name,
    });

    if (result.source) {
      setSources((prev) => [...prev, result.source]);
      setFile(null);
      setUploadTitle("");
    } else {
      setError(result.error ?? "Failed to save.");
    }
    setLoading(false);
  }

  async function handleRemove(id: string) {
    // No server action for removal; out of scope for simplicity
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Background Information</h2>
        <p className="text-sm text-muted-foreground">
          Share context about your organization to improve AI recommendations. Supported: pasted text, .txt files, and text-based PDFs.
        </p>
      </div>

      {sources.length > 0 && (
        <div className="space-y-2">
          {sources.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{s.title}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleRemove(s.id)} aria-label="Remove">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant={tab === "paste" ? "primary" : "secondary"} size="sm" onClick={() => setTab("paste")}>
          Paste text
        </Button>
        <Button variant={tab === "upload" ? "primary" : "secondary"} size="sm" onClick={() => setTab("upload")}>
          Upload file
        </Button>
      </div>

      {tab === "paste" && (
        <div className="space-y-3">
          <Input
            placeholder="Title (e.g., Annual Report 2025)"
            value={pastedTitle}
            onChange={(e) => setPastedTitle(e.target.value)}
          />
          <Textarea
            placeholder="Paste background text here..."
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            rows={6}
          />
          <Button onClick={handleAddPasted} disabled={loading || !pastedTitle.trim() || !pastedText.trim()}>
            {loading && <Spinner size="sm" className="mr-2" />}
            Save pasted text
          </Button>
        </div>
      )}

      {tab === "upload" && (
        <div className="space-y-3">
          <Input
            placeholder="Title"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
          />
          <div className="flex items-center gap-3">
            <Input
              type="file"
              accept=".txt,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent-foreground hover:file:bg-accent-hover"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Only .txt files and text-based PDFs are accepted. Scanned PDFs requiring OCR are not supported.
          </p>
          <Button onClick={handleAddUpload} disabled={loading || !file || !uploadTitle.trim()}>
            {loading && <Spinner size="sm" className="mr-2" />}
            <Upload className="h-4 w-4 mr-2" />
            Upload and save
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
