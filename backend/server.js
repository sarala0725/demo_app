require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const xlsx = require("xlsx");
const sqlite3 = require("sqlite3").verbose();
const { v4: uuidv4 } = require("uuid");

let OpenAI = null;
try {
  // Optional dependency; only used when OPENAI_API_KEY is set.
  // eslint-disable-next-line global-require
  ({ OpenAI } = require("openai"));
} catch {
  OpenAI = null;
}

const PORT = process.env.PORT || 4000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.sqlite");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({ dest: UPLOAD_DIR });

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS robots (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      robot_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      kind TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(robot_id) REFERENCES robots(id)
    )`,
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      robot_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(document_id) REFERENCES documents(id),
      FOREIGN KEY(robot_id) REFERENCES robots(id)
    )`,
  );
});

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

// Backend metadata moved to /api status if needed, but removing from root to allow frontend to serve.
app.get("/api", (req, res) => {
  res.json({
    name: "ataiyal-robot-backend",
    ok: true,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/robots", (req, res) => {
  const { name, config } = req.body || {};
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "name is required" });
  }
  if (config === undefined) {
    return res.status(400).json({ error: "config is required" });
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const configJson = JSON.stringify(config);

  db.run(
    "INSERT INTO robots (id, name, config_json, created_at) VALUES (?, ?, ?, ?)",
    [id, name, configJson, createdAt],
    (err) => {
      if (err)
        return res.status(500).json({ error: "db_error", detail: err.message });
      res.json({ id, name, config, createdAt });
    },
  );
});

app.get("/api/robots", (req, res) => {
  db.all(
    "SELECT id, name, config_json, created_at FROM robots ORDER BY created_at DESC",
    (err, rows) => {
      if (err)
        return res.status(500).json({ error: "db_error", detail: err.message });
      const robots = (rows || []).map((r) => ({
        id: r.id,
        name: r.name,
        config: safeJsonParse(r.config_json),
        createdAt: r.created_at,
      }));
      res.json({ robots });
    },
  );
});

app.get("/api/robots/:id", (req, res) => {
  const { id } = req.params;
  db.get(
    "SELECT id, name, config_json, created_at FROM robots WHERE id = ?",
    [id],
    (err, row) => {
      if (err)
        return res.status(500).json({ error: "db_error", detail: err.message });
      if (!row) return res.status(404).json({ error: "not_found" });
      res.json({
        id: row.id,
        name: row.name,
        config: safeJsonParse(row.config_json),
        createdAt: row.created_at,
      });
    },
  );
});

app.get("/api/robots/:id/prompt-chips", (req, res) => {
  const robotId = req.params.id;
  db.get("SELECT id FROM robots WHERE id = ?", [robotId], (err, row) => {
    if (err)
      return res.status(500).json({ error: "db_error", detail: err.message });
    if (!row) return res.status(404).json({ error: "robot_not_found" });

    db.all(
      "SELECT text FROM document_chunks WHERE robot_id = ? ORDER BY created_at DESC, chunk_index ASC LIMIT 12",
      [robotId],
      async (chunksErr, rows) => {
        if (chunksErr)
          return res
            .status(500)
            .json({ error: "db_error", detail: chunksErr.message });

        const excerpts = (rows || [])
          .map((r) => ({ text: String(r.text || "") }))
          .filter((r) => r.text.trim());

        try {
          const llm = await maybeGeneratePromptChips({ excerpts });
          if (llm && Array.isArray(llm.prompts) && llm.prompts.length > 0) {
            return res.json({ prompts: llm.prompts, greeting: llm.greeting });
          }
        } catch {
          // ignore and fallback
        }

        res.json({ prompts: defaultPromptChips(), greeting: "" });
      },
    );
  });
});

app.post(
  "/api/robots/:id/documents",
  upload.single("file"),
  async (req, res) => {
    const robotId = req.params.id;
    console.log(`[UPLOAD] Starting upload request for robot ${robotId}`);
    if (req.file) {
      console.log(`[UPLOAD] File received: ${req.file.originalname} (${req.file.size} bytes)`);
    } else {
      console.log(`[UPLOAD] No file received in request`);
    }

    db.get(
      "SELECT id FROM robots WHERE id = ?",
      [robotId],
      async (err, row) => {
        if (err)
          return res
            .status(500)
            .json({ error: "db_error", detail: err.message });
        if (!row) return res.status(404).json({ error: "robot_not_found" });

        if (!req.file)
          return res
            .status(400)
            .json({ error: "file is required (field name: file)" });

        try {
          const filename = req.file.originalname || req.file.filename;
          const ext = (path.extname(filename) || "").toLowerCase();

          let kind = "unknown";
          let rawText = "";

          console.time(`[DOC_PROCESS] ${filename}`);
          if (ext === ".pdf") {
            kind = "pdf";
            rawText = await parsePdf(req.file.path);
          } else if (ext === ".xlsx" || ext === ".xls") {
            kind = "excel";
            rawText = parseExcel(req.file.path);
          } else {
            kind = "unknown";
            rawText = "";
          }

          const id = uuidv4();
          const createdAt = new Date().toISOString();

          if (ext === ".pdf") {
            try {
              const exportModule = await import('pdf-export-images');
              const exportImages = exportModule.exportImages || exportModule.default;

              const outDir = path.join(UPLOAD_DIR, 'images', id);
              if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
              }

              const images = await exportImages(req.file.path, outDir);

              const validImages = [];
              if (images && images.length > 0) {
                for (const img of images) {
                  const imgPath = typeof img === 'string' ? img : img.name || img.file;
                  let filename = path.basename(imgPath);
                  if (!filename.toLowerCase().endsWith('.png')) {
                    filename += '.png';
                  }

                  const fullPath = path.join(outDir, filename);
                  if (fs.existsSync(fullPath)) {
                    const stats = fs.statSync(fullPath);
                    // Filter out likely background images (e.g., < 25KB)
                    if (stats.size > 5000) {
                      validImages.push(filename);
                    } else {
                      // Optional: delete small images to save space
                      try { fs.unlinkSync(fullPath); } catch (e) { }
                    }
                  }
                }
              }

              console.log("[PDF EXTRACT] Extracted large images:", validImages.length);

              if (validImages.length > 0) {
                rawText += "\n\n【附圖參考】\n" + validImages.map(filename => {
                  // Use relative path for production compatibility
                  return `![教材圖片](/uploads/images/${id}/${filename})`;
                }).join('\n');
              }
            } catch (imgError) {
              console.error("[PDF EXTRACT ERROR] PDF image export failed:", imgError);
            }
          }

          const chunks = chunkText(rawText);

          db.run(
            "INSERT INTO documents (id, robot_id, filename, kind, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            [id, robotId, filename, kind, rawText, createdAt],
            (insertErr) => {
              if (insertErr) {
                return res
                  .status(500)
                  .json({ error: "db_error", detail: insertErr.message });
              }
              insertChunks({ documentId: id, robotId, chunks, createdAt })
                .then(async (chunkCount) => {
                  let language = "";
                  try {
                    language = await detectLanguageWithGemini(rawText.slice(0, 1500));
                  } catch (e) {
                    console.error("[LANG DETECT] Failed", e);
                  }
                  console.timeEnd(`[DOC_PROCESS] ${filename}`);

                  res.json({
                    id,
                    robotId,
                    filename,
                    kind,
                    createdAt,
                    textPreview: rawText.slice(0, 500),
                    textLength: rawText.length,
                    chunkCount,
                    language,
                  });
                })
                .catch((chunkErr) => {
                  res.status(500).json({
                    error: "chunk_index_error",
                    detail: chunkErr.message,
                  });
                });
            },
          );
        } catch (e) {
          res.status(500).json({
            error: "parse_error",
            detail: e && e.message ? e.message : String(e),
          });
        }
      },
    );
  },
);

app.post("/api/robots/:id/quiz/generate", (req, res) => {
  const robotId = req.params.id;

  db.get(
    "SELECT id, raw_text, filename, kind, created_at FROM documents WHERE robot_id = ? ORDER BY created_at DESC LIMIT 1",
    [robotId],
    (err, doc) => {
      if (err)
        return res.status(500).json({ error: "db_error", detail: err.message });
      if (!doc)
        return res.status(400).json({ error: "no_documents_for_robot" });

      db.all(
        "SELECT text FROM document_chunks WHERE robot_id = ? ORDER BY created_at DESC, chunk_index ASC LIMIT 60",
        [robotId],
        async (chunksErr, rows) => {
          if (chunksErr)
            return res
              .status(500)
              .json({ error: "db_error", detail: chunksErr.message });

          const excerpts = (rows || [])
            .map((r) => ({ text: String(r.text || "") }))
            .filter((r) => r.text.trim());

          try {
            const llmQuiz = await maybeGenerateQuizWithGemini({ excerpts });
            if (llmQuiz && llmQuiz.quiz) {
              return res.json({
                sourceDocument: {
                  id: doc.id,
                  filename: doc.filename,
                  kind: doc.kind,
                  createdAt: doc.created_at,
                },
                quiz: llmQuiz.quiz,
                mode: "llm",
              });
            }
          } catch {
            // ignore and fallback
          }

          const quiz = generateSimpleQuiz(doc.raw_text);
          res.json({
            sourceDocument: {
              id: doc.id,
              filename: doc.filename,
              kind: doc.kind,
              createdAt: doc.created_at,
            },
            quiz,
            mode: "simple",
          });
        },
      );
    },
  );
});

app.post("/api/robots/:id/qa", (req, res) => {
  const robotId = req.params.id;
  const question = (
    req.body && req.body.question ? String(req.body.question) : ""
  ).trim();
  if (!question) return res.status(400).json({ error: "question is required" });

  db.get(
    "SELECT id FROM robots WHERE id = ?",
    [robotId],
    (robotErr, robotRow) => {
      if (robotErr)
        return res
          .status(500)
          .json({ error: "db_error", detail: robotErr.message });
      if (!robotRow) return res.status(404).json({ error: "robot_not_found" });

      db.all(
        "SELECT text, chunk_index, document_id, created_at FROM document_chunks WHERE robot_id = ? ORDER BY created_at DESC, chunk_index ASC LIMIT 400",
        [robotId],
        async (err, rows) => {
          if (err)
            return res
              .status(500)
              .json({ error: "db_error", detail: err.message });
          const chunks = rows || [];
          if (chunks.length === 0)
            return res
              .status(400)
              .json({ error: "no_indexed_chunks_for_robot" });

          let top = [];
          if (question === "立即開始" || question.includes("立即開始")) {
            top = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index).slice(0, 5).map(row => ({ score: 1, row }));
          } else {
            const ranked = rankChunks(question, chunks);
            top = ranked.slice(0, 3);
          }
          const excerpts = top.map((t) => ({
            score: t.score,
            text: t.row.text,
            chunkIndex: t.row.chunk_index,
            documentId: t.row.document_id,
            createdAt: t.row.created_at,
          }));

          let llmResult = null;
          let llmError = "";
          try {
            llmResult = await maybeAnswerWithGemini({ question, excerpts });
          } catch (e) {
            llmError = e && e.message ? String(e.message) : String(e);
          }

          const llmAnswer =
            llmResult && llmResult.answerText ? llmResult.answerText : null;
          const provider =
            llmResult && llmResult.provider ? llmResult.provider : undefined;
          const model =
            llmResult && llmResult.model ? llmResult.model : undefined;
          const structured =
            llmResult && llmResult.structured
              ? llmResult.structured
              : undefined;
          const effectiveError =
            llmError ||
            (llmResult && llmResult.llmError ? String(llmResult.llmError) : "");

          let finalAnswer = llmAnswer;
          if (!finalAnswer) {
            if (effectiveError.includes("503") || effectiveError.includes("overloaded") || effectiveError.includes("429") || effectiveError.includes("exhausted")) {
              finalAnswer = "目前 AI 模型因為使用人數較多正在塞車中，請您稍後再試一次喔！";
            } else {
              finalAnswer = buildExtractiveAnswer(question, excerpts.map((e) => e.text));
            }
          }

          res.json({
            question,
            answer: finalAnswer,
            mode: finalAnswer.includes("塞車中") ? "llm" : (llmAnswer ? "llm" : "extractive"),
            structured,
            excerpts,
            provider,
            model,
            llmError: effectiveError || undefined,
          });
        },
      );
    },
  );
});

let currentGeminiKeyIndex = 0;

async function callGeminiChat({ apiKey, model, system, user }) {
  const { GoogleGenAI } = require('@google/genai');

  const keysStr = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || apiKey || "AIzaSyDO3L8XmbMaC37y5Y2_oYXfHcivQKQQGBc";
  const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);

  let lastError = null;
  const startIndex = currentGeminiKeyIndex % keys.length;

  for (let i = 0; i < keys.length; i++) {
    const attemptIndex = (startIndex + i) % keys.length;
    const currentKey = keys[attemptIndex];

    try {
      const ai = new GoogleGenAI({ apiKey: currentKey });
      const response = await ai.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: user }] }
        ],
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          temperature: 0.35,
          maxOutputTokens: 4096
        }
      });

      if (!response || !response.text) throw new Error("Gemini request failed to return content");
      currentGeminiKeyIndex = attemptIndex; // Keep using the successful key
      return response.text;
    } catch (err) {
      console.error(`Gemini API key at index ${attemptIndex} failed:`, err.message);
      lastError = err;
      const errMsg = err.message || "";
      if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("exhausted") || errMsg.includes("Too Many Requests") || errMsg.includes("API key not valid")) {
        console.log(`Switching to next Gemini API key...`);
        currentGeminiKeyIndex = (currentGeminiKeyIndex + 1) % keys.length;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error("All Gemini API keys failed.");
}
app.post("/api/chat", async (req, res) => {
  const { model, system, user } = req.body || {};
  if (!system || typeof system !== "string") {
    return res.status(400).json({ error: "system is required" });
  }
  if (!user || typeof user !== "string") {
    return res.status(400).json({ error: "user is required" });
  }

  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDO3L8XmbMaC37y5Y2_oYXfHcivQKQQGBc";
  const geminiModel = process.env.GEMINI_MODEL || model || "gemini-2.5-flash";

  try {
    const content = await callGeminiChat({ apiKey, model: geminiModel, system, user });
    if (!content) return res.status(404).json({ error: "not_found" });
    res.json({ content });
  } catch (error) {
    res.status(500).json({ error: "gemini_error", detail: error.message });
  }
});

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function extractJsonFromText(text) {
  const t = String(text || "").trim();
  if (!t) return "";

  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const body = fenced ? String(fenced[1] || "").trim() : t;

  const startObj = body.indexOf("{");
  const endObj = body.lastIndexOf("}");
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    return body.slice(startObj, endObj + 1).trim();
  }

  const startArr = body.indexOf("[");
  const endArr = body.lastIndexOf("]");
  if (startArr !== -1 && endArr !== -1 && endArr > startArr) {
    return body.slice(startArr, endArr + 1).trim();
  }

  return body;
}

async function parsePdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return (data && data.text ? data.text : "").trim();
}

function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetNames = workbook.SheetNames || [];
  const parts = [];
  for (const name of sheetNames) {
    const ws = workbook.Sheets[name];
    const rows = xlsx.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      defval: "",
    });
    for (const row of rows) {
      parts.push(row.join("\t"));
    }
  }
  return parts.join("\n").trim();
}

function generateSimpleQuiz(rawText) {
  const text = (rawText || "").replace(/\s+/g, " ").trim();
  if (!text) return { questions: [] };

  const sentences = text
    .split(/[。.!?\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length >= 12);

  const questions = [];
  for (const s of sentences.slice(0, 10)) {
    const words = s.split(" ").filter((w) => w && w.length >= 3);
    if (words.length < 4) continue;
    const targetIndex = Math.floor(words.length / 2);
    const answer = words[targetIndex];
    const prompt = words
      .map((w, i) => (i === targetIndex ? "____" : w))
      .join(" ");
    questions.push({
      type: "fill_in_blank",
      prompt,
      answer,
      source: s,
    });
  }

  return { questions };
}

function normalizeQuiz(quiz) {
  const questions = quiz && Array.isArray(quiz.questions) ? quiz.questions : [];
  const normalized = [];
  for (const q of questions) {
    if (!q) continue;
    const type = String(q.type || "").trim();
    const prompt = String(q.prompt || "").trim();
    const answer = String(q.answer || "").trim();
    const explanation = String(q.explanation || "").trim();
    const difficulty = String(q.difficulty || "").trim();
    const source = String(q.source || q.sourceExcerpt || "").trim();
    const choicesRaw = Array.isArray(q.choices) ? q.choices : null;
    const choices = choicesRaw
      ? choicesRaw.map((c) => String(c || "").trim()).filter(Boolean)
      : undefined;

    if (!prompt || !answer) continue;

    const safeType =
      type === "mcq" ||
        type === "fill_in_blank" ||
        type === "true_false" ||
        type === "short_answer"
        ? type
        : "fill_in_blank";

    const safeDifficulty =
      difficulty === "easy" || difficulty === "medium" || difficulty === "hard"
        ? difficulty
        : undefined;

    normalized.push({
      type: safeType,
      difficulty: safeDifficulty,
      prompt,
      choices: choices && choices.length ? choices : undefined,
      answer,
      explanation: explanation || undefined,
      source: source || undefined,
    });

    if (normalized.length >= 12) break;
  }

  return { questions: normalized };
}

async function maybeGenerateQuizWithGemini({ excerpts }) {
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDO3L8XmbMaC37y5Y2_oYXfHcivQKQQGBc";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const context = (excerpts || [])
    .slice(0, 24)
    .map((e, i) => `【摘錄 ${i + 1}】\n${e.text}`)
    .join("\n\n");
  if (!context.trim()) return null;

  const system =
    "你是一位親切、充滿耐心且循循善誘的語言學習導師。請認真讀懂『教材摘錄』，並出一份小測驗，確保題目多樣、循序漸進，能真正幫助學生吸收所學。\n" +
    "你必須只輸出 JSON（不要多出任何額外文字或 markdown 標記）。\n" +
    'JSON schema：{"questions":[{"type":"mcq"|"fill_in_blank"|"true_false"|"short_answer","difficulty":"easy"|"medium"|"hard","prompt":string,"choices"?:string[],"answer":string,"explanation":string,"source":string}] }\n' +
    "規則：\n" +
    "- 一共產生 8~10 題。\n" +
    "- 題型請涵蓋選擇、填空、是非、簡答，並依難易度（easy->medium->hard）及學習邏輯順序排列。\n" +
    "- 選擇題 choices 固定 4 個選項；answer 直接填入正確的原文文字（不要只填 A/B/C/D）。\n" +
    "- 每題 explanation 請用自然、溫暖且鼓勵的語氣，以 1~2 句話清楚說明解答邏輯，幫助學生真正理解。\n" +
    "- source 務必精準引用摘錄中的一句片段，不可編造。";

  const user = `教材摘錄：\n${context}`;

  try {
    const content = await callGeminiChat({ apiKey, model, system, user });
    if (!content) return null;
    const parsed = safeJsonParseMaybe(content);
    if (!parsed) return null;
    const quiz = normalizeQuiz(parsed);
    if (!quiz.questions || quiz.questions.length === 0) return null;
    return { quiz };
  } catch (error) {
    console.error("Quiz generation error:", error);
    return null;
  }
}

async function detectLanguageWithGemini(textSample) {
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDO3L8XmbMaC37y5Y2_oYXfHcivQKQQGBc";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!textSample || !textSample.trim()) return "";

  const system =
    "你是一個語言偵測助手。請根據以下教材片段，判斷這份教材是在教什麼語言？\n" +
    "請直接回傳該語言的名稱，例如「阿美族語」、「排灣族語」、「泰雅族語」、「英文」、「日文」等，不要包含任何其他文字或符號。\n" +
    "如果你不確定，請回傳空字串。";

  const user = `教材片段：\n${textSample}`;

  try {
    const content = await callGeminiChat({ apiKey, model, system, user });
    if (!content) return "";
    let lang = String(content).trim();
    // 移除不必要的引號與標點
    lang = lang.replace(/['"「」『』。！!]/g, "").trim();
    return lang.length <= 15 ? lang : ""; // 避免AI亂講話回傳整段解釋
  } catch (error) {
    console.error("Language detection error:", error);
    return "";
  }
}

function chunkText(rawText) {
  const text = (rawText || "").replace(/\r/g, "").trim();
  if (!text) return [];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const sentences = [];
  for (const line of lines) {
    // Check if the line is purely an image tag
    if (line.match(/^!\[.*?\]\(.*?\)$/)) {
      sentences.push(line);
      continue;
    }
    const parts = line
      .split(/(?<=[。.!?！？；;])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;
    sentences.push(...parts);
  }

  const chunks = [];
  let buf = "";
  for (const s of sentences) {
    if (!buf) {
      buf = s;
      continue;
    }
    // ensure image links aren't concatenated into oblivion if they can be their own chunk
    if (s.startsWith("![") && buf.length > 100) {
      chunks.push(buf);
      buf = s;
    } else if ((buf + " " + s).length > 420) {
      chunks.push(buf);
      buf = s;
    } else {
      buf += " " + s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.slice(0, 500);
}

function insertChunks({ documentId, robotId, chunks, createdAt }) {
  return new Promise((resolve, reject) => {
    if (!chunks || chunks.length === 0) return resolve(0);

    db.serialize(() => {
      const stmt = db.prepare(
        "INSERT INTO document_chunks (id, document_id, robot_id, chunk_index, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      let okCount = 0;
      let failed = null;

      for (let i = 0; i < chunks.length; i++) {
        const cid = uuidv4();
        stmt.run([cid, documentId, robotId, i, chunks[i], createdAt], (err) => {
          if (err && !failed) failed = err;
          if (!err) okCount++;
        });
      }

      stmt.finalize((finalErr) => {
        if (failed) return reject(failed);
        if (finalErr) return reject(finalErr);
        resolve(okCount);
      });
    });
  });
}

function tokenizeForSearch(text) {
  const t = String(text || "")
    .toLowerCase()
    .replace(/[_\-]/g, " ");

  const tokens = new Set();

  const latin = t.match(/[a-zA-Z]+/g) || [];
  for (const w of latin) {
    if (w.length >= 2) tokens.add(w);
  }

  const cjk = t.match(/[\u4e00-\u9fff]{1,}/g) || [];
  for (const seg of cjk) {
    if (seg.length === 1) tokens.add(seg);
    if (seg.length >= 2) {
      for (let i = 0; i < seg.length - 1; i++) tokens.add(seg.slice(i, i + 2));
    }
  }

  const nums = t.match(/[0-9]+/g) || [];
  for (const n of nums) tokens.add(n);

  return Array.from(tokens);
}

function rankChunks(question, rows) {
  const qTokens = tokenizeForSearch(question);
  const scored = [];
  for (const row of rows) {
    const hay = String(row.text || "").toLowerCase();
    let score = 0;
    for (const tok of qTokens) {
      if (tok && hay.includes(tok)) score += tok.length >= 2 ? 2 : 1;
    }
    if (score > 0) scored.push({ score, row });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.length > 0
    ? scored
    : rows.slice(0, 3).map((row) => ({ score: 0, row }));
}

function buildExtractiveAnswer(question, excerpts) {
  const q = String(question || "").trim();
  const topText = (excerpts || []).filter(Boolean).map(t => t.replace(/!\[.*?\]\(.*?\)/g, ""));
  const joined = topText.join("\n\n");

  const wantsVocab = /詞彙|單字|意思|翻譯|解釋/.test(q);
  const wantsExample = /例句|用法|怎麼用|造句/.test(q);

  let header = "我先從你上傳的教材中，找出最相關的段落：";
  if (wantsVocab)
    header = "我從教材中找到與你問題相關的片段，並嘗試用它來解釋詞彙/句子：";

  let suggestion =
    "你也可以指定要我解釋的詞（例如：請解釋「xxx」），或貼一整句讓我逐句說明。";
  if (wantsExample)
    suggestion = "如果你想練習用法，可以指定一個詞，叫我用該詞再給 3 個例句。";

  return `${header}\n\n${joined}\n\n${suggestion}`;
}

function safeJsonParseMaybe(s) {
  try {
    return JSON.parse(String(s || ""));
  } catch {
    try {
      const extracted = extractJsonFromText(s);
      if (!extracted) return null;
      return JSON.parse(extracted);
    } catch {
      return null;
    }
  }
}

function buildStructuredText(structured) {
  if (!structured || typeof structured !== "object") return "";

  if (structured.teaching && typeof structured.teaching === "object") {
    const t = structured.teaching;
    const title = t.title ? `主題：${String(t.title).trim()}` : "";
    const pattern = t.pattern ? `句型：${String(t.pattern).trim()}` : "";
    const rule = t.rule ? `規律：${String(t.rule).trim()}` : "";
    const lines = [];
    if (title) lines.push(title);
    if (pattern) lines.push(pattern);
    if (rule) lines.push(rule);

    if (Array.isArray(t.steps) && t.steps.length) {
      lines.push("\n步驟：");
      t.steps.slice(0, 6).forEach((s, i) => {
        const v = String(s || "").trim();
        if (v) lines.push(`${i + 1}. ${v}`);
      });
    }

    if (Array.isArray(t.breakdown) && t.breakdown.length) {
      lines.push("\n句型拆解：");
      t.breakdown.slice(0, 12).forEach((r) => {
        if (!r) return;
        const part = String(r.part || "").trim();
        const fn = String(r.function || "").trim();
        if (!part && !fn) return;
        lines.push(`- ${part}${fn ? `：${fn}` : ""}`);
      });
    }

    if (Array.isArray(t.examples) && t.examples.length) {
      lines.push("\n例句：");
      t.examples.slice(0, 6).forEach((ex, i) => {
        if (!ex) return;
        const native = String(ex.native || "").trim();
        const zh = String(ex.zh || "").trim();
        if (!native && !zh) return;
        lines.push(`${i + 1}. ${native}${zh ? `\n   → ${zh}` : ""}`);
      });
    }

    if (t.practice && typeof t.practice === "object") {
      const p = t.practice;
      const prompt = p.prompt ? String(p.prompt).trim() : "";
      const answer = p.answer ? String(p.answer).trim() : "";
      if (prompt || answer) {
        lines.push("\n練習：");
        if (prompt) lines.push(prompt);
        if (answer) lines.push(`答案：${answer}`);
      }
    }

    return lines.join("\n").trim();
  }

  if (Array.isArray(structured.cards) && structured.cards.length) {
    const title = structured.title ? `重點：${structured.title}` : "";
    const explanation = structured.explanation ? `解說：\n${structured.explanation}\n` : "";
    const lines = [];
    if (title) lines.push(title);
    if (explanation) lines.push(explanation);
    for (const c of structured.cards.slice(0, 30)) {
      if (!c) continue;
      const term = String(c.term || "").trim();
      const zh = String(c.zh || c.meaning || "").trim();
      const exampleNative = String(c.exampleNative || c.example || "").trim();
      const exampleZh = String(c.exampleZh || "").trim();
      if (!term) continue;
      const row = [];
      row.push(`- ${term}${zh ? `：${zh}` : ""}`);
      if (exampleNative) row.push(`  例（族語）：${exampleNative}`);
      if (exampleZh) row.push(`  例（中文）：${exampleZh}`);
      lines.push(row.join("\n"));
    }
    return lines.join("\n").trim();
  }

  const focus = structured.focus ? `重點：${structured.focus}` : "";
  const explanation = structured.explanation
    ? `\n\n解釋：\n${structured.explanation}`
    : "";
  const example = structured.example ? `\n\n例句：\n${structured.example}` : "";

  let practiceText = "";
  if (structured.practice) {
    if (typeof structured.practice === "string") {
      practiceText = `\n\n小練習：\n${structured.practice}`;
    } else if (typeof structured.practice === "object") {
      const p = structured.practice;
      if (p.sentence_with_blank) {
        practiceText = `\n\n小練習：\n${p.sentence_with_blank}`;
        if (p.correct_answer) practiceText += `\n答案：${p.correct_answer}`;
      }
    }
  }

  return `${focus}${explanation}${example}${practiceText}`.trim();
}

async function maybeAnswerWithGemini({ question, excerpts }) {
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDO3L8XmbMaC37y5Y2_oYXfHcivQKQQGBc";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const context = (excerpts || [])
    .map((e, i) => `【摘錄 ${i + 1}】\n${e.text}`)
    .join("\n\n");

  const q = String(question || "");
  const isStartNow = q === "立即開始" || q.includes("立即開始");
  const wantsTeaching =
    isStartNow || /句型|文法|規律|結構|用法|怎麼用|拆解|教我|教學|整理句型/.test(q);
  const wantsCards =
    !wantsTeaching &&
    /整理|清單|列表|列出|彙整|詞彙|單字|名詞|動物|植物|人名|地名/.test(q);

  const system = isStartNow
    ? "你是一位親切、充滿耐心且循循善誘的語言學習導師。學生剛剛點了「立即開始」學習。\n" +
    "請從提供的『教材摘錄』（這是教材最開頭的內容）中，挑選 3~5 個基礎核心單字或 1 個簡單基礎句型，帶領學生上第一堂課。\n" +
    "如果有符合主題的 ![教材圖片](網址)，請把它原封不動地放在 explanation 裡，圖文對照。\n" +
    "請用繁體中文，語氣如真人導師般溫暖鼓勵。流程：先簡單用 1~2 句話介紹這堂課要學什麼，接著用深入淺出的方式教學，最後出一個簡單的小測驗檢驗吸收程度。\n" +
    "最後出一個「單字填空」練習來考驗學生，格式為一個句子中包含挖空 ___，並給出正確答案與幾個錯誤干擾選項。\n" +
    "最重要的是，你必須在結尾產生『下一步引導 (next_steps)』：告訴學生「如果準備好進入下一步，請輸入『繼續學習』或『教我其他單字』」，給予明確的方向感。\n" +
    "把教材中的重點標記與原文詞用「」包起來，輔助前端高亮。\n" +
    "你必須『只能』輸出 JSON（不能有任何 markdown 格式如 ```json ）。SCHEMA：\n" +
    '{"teaching":{"title":string,"pattern":string,"rule":string,"steps":string[],"breakdown":[{"part":string,"function":string}],"examples":[{"native":string,"zh":string}],"practice":{"sentence_with_blank":string,"correct_answer":string,"wrong_options":string[]}},"highlights":string[],"next_steps":string}'
    : wantsTeaching
      ? "你是一位親切、充滿耐心且循循善誘的語言學習導師。你的目標是幫助學生循序漸進地學好語言，提供自然且有幫助的學習體驗。\n" +
      "你必須完全基於「教材摘錄」回答，認真讀去理解並拆解教學重點，不可編造。\n" +
      "如果有符合主題的 ![教材圖片](網址)，請把它原封不動地放進 explanation 欄位裡，幫助圖文對照學習。\n" +
      "請用繁體中文，語氣需如真人導師般溫暖且具啟發性。教學流程：先抓對學習有幫助的句型規律，再拆解，再舉例，最後出引導性練習。\n" +
      "最後出一個「單字填空」練習來考驗學生，格式為一個句子中包含挖空 ___，並給出正確答案與幾個錯誤干擾選項。\n" +
      "最重要的是，你必須在結尾產生『下一步引導 (next_steps)』：告訴學生接下來他應該詢問的問題，若判斷是教案結尾，請主動恭喜他並建議他進行總結測驗。\n" +
      "把教材中的關鍵知識與原文詞/片語用「」包起來，讓前端能高亮。\n" +
      "如果摘錄不足以推導句型，就在 rule 中溫和說明，其他欄位盡量留空。\n" +
      "你必須『只能』輸出 JSON（不要帶 markdown 格式如 ```json ）。JSON schema：\n" +
      '{"teaching":{"title":string,"pattern":string,"rule":string,"steps":string[],"breakdown":[{"part":string,"function":string}],"examples":[{"native":string,"zh":string}],"practice":{"sentence_with_blank":string,"correct_answer":string,"wrong_options":string[]}},"highlights":string[],"next_steps":string}'
      : wantsCards
        ? "你是一位親切、具循序漸進教學理念的語言學習導師。請完全基於「教材摘錄」提供自然、有幫助的指引。\n" +
        "請用繁體中文；語氣友善但不冗長，把重點傳達清楚。\n" +
        "如果有符合主題的 ![教材圖片](網址)，請把它原封不動地放進 explanation 欄位裡。\n" +
        "把內容中的關鍵原文詞（term）與重要單詞用「」包起來，方便前端高亮。\n" +
        "請把答案整理成「單詞卡」列表，最多 15 張卡，卡片排序請依照由淺入深的學習邏輯。每張卡必須：\n" +
        "- term：原文單詞/詞組\n" +
        "- zh：中文意思或解釋\n" +
        "- exampleNative：有助學習的原文例句（若無則留空字串）\n" +
        "- exampleZh：例句的中文翻譯（若無則留空字串）\n" +
        "你必須『只能』輸出 JSON（不要帶 ```json ）。JSON schema：\n" +
        '{"title":string,"explanation":string,"cards":[{"term":string,"zh":string,"exampleNative":string,"exampleZh":string}],"highlights":string[]}'
        : "你是一位親切、樂於助人的語言學習導師。你的回答要自然、具啟發性且有順序性地幫助學生，且必須完全基於「教材摘錄」。\n" +
        "如果有符合主題的 ![教材圖片](網址)，請把它原封不動地放進 explanation 欄位裡，幫助圖文對照學習。\n" +
        "請用繁體中文，語氣像和學生當面對話般溫暖但精簡。\n" +
        "重點單詞/詞組用「」包起來，幫助建立學習焦點（前端會高亮）。\n" +
        "若摘錄不足以回答：focus 欄位用溫柔的話說明資訊不足，explanation/example/practice 盡量留空。\n" +
        "你可以出一個「單字填空」練習來考驗學生，格式為一個句子中包含挖空 ___，並給出正確答案與幾個錯誤干擾選項。\n" +
        "你必須至少在對話結尾附上『下一步引導 (next_steps)』，主動提供後續的學習建議防範冷場。\n" +
        "你必須『只能』輸出 JSON（不要帶 ```json ）。JSON schema：\n" +
        '{"focus":string,"explanation":string,"example":string,"practice":{"sentence_with_blank":string,"correct_answer":string,"wrong_options":string[]},"highlights":string[],"next_steps":string}';

  const user = `問題：${question}\n\n教材摘錄：\n${context}`;

  try {
    const content = await callGeminiChat({ apiKey, model, system, user });
    if (!content) return null;
    const structured = safeJsonParseMaybe(content);
    if (!structured) return { answerText: content, structured: null, provider: "gemini" };
    const answerText = buildStructuredText(structured) || content;
    return { answerText, structured, provider: "gemini" };
  } catch (error) {
    console.error("QA generation error:", error);
    // Bubble up the error message so the caller knows it was API rate limit / 503 / 429
    return { answerText: null, structured: null, provider: "gemini", llmError: error.message || String(error) };
  }
}

function defaultPromptChips() {
  return ["教材重點整理", "單詞練習", "填空題練習", "教材複習"];
}

async function maybeGeneratePromptChips({ excerpts }) {
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyDO3L8XmbMaC37y5Y2_oYXfHcivQKQQGBc";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const context = (excerpts || [])
    .slice(0, 12)
    .map((e, i) => `【摘錄 ${i + 1}】\n${e.text}`)
    .join("\n\n");

  if (!context.trim()) return { prompts: defaultPromptChips(), greeting: "" };

  const system =
    "你是語言學習助教，正在扮演像 NotebookLM 的文件導讀角色。請根據下面的『教材摘錄』完成兩件事：\n" +
    "1. greeting：生成一段生動、有溫度的「教材開場導讀文字」。用繁體中文介紹這份教材主要在教什麼，並提及教材裡的核心生字/片語。\n" +
    "2. prompts：生成 3～4 個『可直接點擊』的推薦問句，幫助學員一步一步深入學習。問題要具體，例如：解釋某詞、整理情境清單、請你出考題測試。\n" +
    "要求：\n" +
    "- greeting 不要太長，約 50~100 字即可，語氣像大哥哥大姊姊般溫暖。\n" +
    "- 不要提到特定語言名稱（例如不要寫『英文』而是寫『族語』或『原文』）。\n" +
    "- 你必須只能輸出 JSON，不要多任何額外的文字或 markdown 標記。\n" +
    '- schema: {"greeting": string, "prompts": string[]}';

  const user = `教材摘錄：\n${context}`;

  try {
    const content = await callGeminiChat({ apiKey, model, system, user });
    if (!content) return null;

    const parsed = safeJsonParseMaybe(content);
    if (!parsed) return null;

    const rawPrompts = Array.isArray(parsed.prompts) ? parsed.prompts : null;
    const greeting = typeof parsed.greeting === "string" ? parsed.greeting : "";

    if (!rawPrompts) return { greeting };

    const uniq = [];
    const seen = new Set();
    for (const p of rawPrompts) {
      const s = String(p || "").trim();
      if (!s) continue;
      if (s.length > 80) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      uniq.push(s);
      if (uniq.length >= 6) break;
    }

    return {
      prompts: uniq.length ? uniq : defaultPromptChips(),
      greeting
    };
  } catch (error) {
    console.error("Prompt chip generation error:", error);
    return null;
  }
}

async function maybeAnswerWithLlm({ question, excerpts }) {
  const gemini = await maybeAnswerWithGemini({ question, excerpts });
  if (gemini) return gemini;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!OpenAI) return null;
  if (!excerpts || excerpts.length === 0) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const context = excerpts
    .map((e, i) => `【摘錄 ${i + 1}】\n${e.text}`)
    .join("\n\n");

  const system =
    "你是語言學習助教。你只能根據『教材摘錄』回答，不可編造.\n" +
    "用繁體中文、口吻自然但精簡；不要客套、不要重複問題.\n" +
    "把關鍵單詞/詞組用「」包起來（例如：「lokah」），讓前端能高亮.\n" +
    "若摘錄不足以回答：focus 用一句話說明不足，explanation/example/practice 盡量留空.\n" +
    "你必須只輸出 JSON（不要多任何文字）。JSON schema：\n" +
    "{\n" +
    '  "focus": string,\n' +
    '  "explanation": string,\n' +
    '  "example": string,\n' +
    '  "practice": string,\n' +
    '  "highlights": string[]\n' +
    "}\n" +
    "欄位說明：\n" +
    "- focus：一句話結論（最重要）\n" +
    "- explanation：白話解釋（最多 2 行）\n" +
    "- example：引用摘錄中的 1 句或 1 小段（若沒有就空字串）\n" +
    "- practice：給 1 題小練習（填空或翻譯二選一）\n" +
    "- highlights：要高亮的關鍵詞（每個詞用「」包起來）";

  const user = `問題：${question}\n\n教材摘錄：\n${context}`;

  const client = new OpenAI({ apiKey });
  const resp = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 420,
    response_format: { type: "json_object" },
  });

  const text =
    resp &&
      resp.choices &&
      resp.choices[0] &&
      resp.choices[0].message &&
      resp.choices[0].message.content
      ? String(resp.choices[0].message.content).trim()
      : "";

  if (!text) return null;
  const structured = safeJsonParseMaybe(text);
  if (!structured) return { answerText: text, structured: null };
  const answerText = buildStructuredText(structured) || text;
  return { answerText, structured };
}

// Serve static files from the React frontend build
const frontendBuildPath = path.resolve(__dirname, "..", "frontend", "build");

if (fs.existsSync(frontendBuildPath)) {
  console.log(`[backend] Serving static files from: ${frontendBuildPath}`);
} else {
  console.warn(`[backend] WARNING: Frontend build path NOT found: ${frontendBuildPath}`);
}

app.use(express.static(frontendBuildPath));

// Catch-all route to serve the React index.html for any frontend client-side routing
app.get("*", (req, res) => {
  const indexPath = path.join(frontendBuildPath, "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send("Frontend build not found. Please run 'npm run build' in the frontend directory.");
  }
});

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`);
});
