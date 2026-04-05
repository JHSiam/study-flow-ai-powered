import { Type } from "@google/genai";

export interface DocumentData {
  id: string;
  name: string;
  type: string;
  content?: string; // For text-based docs
  base64?: string; // For PDF direct sending
  mimeType?: string;
}

export interface Question {
  id: string;
  type: 'mcq' | 'board';
  question: string;
  options?: string[]; // For MCQ
  correctAnswer: string;
  explanation: string;
}

export interface QuizResult {
  score: number;
  total: number;
  answers: {
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
  }[];
}

export const MCQ_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Exactly 4 options"
      },
      correctAnswer: { type: Type.STRING, description: "The exact text of the correct option" },
      explanation: { type: Type.STRING }
    },
    required: ["question", "options", "correctAnswer", "explanation"]
  }
};

export const BOARD_QUESTION_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      correctAnswer: { type: Type.STRING, description: "A detailed model answer" },
      explanation: { type: Type.STRING, description: "Key points to look for in the answer" }
    },
    required: ["question", "correctAnswer", "explanation"]
  }
};
