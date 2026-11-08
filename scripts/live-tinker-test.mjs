import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    const contents = readFileSync(envPath, "utf-8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (match) process.env[match[1]] = match[2];
    }
  } catch {}
}

loadEnvLocal();

async function main() {
  const apiKey = process.env.TINKER_API_KEY;
  const baseUrl = process.env.TINKER_BASE_URL;
  const model = process.env.TINKER_MODEL;
  if (!apiKey || !baseUrl || !model) {
    console.error("Missing env");
    process.exit(1);
  }

  const body = {
    model,
    system: "You are an expert nonprofit program evaluator. Return compact JSON only.",
    messages: [
      { role: "user", content: "Generate one volunteer reflection question for a food bank in JSON with schema { questions: [{ question_key, question_text, question_type }] }. Return only raw JSON." }
    ],
    max_tokens: 4096,
    reasoning_effort: false,
  };

  console.log("Body keys:", Object.keys(body).join(","));

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    console.log("Status:", response.status);

    if (!response.ok) {
      console.error("Error body:", text.slice(0, 500));
      process.exit(1);
    }

    const data = JSON.parse(text);
    const textBlocks = (data.content || []).filter((b) => b.type === "text");
    const joined = textBlocks.map((b) => b.text).filter((t) => t).join("");
    console.log("Blocks:", (data.content || []).map((b) => b.type).join(","));
    console.log("Text length:", joined.length);
    console.log("Text preview:", joined.slice(0, 300));

    const parsed = JSON.parse(joined);
    console.log("Parsed:", JSON.stringify(parsed, null, 2));
    console.log("SUCCESS");
  } catch (e) {
    console.error("Fail:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
