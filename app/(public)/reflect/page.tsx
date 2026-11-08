import type { Metadata } from "next";
import ReflectForm from "./reflect-form";
import { resolveInvitationToken } from "@/app/actions/invitations";

export const metadata: Metadata = {
  title: "Volunteer Reflection",
};

export const dynamic = "force-dynamic";

interface ReflectPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ReflectPage({ searchParams }: ReflectPageProps) {
  const params = await searchParams;
  const token = params.token;

  if (!token) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Invitation Required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Please use the invitation link or QR code provided by your program director.
          </p>
        </div>
      </div>
    );
  }

  const result = await resolveInvitationToken(token);

  if (result.error || !result.session || !result.questions) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Invalid Invitation
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {result.error ?? "This invitation link is invalid, expired, or has been used too many times. Please contact your program director for a new link."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReflectForm
      token={token}
      sessionTitle={result.session.title ?? "Volunteer Reflection"}
      sessionDate={result.session.date}
      hostSiteName={result.session.host_site_name}
      categoryName={result.session.category_name}
      questions={result.questions.map((q) => ({
        id: q.id,
        question_key: q.question_key,
        question_text: q.question_text,
        question_type: q.question_type as "text" | "number" | "rating" | "boolean" | "single_choice" | "multi_choice",
        sort_order: q.sort_order,
        is_required: q.is_required,
        options: (q.question_options ?? []).map((o: { option_value: string; option_label: string }) => ({
          value: o.option_value,
          label: o.option_label,
        })),
      }))}
    />
  );
}
