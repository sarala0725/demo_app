const { GoogleGenAI } = require('@google/genai');

async function callGeminiChat({ apiKey, model, system, user }) {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: user }] }],
        config: { systemInstruction: system, responseMimeType: 'application/json', temperature: 0.35, maxOutputTokens: 4096 }
    });
    return response.text;
}

function safeJsonParseMaybe(s) {
    try { return JSON.parse(s || ""); } catch { return null; }
}

async function run() {
    const apiKey = 'AIzaSyBaiEXlZEPchyEsycaSx4cp7ozyt9PHqCk';
    const model = 'gemini-2.5-flash';
    const question = "眼睛";
    const excerpts = [{ text: "U mata kini. U tangila kini." }];

    const context = excerpts.map((e, i) => `【摘錄 ${i + 1}】\n${e.text}`).join("\n\n");
    const q = String(question || "");
    const system = "你是一位親切、樂於助人的語言學習導師。你的回答要自然、具啟發性且有順序性地幫助學生，且必須完全基於「教材摘錄」。\n" +
        "請用繁體中文，語氣像和學生當面對話般溫暖但精簡。\n" +
        "重點單詞/詞組用「」包起來，幫助建立學習焦點（前端會高亮）。\n" +
        "若摘錄不足以回答：focus 欄位用溫柔的話說明資訊不足，explanation/example/practice 盡量留空。\n" +
        "你必須『只能』輸出 JSON（不要帶 ```json ）。JSON schema：\n" +
        '{"focus":string,"explanation":string,"example":string,"practice":string,"highlights":string[]}';
    const user = `問題：${question}\n\n教材摘錄：\n${context}`;

    try {
        console.log("Calling gemini...");
        const content = await callGeminiChat({ apiKey, model, system, user });
        console.log("Content:", content);
        console.log("Parsed:", safeJsonParseMaybe(content));
    } catch (err) {
        console.error("SDK Error:", err);
    }
}
run();
