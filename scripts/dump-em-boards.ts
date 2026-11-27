/**
 * 拉取东财概念板块全量清单（m:90+t:3，含风格类），落盘 /tmp/em-boards-all.txt
 * 用途：概念归类词典（concept-categories.ts）的覆盖率验证基准
 * 运行：bun run scripts/dump-em-boards.ts
 */
import { emRawJson } from "../src/lib/em-raw-client";
import fs from "node:fs";

async function main() {
  const names = new Map<string, string>();
  for (let pn = 1; pn <= 10; pn++) {
    const url = `http://push2delay.eastmoney.com/api/qt/clist/get?pn=${pn}&pz=100&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3&fields=f12,f14`;
    const json = await emRawJson([url, url.replace("http://", "https://")], 3, 8000);
    const diff = json?.data?.diff;
    if (!Array.isArray(diff) || diff.length === 0) break;
    const total = Number(json?.data?.total) || 0;
    for (const it of diff) {
      const code = String(it.f12 ?? "");
      const name = String(it.f14 ?? "").trim();
      if (/^BK\d+$/.test(code) && name) names.set(code, name);
    }
    console.log(`page ${pn}: +${diff.length} (total=${total})`);
    if (total > 0 && pn * 100 >= total) break;
  }
  const arr = [...names.values()].sort((a, b) => a.localeCompare(b, "zh-CN"));
  fs.writeFileSync("/tmp/em-boards-all.txt", arr.join("\n"), "utf8");
  console.log("SAVED", arr.length, "boards -> /tmp/em-boards-all.txt");
}

main();
