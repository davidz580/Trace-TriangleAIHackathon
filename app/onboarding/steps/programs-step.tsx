"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { addProgram, removeProgram, addCategory, removeCategory } from "@/app/actions/programs";
import { Trash2 } from "lucide-react";

interface ProgramsStepProps {
  organizationId: string;
  onNext: () => void;
  onBack: () => void;
}

export default function ProgramsStep({ organizationId, onNext, onBack }: ProgramsStepProps) {
  const [programs, setPrograms] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; description: string | null }>>([]);

  const [newProgramName, setNewProgramName] = useState("");
  const [newProgramDesc, setNewProgramDesc] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDesc, setNewCategoryDesc] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAddProgram() {
    if (!newProgramName.trim()) return;
    setLoading(true);
    const result = await addProgram(organizationId, {
      name: newProgramName.trim(),
      description: newProgramDesc.trim(),
    });
    if (result.program) {
      setPrograms((prev) => [...prev, result.program]);
      setNewProgramName("");
      setNewProgramDesc("");
    }
    setLoading(false);
  }

  async function handleRemoveProgram(id: string) {
    const result = await removeProgram(organizationId, id);
    if (result.success) {
      setPrograms((prev) => prev.filter((p) => p.id !== id));
    }
  }

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    setLoading(true);
    const result = await addCategory(organizationId, {
      name: newCategoryName.trim(),
      description: newCategoryDesc.trim(),
    });
    if (result.category) {
      setCategories((prev) => [...prev, result.category]);
      setNewCategoryName("");
      setNewCategoryDesc("");
    }
    setLoading(false);
  }

  async function handleRemoveCategory(id: string) {
    const result = await removeCategory(organizationId, id);
    if (result.success) {
      setCategories((prev) => prev.filter((c) => c.id !== id));
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Programs & Activities</h2>
        <p className="text-sm text-muted-foreground">
          Define the programs you run and the types of activities volunteers participate in.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-medium text-foreground">Programs</h3>
        {programs.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-foreground">{p.name}</p>
                {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleRemoveProgram(p.id)} aria-label="Remove program">
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Program name"
            value={newProgramName}
            onChange={(e) => setNewProgramName(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={newProgramDesc}
            onChange={(e) => setNewProgramDesc(e.target.value)}
            rows={1}
          />
          <Button onClick={handleAddProgram} disabled={loading || !newProgramName.trim()} size="sm">
            Add program
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-medium text-foreground">Activity Categories</h3>
        {categories.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-foreground">{c.name}</p>
                {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleRemoveCategory(c.id)} aria-label="Remove category">
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Category name"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={newCategoryDesc}
            onChange={(e) => setNewCategoryDesc(e.target.value)}
            rows={1}
          />
          <Button onClick={handleAddCategory} disabled={loading || !newCategoryName.trim()} size="sm">
            Add category
          </Button>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>Continue</Button>
      </div>
    </div>
  );
}
