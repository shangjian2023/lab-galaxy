"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadBatch, getDocumentStatus, type DocumentItem } from "@/lib/api";
import {
  EXPERIMENT_TYPES,
  SUBJECT_OPTIONS,
  PRIVACY_OPTIONS,
  getYearOptions,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
} from "@/lib/constants";
import ProcessingChamber from "./ProcessingChamber";
import DuplicateDialog from "./DuplicateDialog";

interface FileEntry {
  file: File;
  id: string;
  docId?: string;
  status: "waiting" | "uploading" | "parsing" | "awaiting_confirmation" | "completed" | "failed";
  progress: number;
  error?: string;
}

interface Props {
  onUploaded: () => void;
}

export default function UploadPanel({ onUploaded }: Props) {
  // Form state
  const [experimentYear, setExperimentYear] = useState<number>(new Date().getFullYear());
  const [experimentType, setExperimentType] = useState<string>("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [privacy, setPrivacy] = useState("public");

  // File state
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Duplicate dialog state
  const [duplicateDialog, setDuplicateDialog] = useState<{
    docId: string;
    filename: string;
    duplicates: { new_name: string; existing_name: string; existing_id: string; similarity: number; is_exact: boolean }[];
  } | null>(null);

  // --- Subject multi-select toggle ---
  const toggleSubject = (val: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(val) ? prev.filter((s) => s !== val) : [...prev, val],
    );
  };

  // --- File validation ---
  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `不支持的格式: ${ext}`;
    if (file.size > MAX_FILE_SIZE) return "超过 50MB 限制";
    return null;
  };

  // --- Add files (dedup by filename+size) ---
  const addFiles = useCallback((incoming: FileList | File[]) => {
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.file.name}|${f.file.size}`));
      const newEntries: FileEntry[] = [];
      for (const file of Array.from(incoming)) {
        const key = `${file.name}|${file.size}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        const err = validateFile(file);
        newEntries.push({
          file,
          id: crypto.randomUUID(),
          status: err ? "failed" : "waiting",
          progress: 0,
          error: err || undefined,
        });
      }
      return [...prev, ...newEntries];
    });
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // --- Poll processing status for a file ---
  const processFile = useCallback((fileId: string, docId: string) => {
    const poll = async () => {
      let shouldContinue = true;
      try {
        const doc = await getDocumentStatus(docId);
        setFiles((prev) => {
          const entry = prev.find((f) => f.id === fileId);
          if (!entry || entry.status === "completed" || entry.status === "failed") {
            shouldContinue = false;
            return prev;
          }
          // Map backend status to FileEntry status
          const statusMap: Record<string, FileEntry["status"]> = {
            uploaded: "uploading",
            parsing: "parsing",
            extracting: "parsing",
            awaiting_confirmation: "awaiting_confirmation",
            completed: "completed",
            failed: "failed",
          };
          const newStatus = statusMap[doc.status] || "parsing";
          if (doc.status === "completed" || doc.status === "failed") {
            shouldContinue = false;
          }
          if (doc.status === "awaiting_confirmation") {
            shouldContinue = false;
          }
          return prev.map((f) =>
            f.id === fileId
              ? { ...f, status: newStatus, progress: doc.status === "completed" ? 100 : f.progress }
              : f,
          );
        });

        // Show duplicate dialog if awaiting confirmation
        if (doc.status === "awaiting_confirmation") {
          const dups = doc.duplicate_info || doc.extraction_result?.duplicate_warnings || [];
          if (dups.length > 0) {
            const entry = files.find((f) => f.id === fileId);
            setDuplicateDialog({
              docId,
              filename: entry?.file.name || doc.title,
              duplicates: dups,
            });
          }
        }
      } catch {
        // Retry on next poll
      }
      if (shouldContinue) {
        setTimeout(poll, 1500);
      }
    };
    poll();
  }, [files]);

  // --- Submit batch ---
  const handleSubmit = async () => {
    const validFiles = files.filter((f) => f.status === "waiting");
    if (validFiles.length === 0) return;

    setGlobalError("");
    setSubmitting(true);

    // Mark all as uploading
    setFiles((prev) =>
      prev.map((f) => (f.status === "waiting" ? { ...f, status: "uploading" as const, progress: 10 } : f)),
    );

    try {
      const result = await uploadBatch(
        validFiles.map((f) => f.file),
        {
          experiment_year: experimentYear,
          experiment_type: experimentType || undefined,
          subjects: selectedSubjects.length > 0 ? selectedSubjects : undefined,
          privacy,
        },
      );

      // Match returned docs (by filename) and assign docIds
      const docMap = new Map(result.documents.map((d: DocumentItem) => [d.title, d.id]));
      setFiles((prev) =>
        prev.map((f) => {
          const docId = docMap.get(f.file.name);
          if (docId) {
            // Start polling for real status
            processFile(f.id, docId);
            return { ...f, docId, status: "parsing" as const, progress: 30 };
          }
          const errItem = result.errors.find((e: { filename: string }) => e.filename === f.file.name);
          if (errItem) return { ...f, status: "failed" as const, error: errItem.error };
          return f;
        }),
      );
    } catch (e: any) {
      setGlobalError(e.message || "上传失败");
      setFiles((prev) =>
        prev.map((f) =>
          f.status === "uploading" ? { ...f, status: "failed" as const, error: "上传失败" } : f,
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Notify parent when all files are done
  const allDone = files.length > 0 && files.every(
    (f) => f.status === "completed" || f.status === "failed",
  );
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      prevAllDone.current = true;
      onUploaded();
    }
    if (!allDone) prevAllDone.current = false;
  }, [allDone, onUploaded]);

  // Handle duplicate dialog resolution
  const handleDuplicateResolved = useCallback(() => {
    if (!duplicateDialog) return;
    const docId = duplicateDialog.docId;
    setDuplicateDialog(null);
    setFiles((prev) =>
      prev.map((f) =>
        f.docId === docId ? { ...f, status: "completed" as const, progress: 100 } : f,
      ),
    );
  }, [duplicateDialog]);

  const waitingCount = files.filter((f) => f.status === "waiting").length;
  const activeCount = files.filter((f) => f.status === "uploading" || f.status === "parsing" || f.status === "awaiting_confirmation").length;
  const completedCount = files.filter((f) => f.status === "completed").length;
  const failedOnly = files.length > 0 && files.every((f) => f.status === "failed");

  return (
    <section className="glass-card rounded-2xl p-6">
      <h1 className="mb-5 text-xl font-bold">上传实验文档</h1>

      {/* Duplicate Dialog */}
      {duplicateDialog && (
        <DuplicateDialog
          docId={duplicateDialog.docId}
          filename={duplicateDialog.filename}
          duplicates={duplicateDialog.duplicates}
          onResolved={handleDuplicateResolved}
        />
      )}

      {/* ---- Metadata Form ---- */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Year */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">实验年份</label>
          <select
            value={experimentYear}
            onChange={(e) => setExperimentYear(Number(e.target.value))}
            className="glass-input w-full px-3 py-2 text-sm"
          >
            {getYearOptions(20).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {/* Experiment type */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">实验类型</label>
          <select
            value={experimentType}
            onChange={(e) => setExperimentType(e.target.value)}
            className="glass-input w-full px-3 py-2 text-sm"
          >
            <option value="">请选择</option>
            {EXPERIMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Subjects (multi-select chips) */}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">学科领域（多选）</label>
          <div className="flex flex-wrap gap-2">
            {SUBJECT_OPTIONS.map((s) => {
              const active = selectedSubjects.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleSubject(s.value)}
                  className={`${
                    active
                      ? "glass-warm rounded-full px-3 py-1 text-xs font-medium text-orange-700"
                      : "glass-button rounded-full px-3 py-1 text-xs font-medium text-gray-600"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- Privacy ---- */}
      <div className="mb-5">
        <label className="mb-2 block text-sm font-medium text-gray-700">隐私级别</label>
        <div className="flex gap-3">
          {PRIVACY_OPTIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPrivacy(p.value)}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-all ${
                privacy === p.value
                  ? "glass-warm text-orange-700 shadow-sm"
                  : "glass-button text-gray-600"
              }`}
            >
              <span>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---- Drop Zone ---- */}
      <motion.div
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        animate={{
          borderColor: dragActive ? "#3b82f6" : "#d1d5db",
          backgroundColor: dragActive ? "#eff6ff" : "#f9fafb",
          scale: dragActive ? 1.01 : 1,
        }}
        transition={{ duration: 0.2 }}
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white/30 backdrop-blur-sm p-10"
      >
        <motion.svg
          animate={{ y: dragActive ? -4 : 0 }}
          transition={{ duration: 0.3 }}
          className="mb-3 h-12 w-12 text-gray-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
        </motion.svg>
        <p className="text-sm text-gray-500">
          拖拽文件到此处，或<span className="text-brand-600">点击选择</span>
        </p>
        <p className="mt-1 text-xs text-gray-400">
          支持 PDF / Word / PPT | 最大 50MB | 可多选
        </p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.doc,.docx,.ppt,.pptx"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </motion.div>

      {/* ---- Processing Chambers (creative progress display) ---- */}
      <AnimatePresence>
        {files.some((f) => f.status === "uploading" || f.status === "parsing" || f.status === "awaiting_confirmation") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            {files
              .filter((f) => (f.status === "uploading" || f.status === "parsing" || f.status === "awaiting_confirmation") && f.docId)
              .map((entry) => (
                <ProcessingChamber
                  key={entry.id}
                  docId={entry.docId!}
                  filename={entry.file.name}
                  onComplete={() => {}}
                  onDuplicateDetected={(dups) => {
                    setDuplicateDialog({
                      docId: entry.docId!,
                      filename: entry.file.name,
                      duplicates: dups,
                    });
                  }}
                />
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- File List ---- */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 space-y-2"
          >
            {files
              .filter((f) => f.status === "waiting" || f.status === "completed" || f.status === "failed" || f.status === "awaiting_confirmation" || (f.status === "uploading" && !f.docId))
              .map((entry) => (
                <FileRow key={entry.id} entry={entry} onRemove={removeFile} />
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Global Error ---- */}
      <AnimatePresence>
        {globalError && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600"
          >
            {globalError}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ---- Submit (always visible) ---- */}
      <div className="mt-4 flex items-center justify-between rounded-xl bg-white/40 p-3 ring-1 ring-white/50">
        {files.length === 0 ? (
          <span className="text-sm text-gray-400">选择文件后开始上传与解析</span>
        ) : failedOnly ? (
          <span className="text-sm text-red-500">所有文件验证失败，请检查文件格式与大小</span>
        ) : activeCount > 0 ? (
          <span className="text-sm text-blue-600">
            正在处理 {activeCount} 个文件...
          </span>
        ) : completedCount > 0 && waitingCount === 0 ? (
          <span className="text-sm text-green-600">全部处理完成，可继续选择文件上传</span>
        ) : (
          <span className="text-sm text-gray-500">
            {waitingCount} 个文件待上传
          </span>
        )}
        <button
          onClick={handleSubmit}
          disabled={submitting || waitingCount === 0 || activeCount > 0}
          className="btn-primary rounded-lg px-6 py-2.5 text-sm font-medium disabled:opacity-40"
        >
          {submitting ? "上传中..." : activeCount > 0 ? "处理中..." : `开始上传并解析${waitingCount > 0 ? ` (${waitingCount})` : ""}`}
        </button>
      </div>
    </section>
  );
}

// ---------- File Row Component ----------

const STATUS_CONFIG: Record<string, { label: string; color: string; barColor: string }> = {
  waiting:   { label: "等待上传", color: "text-gray-500",  barColor: "bg-gray-300" },
  uploading: { label: "上传中",   color: "text-brand-600",  barColor: "bg-blue-500" },
  parsing:   { label: "处理中",   color: "text-purple-600", barColor: "bg-purple-400" },
  awaiting_confirmation: { label: "⚠️ 待确认", color: "text-amber-600", barColor: "bg-amber-400" },
  completed: { label: "✅ 萃取完成", color: "text-green-600", barColor: "bg-green-500" },
  failed:    { label: "处理失败", color: "text-red-600",   barColor: "bg-red-400" },
};

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function FileRow({ entry, onRemove }: { entry: FileEntry; onRemove: (id: string) => void }) {
  const cfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.waiting;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20, height: 0 }}
      className="flex items-center gap-3 glass-card rounded-lg px-4 py-3"
    >
      {/* File icon */}
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-white text-xs font-bold uppercase text-gray-400">
        {entry.file.name.split(".").pop()}
      </div>

      {/* File info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <p className="truncate text-sm font-medium text-gray-800">{entry.file.name}</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
            {entry.status !== "completed" && entry.status !== "failed" && (
              <button
                onClick={() => onRemove(entry.id)}
                className="text-gray-400 hover:text-red-500"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-gray-400">{formatSize(entry.file.size)}</span>
          {(entry.status === "uploading" || entry.status === "parsing") && (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <motion.div
                className={`h-full rounded-full ${cfg.barColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${entry.progress}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          )}
          {entry.status === "completed" && (
            <motion.svg
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
              className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </motion.svg>
          )}
        </div>
        {entry.error && (
          <p className="mt-0.5 text-xs text-red-500">{entry.error}</p>
        )}
      </div>
    </motion.div>
  );
}
