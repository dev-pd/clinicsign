type SignTokenPageProps = {
  params: { token: string };
};

/**
 * Patient signing flow (magic link, no Clerk). Placeholder until the signing UI ships.
 */
export default function SignTokenPage({ params }: SignTokenPageProps): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-title text-foreground">Sign document</h1>
      <p className="max-w-md text-center text-body text-muted-foreground">
        This page will load the document for token{" "}
        <span className="font-mono text-xs">{params.token.slice(0, 12)}…</span> — wiring arrives with
        the signing flow.
      </p>
    </main>
  );
}
