const { OpenAI } = require("openai"); // if used
const { GoogleGenAI } = require("@google/genai");

async function callGeminiChat({ apiKey, model, system, user }) {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: model || 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: user }] }],
        config: {
            systemInstruction: system,
            responseMimeType: 'application/json',
            temperature: 0.35,
            maxOutputTokens: 4096
        }
    });

    if (!response || !response.text) throw new Error("Gemini request failed to return content");
    return response.text;
}

const system = "你是一位親切、具循序漸進教學理念的語言學習導師。請完全基於「教材摘錄」提供自然、有幫助的指引。\n請用繁體中文；語氣友善但不冗長，把重點傳達清楚。\n如果有符合主題的 ![教材圖片](網址)，請把它原封不動地放進 explanation 欄位裡。\n把內容中的關鍵原文詞（term）與重要單詞用「」包起來，方便前端高亮。\n請把答案整理成「單詞卡」列表，最多 15 張卡，卡片排序請依照由淺入深的學習邏輯。每張卡必須：\n- term：原文單詞/詞組\n- zh：中文意思或解釋\n- exampleNative：有助學習的原文例句（若無則留空字串）\n- exampleZh：例句的中文翻譯（若無則留空字串）\n你必須『只能』輸出 JSON（不要帶 ```json ）。JSON schema：\n{\"title\":string,\"cards\":[{\"term\":string,\"zh\":string,\"exampleNative\":string,\"exampleZh\":string}],\"highlights\":string[]}";

const user = "問題：教材重點整理\n\n教材摘錄：【摘錄 1】\nU pasubanaay cira.";

const apiKey = process.env.GEMINI_API_KEY;

callGeminiChat({ apiKey, model: 'gemini-2.5-flash', system, user })
    .then(res => console.log("SUCCESS:", res))
    .catch(err => console.error("ERROR:", err));
