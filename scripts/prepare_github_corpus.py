#!/usr/bin/env python3
"""Build a source manifest from two public completed-lab-report repositories."""

import json
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
METADATA = ROOT / "data" / "source-metadata"
OUTPUT = ROOT / "data" / "public-cs-reports-sources.json"

REPOSITORIES = [
    {
        "tree": METADATA / "network-tree.json",
        "repo": "MinmusLin/Computer_Network_Experiment_Reports",
        "branch": "main",
        "institution": "同济大学",
        "license": "仓库声明 MIT License；README 另注明仅限个人学习研究、非商业使用并遵守学术诚信。仅作本机解析测试，保留来源。",
        "accept": lambda path: path.startswith("Lab") and path.endswith(".pdf"),
    },
    {
        "tree": METADATA / "uestc-tree.json",
        "repo": "LolipopJ/uestc-coursework-repo",
        "branch": "master",
        "institution": "电子科技大学",
        "license": "公开仓库，未发现明确开放许可证；作者注明实验报告仅供参考。仅作本机解析测试，不再分发。",
        "accept": lambda path: path.startswith("pdf-") and path.endswith(".pdf") and "作业" not in path and "详细设计" not in path and "实验" in path,
    },
]


def main() -> None:
    sources = []
    for config in REPOSITORIES:
        tree = json.loads(config["tree"].read_text(encoding="utf-8"))["tree"]
        items = sorted((item for item in tree if item["type"] == "blob" and config["accept"](item["path"])), key=lambda item: item["path"])
        for item in items:
            path = item["path"]
            encoded_path = quote(path)
            name = Path(path).stem
            sources.append({
                "id": f"{config['repo'].split('/')[0].lower()}-{len(sources) + 1:03d}",
                "title": name,
                "course": Path(path).parent.name.removeprefix("pdf-"),
                "institution": config["institution"],
                "source_page": f"https://github.com/{config['repo']}/blob/{config['branch']}/{encoded_path}",
                "format": "pdf",
                "direct_url": f"https://raw.githubusercontent.com/{config['repo']}/{config['branch']}/{encoded_path}",
                "license_note": config["license"],
                "content_type": "completed_lab_report",
                "repository": f"https://github.com/{config['repo']}",
                "blob_api": f"repos/{config['repo']}/git/blobs/{item['sha']}",
                "expected_size": item.get("size"),
            })
    OUTPUT.write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "candidates": len(sources), "network": sum("MinmusLin" in item["repository"] for item in sources), "uestc": sum("LolipopJ" in item["repository"] for item in sources)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
