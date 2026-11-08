import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Library, FileText, MessageSquare, ClipboardList } from "lucide-react";

export const metadata = {
  title: "Evidence Library",
};

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  noStore();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/director/login");
  }

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  const orgId = membership?.organization_id;
  if (!orgId) redirect("/onboarding");

  const { data: evidenceItems, error } = await supabase
    .from("evidence_items")
    .select(`
      id,
      excerpt,
      claim_type,
      tags,
      verification_status,
      created_at,
      source_volunteer_reflection_id,
      source_historical_source_id,
      source_director_input_id
    `)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[evidence] query error:", error.message);
  }

  const items = evidenceItems ?? [];

  return (
    <div className="space-y-8">
      <TopBar
        title="Evidence Library"
        description="Browse extracted evidence from volunteer reflections, historical sources, and director inputs."
      />

      {items.length === 0 ? (
        <EmptyState
          title="Evidence library is empty"
          description="Evidence items will appear here after volunteer reflections are submitted or historical documents are imported."
          icon={<Library className="h-6 w-6 text-muted-foreground" />}
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{items.length} total</Badge>
            <Badge variant="outline">
              {items.filter((i) => i.source_volunteer_reflection_id).length} from reflections
            </Badge>
            <Badge variant="outline">
              {items.filter((i) => i.source_historical_source_id).length} from uploads
            </Badge>
            <Badge variant="outline">
              {items.filter((i) => i.source_director_input_id).length} from director inputs
            </Badge>
          </div>

          <div className="grid gap-4">
            {items.map((item) => (
              <Card key={item.id}>
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <SourceIcon
                        reflection={item.source_volunteer_reflection_id}
                        historical={item.source_historical_source_id}
                        input={item.source_director_input_id}
                      />
                      <Badge variant="outline" className="capitalize text-xs">
                        {item.claim_type ?? "evidence"}
                      </Badge>
                      <Badge variant={item.verification_status === "verified" ? "accent" : "secondary"} className="text-xs">
                        {item.verification_status}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <p className="text-sm text-foreground leading-relaxed">{item.excerpt}</p>

                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Source: {item.source_volunteer_reflection_id
                      ? `Reflection ${item.source_volunteer_reflection_id.slice(0, 8)}`
                      : item.source_historical_source_id
                      ? `Upload ${item.source_historical_source_id.slice(0, 8)}`
                      : item.source_director_input_id
                      ? `Input ${item.source_director_input_id.slice(0, 8)}`
                      : "Unknown"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceIcon({
  reflection,
  historical,
  input,
}: {
  reflection: string | null;
  historical: string | null;
  input: string | null;
}) {
  if (reflection) return <MessageSquare className="h-4 w-4 text-accent" />;
  if (historical) return <FileText className="h-4 w-4 text-muted-foreground" />;
  if (input) return <ClipboardList className="h-4 w-4 text-muted-foreground" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}
