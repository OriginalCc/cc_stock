/**
 * 概念归类覆盖率验证：对东财概念板块全量（/tmp/em-boards-all.txt）
 * 与候选池个股概念全集（/tmp/stocks6.json）逐一分类，打印每个大类的成员与 other 名单。
 * 运行：bun run scripts/validate-concept-categories.ts
 */
import { classifyConcept, getConceptCategory, CONCEPT_CATEGORIES } from "../src/lib/concept-categories";
import fs from "node:fs";

function loadNames(): { source: string; names: string[] }[] {
  const out: { source: string; names: string[] }[] = [];
  if (fs.existsSync("/tmp/em-boards-all.txt")) {
    const names = fs.readFileSync("/tmp/em-boards-all.txt", "utf8").split("\n").map(s => s.trim()).filter(Boolean);
    out.push({ source: "东财板块全集", names });
  }
  if (fs.existsSync("/tmp/stocks6.json")) {
    const data = JSON.parse(fs.readFileSync("/tmp/stocks6.json", "utf8"));
    const set = new Set<string>();
    for (const s of data.stocks) {
      for (const c of s.concepts ?? (s.concept ? [s.concept] : [])) set.add(c);
    }
    out.push({ source: "候选池个股概念", names: [...set].sort() });
  }
  return out;
}

for (const { source, names } of loadNames()) {
  const byCat = new Map<string, string[]>();
  for (const n of names) {
    const id = classifyConcept(n);
    if (!byCat.has(id)) byCat.set(id, []);
    byCat.get(id)!.push(n);
  }
  console.log(`\n======== ${source}（共 ${names.length}） ========`);
  for (const cat of CONCEPT_CATEGORIES) {
    const members = byCat.get(cat.id) ?? [];
    if (members.length === 0) continue;
    console.log(`${cat.name}(${cat.id}) ${members.length}: ${members.join("、")}`);
  }
  const others = byCat.get("other") ?? [];
  console.log(`其他(other) ${others.length}: ${others.join("、") || "(无)"}`);
}
