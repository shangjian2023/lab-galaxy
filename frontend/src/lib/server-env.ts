import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface ModelConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export function getModelConfig(): ModelConfig {
  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "..", ".env.local"),
  ];
  const values = new Map<string, string>();
  const filename = candidates.find((candidate) => existsSync(candidate));
  if (filename) {
    for (const line of readFileSync(filename, "utf8").split(/\r?\n/)) {
      if (!line || line.trimStart().startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator > 0) values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  const baseUrl = process.env.LLM_BASE_URL || values.get("LLM_BASE_URL");
  const model = process.env.LLM_MODEL || values.get("LLM_MODEL");
  const apiKey = process.env.LLM_API_KEY || values.get("LLM_API_KEY");
  if (!baseUrl || !model || !apiKey) throw new Error("服务端 LLM 配置不完整");
  return { baseUrl: baseUrl.replace(/\/$/, ""), model, apiKey };
}
