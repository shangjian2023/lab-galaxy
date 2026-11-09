import type { DocumentVisibility, UserRole, UserStatus } from "@/lib/auth-types";

export type IngestionTaskStatus = "queued" | "processing" | "completed" | "failed" | "incomplete";

export interface IngestionActor {
  id: string;
  role: UserRole;
  status: UserStatus;
}

export interface IngestionTask {
  id: string;
  ownerId: string;
  documentId: string;
  originalFilename: string;
  format: "pdf" | "docx";
  visibility: DocumentVisibility;
  teamId: string | null;
  sourceUrl: string;
  licenseNote: string | null;
  sha256: string;
  status: IngestionTaskStatus;
  progress: number;
  attempts: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface UploadMetadata {
  visibility: DocumentVisibility;
  teamId: string | null;
  sourceUrl: string;
  licenseNote: string | null;
}

export interface UploadInput extends UploadMetadata {
  actor: IngestionActor;
  filename: string;
  bytes: Buffer;
}
