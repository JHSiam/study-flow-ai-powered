import Groq from "groq-sdk";
import { Question } from "../types";

// Note: In AI Studio, we'll use process.env.GROQ_API_KEY
const groq = new Groq({ 
  apiKey: process.env.GROQ_API_KEY || "",
  dangerouslyAllowBrowser: true // Required for client-side calls
});

const MODEL = "llama-3.3-70b-versatile";
const MAX_CHARS = 20000; // Reduced to stay safer under 12k TPM limit

function truncateContent(content: string): string {
  if (content.length <= MAX_CHARS) return content;
  return content.slice(0, MAX_CHARS) + "... [Content truncated due to size limits]";
}

async function fetchWithRetry(fn: () => Promise<any>, retries = 3, delay = 2000): Promise<any> {
  try {
    return await fn();
  } catch (error: any) {
    if (retries > 0 && (error.status === 429 || error.message?.includes('rate_limit'))) {
      console.log(`Rate limited. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function askQuestion(docContent: string, question: string) {
  const truncatedDoc = truncateContent(docContent);
  return fetchWithRetry(async () => {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful study assistant. Answer questions based on the provided document content. If the answer is not in the document, use your general knowledge but mention it's not in the text."
        },
        {
          role: "user",
          content: `Document Content:\n${truncatedDoc}\n\nQuestion: ${question}`
        }
      ],
      model: MODEL,
    });

    return completion.choices[0]?.message?.content || "No response from AI.";
  });
}

export async function generateQuestions(docContent: string, type: 'mcq' | 'board', count: number): Promise<Question[]> {
  const truncatedDoc = truncateContent(docContent);
  
  const schemaDescription = type === 'mcq' 
    ? `{"questions": [{"question": "string", "options": ["string", "string", "string", "string"], "correctAnswer": "string", "explanation": "string"}]}`
    : `{"questions": [{"question": "string", "correctAnswer": "string", "explanation": "string"}]}`;

  const prompt = type === 'mcq' 
    ? `Generate ${count} Multiple Choice Questions (MCQs) based on the document. Each MCQ must have exactly 4 options. The 'correctAnswer' must be the exact text of one of the options.`
    : `Generate ${count} Board-style descriptive questions based on the document. Provide a detailed 'correctAnswer' and a brief 'explanation' of key points.`;

  return fetchWithRetry(async () => {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are an expert examiner. You must return ONLY valid JSON matching this schema: ${schemaDescription}. Do not include any other text, markdown, or code blocks.`
        },
        {
          role: "user",
          content: `Document Content:\n${truncatedDoc}\n\nTask: ${prompt}`
        }
      ],
      model: MODEL,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", responseText);
      throw new Error("AI returned invalid JSON format. Please try again.");
    }
    
    const questionsArray = Array.isArray(data) ? data : (data.questions || data.mcqs || data.board_questions || Object.values(data)[0]);

    if (!Array.isArray(questionsArray)) {
      console.error("AI response data structure is invalid:", data);
      throw new Error("Invalid response format from AI. Expected an array of questions.");
    }

    return questionsArray.slice(0, count).map((q: any, index: number) => ({
      ...q,
      id: `${type}-${Date.now()}-${index}`,
      type
    }));
  });
}
