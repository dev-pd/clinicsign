import { PatientSigningClient } from "@/components/signing/patient-signing-client";

type SignTokenPageProps = {
  params: Promise<{ token: string }>;
};

/** Patient signing flow (magic link, no Clerk). */
export default async function SignTokenPage({
  params,
}: SignTokenPageProps): Promise<JSX.Element> {
  const { token } = await params;
  return <PatientSigningClient key={token} token={token} />;
}
