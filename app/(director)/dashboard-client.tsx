"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { TopBar } from "@/components/layout/top-bar";
import {
  Calendar,
  Users,
  Heart,
  TrendingUp,
  FileText,
  Clock,
} from "lucide-react";

interface DashboardClientProps {
  orgId: string;
  orgName: string;
}

export default function DashboardClient({ orgId, orgName }: DashboardClientProps) {
  const [loading, setLoading] = useState(true);
  const [totalReflections, setTotalReflections] = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [totalEvidence, setTotalEvidence] = useState(0);
  const [totalEncounters, setTotalEncounters] = useState(0);
  const [totalHours, setTotalHours] = useState(0);
  const [recentReflections, setRecentReflections] = useState<any[]>([]);
  const [recentEvidence, setRecentEvidence] = useState<any[]>([]);
  const [hasForm, setHasForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();

      const [
        { count: reflCount },
        { count: sessCount },
        { count: evCount },
        { data: encResult },
        { data: recentRefl },
        { data: recentEv },
        { data: formData, error: formError },
        { data: hoursResult },
      ] = await Promise.all([
        supabase
          .from("volunteer_reflections")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabase
          .from("activity_sessions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabase
          .from("evidence_items")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", orgId),
        supabase.rpc("aggregate_concert_encounters", {
          p_organization_id: orgId,
        }),
        supabase
          .from("volunteer_reflections")
          .select(
            "id, date, format, participant_encounters, minutes_performed, submitted_at, host_sites!volunteer_reflections_organization_id_host_site_id_fkey(name)"
          )
          .eq("organization_id", orgId)
          .order("submitted_at", { ascending: false })
          .limit(5),
        supabase
          .from("evidence_items")
          .select("id, excerpt, claim_type, created_at")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("form_versions")
          .select("version_number, published_at")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .single(),
        supabase
          .from("volunteer_reflections")
          .select("minutes_performed")
          .eq("organization_id", orgId),
      ]);

      if (cancelled) return;

      const totalMinutes = (hoursResult ?? []).reduce(
        (sum: number, r: any) => sum + (r.minutes_performed ?? 0),
        0
      );

      setTotalReflections(reflCount ?? 0);
      setTotalSessions(sessCount ?? 0);
      setTotalEvidence(evCount ?? 0);
      setTotalEncounters((encResult as any) ?? 0);
      setTotalHours(Math.round((totalMinutes / 60) * 10) / 10);
      setRecentReflections(recentRefl ?? []);
      setRecentEvidence(recentEv ?? []);
      setHasForm(!formError && !!formData);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const hasAnyData =
    totalReflections > 0 || totalSessions > 0 || totalEvidence > 0;

  return (
    <div className="space-y-8">
      <TopBar
        title={`${orgName} Dashboard`}
        description="Overview of program evidence and activity"
      />

      {!hasForm && (
        <Card className="border-warning">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 text-sm text-warning">
              <FileText className="h-4 w-4" />
              <span>
                <strong>No published volunteer questionnaire.</strong>{" "}
                Volunteers cannot submit reflections until you publish questions in{" "}
                <a href="/onboarding" className="underline">
                  Onboarding
                </a>
                .
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Volunteer Submissions"
          value={String(totalReflections)}
          subtitle={
            totalReflections === 0
              ? "No submissions yet"
              : "Total reflections recorded"
          }
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          highlight={totalReflections > 0}
        />
        <MetricCard
          title="Total Hours"
          value={String(totalHours)}
          subtitle={
            totalHours === 0 ? "No hours recorded" : "Volunteer activity hours"
          }
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
          highlight={totalHours > 0}
        />
        <MetricCard
          title="Participant Encounters"
          value={String(totalEncounters)}
          subtitle={
            totalEncounters === 0
              ? "No encounters recorded"
              : "Per-session median, summed"
          }
          icon={<Heart className="h-4 w-4 text-muted-foreground" />}
          highlight={totalEncounters > 0}
        />
        <MetricCard
          title="Evidence Items"
          value={String(totalEvidence)}
          subtitle={
            totalEvidence === 0
              ? "No evidence extracted"
              : "Extracted from reflections & sources"
          }
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          highlight={totalEvidence > 0}
        />
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent Submissions
        </h2>
        {recentReflections.length > 0 ? (
          <div className="space-y-3">
            {recentReflections.map((r) => (
              <Card key={r.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {r.format ?? "Activity"}
                        {r.date ? ` on ${r.date}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(r.host_sites as unknown as { name: string } | null)
                          ?.name ?? "Unknown site"}
                        {" · "}
                        {r.participant_encounters ?? 0} encounters
                        {" · "}
                        {r.minutes_performed ?? 0} minutes
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {new Date(r.submitted_at).toLocaleDateString()}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No submissions yet"
            description="Volunteer reflections will appear here once submitted through an invitation link."
            icon={<Calendar className="h-6 w-6 text-muted-foreground" />}
          />
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Recent Evidence</h2>
        {recentEvidence.length > 0 ? (
          <div className="space-y-3">
            {recentEvidence.map((e) => (
              <Card key={e.id}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm line-clamp-2">{e.excerpt}</p>
                    <Badge variant="outline" className="shrink-0 capitalize">
                      {e.claim_type ?? "evidence"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No evidence yet"
            description="Evidence will appear here once volunteer reflections are submitted and processed."
            icon={<TrendingUp className="h-6 w-6 text-muted-foreground" />}
          />
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Activity Overview
        </h2>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-4 text-sm text-muted-foreground">
              {hasAnyData
                ? "Chart visualization will be enabled with more activity data."
                : "Chart will be available once activity data is collected."}
            </p>
            {!hasAnyData && (
              <Badge variant="secondary" className="mt-2">
                Pending data
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  highlight,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  highlight: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={`text-2xl font-bold ${
            highlight ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
