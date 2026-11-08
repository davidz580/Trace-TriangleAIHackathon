"use client";

import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { createSession } from "@/app/actions/sessions";
import {
  createInvitationToken,
  listInvitationTokens,
  deactivateToken,
  generateQRCodeDataUrl,
} from "@/app/actions/invitations";
import { buildInvitationUrl } from "@/lib/invitation-url";
import { CalendarDays, Calendar, Copy, Download, QrCode, Plus, X, Trash2 } from "lucide-react";

interface SessionItem {
  id: string;
  date: string;
  title: string | null;
  notes: string | null;
  activity_categories: { name: string } | null;
  host_sites: { name: string } | null;
  reflection_count: number;
}

interface Category {
  id: string;
  name: string;
}

interface HostSite {
  id: string;
  name: string;
}

interface SessionsClientProps {
  organizationId: string;
  isDirector: boolean;
  sessions: SessionItem[];
  sessionsError?: string;
  categories: Category[];
  hostSites: HostSite[];
}

export default function SessionsClient({
  organizationId,
  isDirector,
  sessions,
  sessionsError,
  categories,
  hostSites,
}: SessionsClientProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [sessionList, setSessionList] = useState(sessions);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");

    const form = new FormData(e.currentTarget);
    const result = await createSession(organizationId, {
      date: String(form.get("date")),
      title: form.get("title") ? String(form.get("title")) : undefined,
      notes: form.get("notes") ? String(form.get("notes")) : undefined,
      activity_category_id: form.get("activity_category_id")
        ? String(form.get("activity_category_id"))
        : undefined,
      host_site_id: form.get("host_site_id")
        ? String(form.get("host_site_id"))
        : undefined,
    });

    setCreating(false);

    if (result.error) {
      setCreateError(result.error);
      return;
    }

    if (result.session) {
      setSessionList((prev) => [
        {
          ...result.session,
          activity_categories: categories.find((c) => c.id === result.session.activity_category_id)
            ? { name: categories.find((c) => c.id === result.session.activity_category_id)!.name }
            : null,
          host_sites: hostSites.find((h) => h.id === result.session.host_site_id)
            ? { name: hostSites.find((h) => h.id === result.session.host_site_id)!.name }
            : null,
          reflection_count: 0,
        },
        ...prev,
      ]);
      setShowCreate(false);
    }
  }

  return (
    <div className="space-y-8">
      <TopBar
        title="Activity Sessions"
        description="Create and manage sessions. Share invitation links with volunteers."
      >
        {isDirector && (
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-2" />
            New session
          </Button>
        )}
      </TopBar>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create session</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Date</label>
                  <Input name="date" type="date" required />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Title</label>
                  <Input name="title" placeholder="e.g., Spring Concert at Sunnyvale" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Category</label>
                  <select
                    name="activity_category_id"
                    className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">None</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Host site</label>
                  <select
                    name="host_site_id"
                    className="flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">None</option>
                    {hostSites.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Notes</label>
                <Input name="notes" placeholder="Optional notes" />
              </div>

              {createError && <p className="text-sm text-danger">{createError}</p>}

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={creating}>
                  {creating && <Spinner size="sm" className="mr-2" />}
                  Create session
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)} type="button">
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {sessionsError && (
        <p className="text-sm text-danger">Failed to load sessions: {sessionsError}</p>
      )}

      {sessionList.length === 0 && !sessionsError && (
        <EmptyState
          title="No sessions yet"
          description="Create your first activity session to start collecting volunteer reflections."
          icon={<CalendarDays className="h-6 w-6 text-accent" />}
        />
      )}

      <div className="space-y-4">
        {sessionList.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            organizationId={organizationId}
            isDirector={isDirector}
          />
        ))}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  organizationId,
  isDirector,
}: {
  session: SessionItem;
  organizationId: string;
  isDirector: boolean;
}) {
  const [tokens, setTokens] = useState<Array<{
    id: string;
    token: string;
    is_active: boolean;
    used_count: number;
    max_uses: number | null;
    expires_at: string | null;
    created_at: string;
  }> | null>(null);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [creatingToken, setCreatingToken] = useState(false);
  const [tokenError, setTokenError] = useState("");

  async function loadTokens() {
    setLoadingTokens(true);
    const result = await listInvitationTokens(organizationId, session.id);
    setLoadingTokens(false);
    if (result.error) {
      setTokenError(result.error);
    } else {
      setTokens(result.tokens ?? []);
      setTokenError("");
    }
  }

  async function handleCreateToken(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatingToken(true);
    setTokenError("");
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const maxUses = form.get("max_uses")
      ? Number(form.get("max_uses"))
      : undefined;
    const expiresAt = form.get("expires_at")
      ? String(form.get("expires_at"))
      : undefined;

    const result = await createInvitationToken(organizationId, session.id, maxUses, expiresAt);
    setCreatingToken(false);

    if (result.error) {
      setTokenError(result.error);
      return;
    }

    formElement.reset();
    await loadTokens();
  }

  async function handleDeactivate(tokenId: string) {
    const result = await deactivateToken(organizationId, tokenId);
    if (!result.error) {
      await loadTokens();
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {session.title || "Untitled session"}
              </CardTitle>
              <Badge variant="secondary">{session.reflection_count} reflections</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {session.date}
              </span>
              {session.host_sites?.name && (
                <span>· {session.host_sites.name}</span>
              )}
              {session.activity_categories?.name && (
                <span>· {session.activity_categories.name}</span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (!showTokens) {
                setShowTokens(true);
                loadTokens();
              } else {
                setShowTokens(false);
              }
            }}
          >
            {showTokens ? <X className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
            {showTokens ? "Close" : "Invitations"}
          </Button>
        </div>
      </CardHeader>

      {showTokens && (
        <CardContent className="space-y-4">
          {isDirector && (
            <form onSubmit={handleCreateToken} className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Max uses</label>
                <Input name="max_uses" type="number" min={1} placeholder="Unlimited" className="w-28" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Expires</label>
                <Input name="expires_at" type="datetime-local" className="w-52" />
              </div>
              <Button type="submit" size="sm" disabled={creatingToken}>
                {creatingToken && <Spinner size="sm" className="mr-2" />}
                <Plus className="h-4 w-4 mr-1" />
                Create link
              </Button>
            </form>
          )}

          {tokenError && <p className="text-sm text-danger">{tokenError}</p>}

          {loadingTokens && <Spinner size="sm" />}

          {!loadingTokens && tokens && tokens.length === 0 && (
            <p className="text-sm text-muted-foreground">No invitation links yet.</p>
          )}

          {!loadingTokens && tokens && tokens.length > 0 && (
            <div className="space-y-3">
              {tokens.map((t) => (
                <TokenRow
                  key={t.id}
                  token={t}
                  onDeactivate={() => handleDeactivate(t.id)}
                  canDeactivate={isDirector}
                />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function TokenRow({
  token,
  onDeactivate,
  canDeactivate,
}: {
  token: {
    id: string;
    token: string;
    is_active: boolean;
    used_count: number;
    max_uses: number | null;
    expires_at: string | null;
  };
  onDeactivate: () => void;
  canDeactivate: boolean;
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = buildInvitationUrl(origin, token.token);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  async function toggleQr() {
    if (!showQr) {
      if (!qrDataUrl) {
        const dataUrl = await generateQRCodeDataUrl(url);
        setQrDataUrl(dataUrl);
      }
      setShowQr(true);
    } else {
      setShowQr(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(url);
  }

  function downloadQr() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${token.token.slice(0, 8)}.png`;
    a.click();
  }

  const isExpired = token.expires_at ? new Date(token.expires_at) < new Date() : false;
  const isExhausted = token.max_uses !== null && token.used_count >= token.max_uses;
  const status = !token.is_active ? "Inactive" : isExpired ? "Expired" : isExhausted ? "Exhausted" : "Active";

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-mono text-foreground">{token.token.slice(0, 16)}…</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={status === "Active" ? "accent" : "secondary"} className="text-xs">
              {status}
            </Badge>
            <span>
              {token.used_count}
              {token.max_uses !== null ? ` / ${token.max_uses}` : ""} uses
            </span>
            {token.expires_at && <span>· Expires {new Date(token.expires_at).toLocaleString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={copyLink} title="Copy link">
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleQr} title="Toggle QR code">
            <QrCode className="h-4 w-4" />
          </Button>
          {canDeactivate && token.is_active && (
            <Button variant="ghost" size="sm" onClick={onDeactivate} title="Deactivate">
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          )}
        </div>
      </div>

      {showQr && qrDataUrl && (
        <div className="flex flex-col items-center gap-2 pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="QR code" className="h-48 w-48 rounded-lg border border-border" />
          <Button variant="ghost" size="sm" onClick={downloadQr}>
            <Download className="h-4 w-4 mr-2" />
            Download QR
          </Button>
        </div>
      )}
    </div>
  );
}
