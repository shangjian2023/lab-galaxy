"use client";

import { useEffect, useState } from "react";
import { getAIConfig, updateAIConfig, type AIConfigItem } from "@/lib/api";

const CONFIG_FIELDS: { key: string; label: string; type: "text" | "password" | "select"; options?: string[] }[] = [
  { key: "llm_provider", label: "LLM 提供商", type: "select", options: ["openai", "anthropic"] },
  { key: "openai_api_key", label: "OpenAI API Key", type: "password" },
  { key: "openai_base_url", label: "OpenAI Base URL", type: "text" },
  { key: "openai_model", label: "OpenAI 模型", type: "text" },
  { key: "anthropic_api_key", label: "Anthropic API Key", type: "password" },
  { key: "anthropic_model", label: "Anthropic 模型", type: "text" },
  { key: "embedding_model", label: "Embedding 模型", type: "text" },
];

export default function AdminAIConfigPage() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    getAIConfig().then((res) => {
      const map: Record<string, string> = {};
      for (const c of res.configs) map[c.key] = c.value;
      setConfigs(map);
      setOriginal(map);
      setLoading(false);
    });
  }, []);

  const handleChange = (key: string, value: string) => {
    setConfigs((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const handleSave = async () => {
    const changed: Record<string, string> = {};
    for (const [key, value] of Object.entries(configs)) {
      if (value && value !== original[key] && !value.startsWith("****")) {
        changed[key] = value;
      }
    }
    if (Object.keys(changed).length === 0) {
      setMessage({ type: "error", text: "没有变更" });
      return;
    }
    setSaving(true);
    try {
      const res = await updateAIConfig(changed);
      const map: Record<string, string> = {};
      for (const c of res.configs) map[c.key] = c.value;
      setConfigs(map);
      setOriginal(map);
      setMessage({ type: "success", text: "保存成功，AI 服务已重载" });
    } catch {
      setMessage({ type: "error", text: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const toggleShow = (key: string) => setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) return <main className="p-6 text-gray-600">加载中...</main>;

  return (
    <main className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">AI 服务配置</h1>
        <p className="text-sm text-gray-700">配置 LLM 提供商、API Key 和模型名称，修改后自动生效</p>
      </div>

      <div className="glass-card p-6 space-y-5">
        {CONFIG_FIELDS.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-sm font-medium text-gray-700">{field.label}</label>
            {field.type === "select" ? (
              <select
                value={configs[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                className="glass-input w-full px-3 py-2 text-sm"
              >
                <option value="">未设置</option>
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : field.type === "password" ? (
              <div className="flex gap-2">
                <input
                  type={showKeys[field.key] ? "text" : "password"}
                  value={configs[field.key] || ""}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder="留空表示不修改"
                  className="glass-input flex-1 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => toggleShow(field.key)}
                  className="btn-secondary px-3 py-2 text-xs"
                >
                  {showKeys[field.key] ? "隐藏" : "显示"}
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={configs[field.key] || ""}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder="留空表示不修改"
                className="glass-input w-full px-3 py-2 text-sm"
              />
            )}
          </div>
        ))}

        {message && (
          <div className={`rounded-lg px-4 py-2 text-sm ${
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}>
            {message.text}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary w-full px-4 py-2 text-sm font-medium text-white"
        >
          {saving ? "保存中..." : "保存配置"}
        </button>
      </div>
    </main>
  );
}
