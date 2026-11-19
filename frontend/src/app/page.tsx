import { HomeExperience } from "@/components/app/HomeExperience";
import { getCorpusStats, listCorpusDocuments, type CorpusDocumentRow } from "@/lib/corpus-db";
import { getCurrentViewer } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let stats = { documents: 0, chunks: 0, institutions: 0, characters: 0 };
  let documents: CorpusDocumentRow[] = [];
  let loadError = "";
  const viewer = await getCurrentViewer();
  try {
    stats = getCorpusStats(viewer);
    documents = listCorpusDocuments("", "parsed", 6, viewer);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "研究档案暂时无法读取";
  }
  return <HomeExperience stats={stats} documents={documents} loadError={loadError} />;
}
