export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-full bg-background">
      <main className="mx-auto max-w-3xl px-4 py-12">{children}</main>
    </div>
  );
}
