const sqlite3 = require('sqlite3');
const { GoogleGenAI } = require('@google/genai');

const db = new sqlite3.Database('data.sqlite');

function tokenizeForSearch(text) {
    const t = String(text || "").toLowerCase().replace(/[_\-]/g, " ");
    const tokens = new Set();
    const latin = t.match(/[a-zA-Z]+/g) || [];
    for (const w of latin) if (w.length >= 2) tokens.add(w);
    const cjk = t.match(/[\u4e00-\u9fff]{1,}/g) || [];
    for (const seg of cjk) {
        if (seg.length === 1) tokens.add(seg);
        if (seg.length >= 2) for (let i = 0; i < seg.length - 1; i++) tokens.add(seg.slice(i, i + 2));
    }
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
    return scored.length > 0 ? scored : rows.slice(0, 3).map((row) => ({ score: 0, row }));
}

async function run() {
    db.all('SELECT id FROM robots LIMIT 1', (err, rows) => {
        if (!rows || rows.length === 0) return console.log("No robots");
        const robotId = rows[0].id;
        const question = "眼睛";

        db.all("SELECT text, chunk_index, document_id, created_at FROM document_chunks WHERE robot_id = ? ORDER BY created_at DESC, chunk_index ASC LIMIT 400", [robotId], async (err, chunks) => {
            const ranked = rankChunks(question, chunks || []);
            const top = ranked.slice(0, 3);
            const excerpts = top.map(t => ({ text: t.row.text }));

            const apiKey = process.env.GEMINI_API_KEY;
            const model = 'gemini-2.5-flash';
            const context = excerpts.map((e, i) => `【摘錄 ${i + 1}】\n${e.text}`).join("\n\n");
            const system = "你是一位親切、樂於助人的語言學習導師。你的回答要自然、具啟發性且有順序性地幫助學生，且必須完全基於「教材摘錄」。\n" +
                "請用繁體中文，語氣像和學生當面對話般溫暖但精簡。\n" +
                "重點單詞/詞組用「」包起來，幫助建立學習焦點（前端會高亮）。\n" +
                "若摘錄不足以回答：focus 欄位用溫柔的話說明資訊不足，explanation/example/practice 盡量留空。\n" +
                "你必須『只能』輸出 JSON（不要帶 ```json ）。JSON schema：\n" +
                '{"focus":string,"explanation":string,"example":string,"practice":string,"highlights":string[]}';
            const user = `問題：${question}\n\n教材摘錄：\n${context}`;

            console.log("Sending User payload:", user);

            const ai = new GoogleGenAI({ apiKey });
            try {
                const response = await ai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts: [{ text: user }] }],
                    config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 4096 }
                });
                console.log("Response text:", response.text);
            } catch (e) {
                console.error("error from gemini:", e.message);
            }
        });
    });
}
run();
