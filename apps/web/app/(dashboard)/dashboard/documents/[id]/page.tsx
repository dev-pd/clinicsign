import { DocumentDetailView } from "@/components/dashboard/document-detail-view";

type PageProps = {
  params: { id: string };
};

export default function DocumentDetailPage({ params }: PageProps): JSX.Element {
  return <DocumentDetailView documentId={params.id} />;
}
