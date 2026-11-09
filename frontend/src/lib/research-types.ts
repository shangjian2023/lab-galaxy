export type KnowledgeGroup = "experiment" | "resource" | "knowledge";

export interface KnowledgeNode {
  id: string;
  name: string;
  type: string;
  group: KnowledgeGroup;
  summary: string;
  year: number;
  documentId?: string;
}

export interface KnowledgeEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export type DocumentStatus = "completed" | "processing" | "review" | "ready" | "failed";

export interface ResearchDocument {
  id: string;
  title: string;
  fileType: string;
  size: string;
  status: DocumentStatus;
  updatedAt: string;
  entities: number;
  relations: number;
  owner: string;
  error?: string;
  local?: boolean;
  sourceUrl?: string;
  sourcePage?: string;
  institution?: string;
  parser?: string;
  pageCount?: number;
  textLength?: number;
  chunkCount?: number;
  sectionCount?: number;
  licenseNote?: string;
  visibility?: "private" | "team" | "public";
  ownerId?: string | null;
  teamId?: string | null;
}

export interface ResearchSource {
  chunkId: string;
  documentId: string;
  title: string;
  sourceUrl: string;
  institution?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  text: string;
  matchedTerms?: string[];
}

export interface SearchAnswer {
  id: string;
  question: string;
  answer: string;
  sources: ResearchSource[];
  model?: string | null;
  error?: boolean;
}
