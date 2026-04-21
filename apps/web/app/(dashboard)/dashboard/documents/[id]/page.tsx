import { DocumentDetailView } from "@/components/dashboard/document-detail-view";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function DocumentDetailPage({
  params,
}: PageProps): Promise<JSX.Element> {
  const { id } = await params;
  return <DocumentDetailView documentId={id} />;
}
