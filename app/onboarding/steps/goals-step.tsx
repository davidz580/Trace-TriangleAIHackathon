"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { addGoal, removeGoal, addMetric, removeMetric } from "@/app/actions/goals";
import { Trash2, Plus } from "lucide-react";

interface GoalsStepProps {
  organizationId: string;
  onNext: () => void;
  onBack: () => void;
}

export default function GoalsStep({ organizationId, onNext, onBack }: GoalsStepProps) {
  const [goals, setGoals] = useState<Array<{ id: string; title: string; description: string | null }>>([]);
  const [metrics, setMetrics] = useState<Array<{ id: string; name: string; unit: string | null; aggregation_type: string }>>([]);

  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalDesc, setNewGoalDesc] = useState("");
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricUnit, setNewMetricUnit] = useState("");
  const [newMetricAgg, setNewMetricAgg] = useState<"sum" | "median" | "average" | "count">("sum");
  const [loading, setLoading] = useState(false);

  async function handleAddGoal() {
    if (!newGoalTitle.trim()) return;
    setLoading(true);
    const result = await addGoal(organizationId, {
      title: newGoalTitle.trim(),
      description: newGoalDesc.trim(),
    });
    if (result.goal) {
      setGoals((prev) => [...prev, result.goal]);
      setNewGoalTitle("");
      setNewGoalDesc("");
    }
    setLoading(false);
  }

  async function handleRemoveGoal(id: string) {
    const result = await removeGoal(organizationId, id);
    if (result.success) {
      setGoals((prev) => prev.filter((g) => g.id !== id));
    }
  }

  async function handleAddMetric() {
    if (!newMetricName.trim()) return;
    setLoading(true);
    const result = await addMetric(organizationId, {
      name: newMetricName.trim(),
      unit: newMetricUnit.trim() || undefined,
      aggregationType: newMetricAgg,
    });
    if (result.metric) {
      setMetrics((prev) => [...prev, result.metric]);
      setNewMetricName("");
      setNewMetricUnit("");
      setNewMetricAgg("sum");
    }
    setLoading(false);
  }

  async function handleRemoveMetric(id: string) {
    const result = await removeMetric(organizationId, id);
    if (result.success) {
      setMetrics((prev) => prev.filter((m) => m.id !== id));
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">Goals & Metrics</h2>
        <p className="text-sm text-muted-foreground">
          Define what your organization wants to achieve and how you measure success.
        </p>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-medium text-foreground">Goals</h3>
        {goals.map((g) => (
          <Card key={g.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-foreground">{g.title}</p>
                {g.description && <p className="text-sm text-muted-foreground">{g.description}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleRemoveGoal(g.id)} aria-label="Remove goal">
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            placeholder="Goal title"
            value={newGoalTitle}
            onChange={(e) => setNewGoalTitle(e.target.value)}
          />
          <Textarea
            placeholder="Description (optional)"
            value={newGoalDesc}
            onChange={(e) => setNewGoalDesc(e.target.value)}
            rows={1}
          />
          <Button onClick={handleAddGoal} disabled={loading || !newGoalTitle.trim()} size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-medium text-foreground">Metrics</h3>
        {metrics.map((m) => (
          <Card key={m.id}>
            <CardContent className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-foreground">{m.name}</p>
                <p className="text-sm text-muted-foreground">
                  {m.aggregation_type}
                  {m.unit ? ` · ${m.unit}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleRemoveMetric(m.id)} aria-label="Remove metric">
                <Trash2 className="h-4 w-4 text-danger" />
              </Button>
            </CardContent>
          </Card>
        ))}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Input
            placeholder="Metric name"
            value={newMetricName}
            onChange={(e) => setNewMetricName(e.target.value)}
          />
          <Input
            placeholder="Unit (optional)"
            value={newMetricUnit}
            onChange={(e) => setNewMetricUnit(e.target.value)}
            className="w-32"
          />
          <select
            value={newMetricAgg}
            onChange={(e) => setNewMetricAgg(e.target.value as typeof newMetricAgg)}
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground"
          >
            <option value="sum">Sum</option>
            <option value="median">Median</option>
            <option value="average">Average</option>
            <option value="count">Count</option>
          </select>
          <Button onClick={handleAddMetric} disabled={loading || !newMetricName.trim()} size="sm">
            <Plus className="h-4 w-4" />
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
