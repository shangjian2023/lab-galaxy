// 清理失败录制轮次写入的数据,恢复演示前状态(删除演示文档/团队/会话/任务)
// 用法:node scripts/demo/cleanup-take.mjs   (在 frontend/ 下运行)
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const db = new DatabaseSync(resolve(process.cwd(), "..", "data", "lab-galaxy.db"));
const demoDocTitle = "Bluetooth_Communication_Experiment_Supplement";
const demoTeamName = "知识星图研究组";

try {
  db.exec("BEGIN IMMEDIATE");
  const docs = db.prepare(
    "SELECT DISTINCT d.id FROM documents d LEFT JOIN upload_tasks u ON u.document_id = d.id WHERE d.title LIKE ? OR u.original_filename LIKE ?"
  ).all(`%${demoDocTitle}%`, `%${demoDocTitle}%`);
  for (const d of docs) {
    db.prepare("DELETE FROM knowledge_extraction_tasks WHERE document_id = ?").run(d.id);
    db.prepare("DELETE FROM document_chunks WHERE document_id = ?").run(d.id);
    db.prepare("DELETE FROM document_sections WHERE document_id = ?").run(d.id);
    db.prepare("DELETE FROM document_pages WHERE document_id = ?").run(d.id);
    db.prepare("DELETE FROM upload_tasks WHERE document_id = ?").run(d.id);
    db.prepare("DELETE FROM documents WHERE id = ?").run(d.id);
    console.log("deleted document", d.id);
  }
  const teams = db.prepare("SELECT id FROM teams WHERE name = ?").all(demoTeamName);
  for (const t of teams) {
    db.prepare("DELETE FROM team_invites WHERE team_id = ?").run(t.id);
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(t.id);
    db.prepare("DELETE FROM teams WHERE id = ?").run(t.id);
    console.log("deleted team", t.id);
  }
  // 删除本轮失败的问答会话(标题含"能分析哪些网络问题"或 messages 含 401 拒答)
  const convs = db.prepare("SELECT id FROM conversations WHERE title LIKE ?").all("%能分析哪些网络问题%");
  for (const c of convs) {
    db.prepare("DELETE FROM conversation_messages WHERE conversation_id = ?").run(c.id);
    db.prepare("DELETE FROM conversations WHERE id = ?").run(c.id);
    console.log("deleted conversation", c.id);
  }
  db.exec("COMMIT");
  const counts = {
    documents: db.prepare("SELECT COUNT(*) n FROM documents").get().n,
    teams: db.prepare("SELECT COUNT(*) n FROM teams").get().n,
    conversations: db.prepare("SELECT COUNT(*) n FROM conversations").get().n,
  };
  console.log("after cleanup:", JSON.stringify(counts));
} catch (e) {
  db.exec("ROLLBACK");
  console.error("cleanup failed:", e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
