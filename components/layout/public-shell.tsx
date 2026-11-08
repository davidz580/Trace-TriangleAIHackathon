import Link from "next/link";

interface PublicShellProps {
  children: React.ReactNode;
}

export function PublicShell({ children }: PublicShellProps) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground">Noteworthe</span>
          </Link>
          <p className="hidden text-sm text-muted-foreground sm:block">
            We handle the proof; you handle the impact.
          </p>
        </div>
      </header>
      <main className="flex-1 px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-2xl">{children}</div>
      </main>
      <footer className="border-t border-border bg-card py-6">
        <div className="mx-auto max-w-4xl px-4 text-center text-xs text-muted-foreground sm:px-6">
          Noteworthe — Volunteer reflection forms for nonprofit evidence. Your submission is private and reviewed only by program staff.
        </div>
      </footer>
    </div>
  );
}
