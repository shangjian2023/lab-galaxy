import type { DocumentVisibility } from "@/lib/auth-types";

export type KnowledgeTaskStatus = "draft" | "published" | "failed";
export type KnowledgeEvidenceKind = "entity" | "relation";

export interface KnowledgeChunkInput {
  chunkId: string;
  pageStart: number | null;
  pageEnd: number | null;
  text: string;
}

export interface KnowledgeEntityCandidate {
  name: string;
  normalizedName: string;
  type: string;
  group: "experiment" | "resource" | "knowledge";
  summary: string;
  confidence: number;
  evidenceChunkId: string;
}

export interface KnowledgeRelationCandidate {
  sourceName: string;
  targetName: string;
  relation: string;
  confidence: number;
  evidenceChunkId: string;
}

export interface ValidatedKnowledgeExtraction {
  entities: KnowledgeEntityCandidate[];
  relations: KnowledgeRelationCandidate[];
}

export interface KnowledgeEvidence {
  id: string;
  itemType: KnowledgeEvidenceKind;
  itemId: string;
  chunkId: string;
  documentId: string;
  pageStart: number | null;
  pageEnd: number | null;
  text: string;
}

export interface KnowledgeTaskEntity {
  id: string;
  taskId: string;
  documentId: string;
  name: string;
  type: string;
  group: "experiment" | "resource" | "knowledge";
  summary: string;
  confidence: number;
  sourceDocumentId: string;
  sourceChunkId: string;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
}

export interface KnowledgeTaskRelation {
  id: string;
  taskId: string;
  documentId: string;
  sourceEntityId: string;
  sourceName: string;
  targetEntityId: string;
  targetName: string;
  relation: string;
  confidence: number;
  sourceDocumentId: string;
  sourceChunkId: string;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
}

export interface KnowledgeTask {
  id: string;
  documentId: string;
  documentTitle: string;
  ownerId: string;
  status: KnowledgeTaskStatus;
  resultReady: boolean;
  model: string;
  maxChunks: number;
  attempt: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  entities: KnowledgeTaskEntity[];
  relations: KnowledgeTaskRelation[];
  evidence: KnowledgeEvidence[];
}

export type KnowledgeGraphScope = "all" | "corpus" | "mine";

export interface KnowledgeGraphNode {
  id: string;
  name: string;
  type: string;
  group: "experiment" | "resource" | "knowledge";
  summary: string;
  year: number;
  documentId: string;
  sourceScope?: "corpus" | "mine" | "shared";
  taskId: string;
  sourceDocumentId: string;
  sourceChunkId: string;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  relation: string;
  confidence: number;
  taskId: string;
  documentId: string;
  sourceDocumentId: string;
  sourceChunkId: string;
  sourcePageStart: number | null;
  sourcePageEnd: number | null;
}

export interface KnowledgeGraphData {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  visibility: DocumentVisibility;
  ownerId: string | null;
}

export type KnowledgeModel = (input: {
  model: string;
  chunks: KnowledgeChunkInput[];
}) => Promise<string>;
