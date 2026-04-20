export default function HomePage(): JSX.Element {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-display text-foreground">ClinicSign</h1>
      <p className="mt-4 text-body text-muted-foreground">
        Turborepo scaffolding is ready — web and API dev servers run from the repo root.
      </p>
    </main>
  );
}
