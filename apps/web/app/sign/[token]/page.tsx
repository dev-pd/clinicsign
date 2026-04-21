type SignTokenPageProps = {
  params: Promise<{ token: string }>;
};

/**
 * Patient signing flow (magic link, no Clerk). Placeholder until the signing UI ships.
 */
export default async function SignTokenPage({
  params,
}: SignTokenPageProps): Promise<JSX.Element> {
  const { token } = await params;
  return (
    <main
      data-audience="patient"
      className="flex min-h-screen flex-col items-center justify-center gap-4 p-6"
    >
      <h1 className="text-h1 text-foreground">Sign document</h1>
      <p className="max-w-md text-center text-body text-muted-foreground">
        This page will load the document for token{" "}
        <span className="font-mono text-xs">{token.slice(0, 12)}…</span> — wiring arrives with
        the signing flow.
      </p>
    </main>
  );
}
