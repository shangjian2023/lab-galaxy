/**
 * Word (.docx) utilities — client-side markdown ↔ docx conversion.
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import mammoth from "mammoth";

// ─── Markdown → DOCX ───

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Split by bold/italic/code markers
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    }
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], italics: true }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], font: "Courier New", size: 20 }));
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex) }));
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

export async function markdownToDocx(markdown: string): Promise<Blob> {
  const lines = markdown.split("\n");
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (trimmed.startsWith("### ")) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: parseInline(trimmed.slice(4)),
      }));
    } else if (trimmed.startsWith("## ")) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: parseInline(trimmed.slice(3)),
      }));
    } else if (trimmed.startsWith("# ")) {
      paragraphs.push(new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: parseInline(trimmed.slice(2)),
      }));
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        children: parseInline(trimmed.slice(2)),
      }));
    } else if (trimmed.match(/^\d+\.\s/)) {
      const content = trimmed.replace(/^\d+\.\s/, "");
      paragraphs.push(new Paragraph({
        numbering: { reference: "numbered", level: 0 },
        children: parseInline(content),
      }));
    } else if (trimmed === "") {
      paragraphs.push(new Paragraph({ children: [] }));
    } else {
      paragraphs.push(new Paragraph({ children: parseInline(trimmed) }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: "numbered",
        levels: [{ level: 0, format: "decimal", text: "%1.", alignment: "start" }],
      }],
    },
    sections: [{ children: paragraphs }],
  });

  return await Packer.toBlob(doc);
}

// ─── DOCX → Markdown ───

export async function docxToMarkdown(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  // Convert HTML to simple markdown
  let md = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n")
    .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<\/?(ul|ol|p|div|span|br\s*\/?)[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return md;
}

// ─── Download helper ───

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
