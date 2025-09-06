import { Stepper } from "@/components/Stepper";
import UploadStep from "@/components/steps/UploadStep";
import TargetClusterStep from "@/components/steps/TargetClusterStep";
import IndexStep from "@/components/steps/IndexStep";
import ImportStep from "@/components/steps/ImportStep";

/**
 * Embeddable Importer UI for OpenSearch/Elasticsearch
 * No props required (yet)
 */
export function Importer() {
  const steps = [
    { id: "upload", label: "Upload", element: <UploadStep /> },
    { id: "cluster", label: "Cluster", element: <TargetClusterStep /> },
    { id: "index", label: "Ingestion", element: <IndexStep /> },
    { id: "import", label: "Import", element: <ImportStep /> },
  ] as const;

  return (
    <main className="container py-6">
      <Stepper steps={steps} />
    </main>
  );
}
