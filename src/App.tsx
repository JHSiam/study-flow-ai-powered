import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  MessageSquare, 
  BookOpen, 
  Download, 
  CheckCircle2, 
  X, 
  Loader2, 
  Send,
  Printer,
  ChevronRight,
  Award,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { DocumentData, Question, QuizResult } from './types';
import { askQuestion, generateQuestions } from './services/ai';

// PDF.js worker setup
// Using unpkg for better reliability with specific versions
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'study' | 'quiz' | 'export'>('study');
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Chat state
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Quiz state
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [quizConfig, setQuizConfig] = useState({ mcq: 5, board: 2 });
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  // Export state
  const [exportTemplate, setExportTemplate] = useState<'standard' | 'modern' | 'minimal'>('standard');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const extractTextFromPDF = async (data: ArrayBuffer): Promise<string> => {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(' ') + '\n';
    }
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const text = await extractTextFromPDF(arrayBuffer);
        
        setDocument({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: 'pdf',
          content: text,
          mimeType: 'application/pdf'
        });
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setDocument({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: 'docx',
          content: result.value
        });
      } else {
        const text = await file.text();
        setDocument({
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          type: 'text',
          content: text
        });
      }
      
      setMessages([{ role: 'ai', content: `I've analyzed "${file.name}". How can I help you study today? You can ask questions or generate a quiz.` }]);
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to process document. Please try a different file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !document || isAsking || !document.content) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsAsking(true);

    try {
      const answer = await askQuestion(document.content, userMsg);
      setMessages(prev => [...prev, { role: 'ai', content: answer || 'Sorry, I couldn\'t find an answer.' }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'ai', content: 'Error connecting to AI. Please check your Groq API key.' }]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!document || isGeneratingQuiz || !document.content) return;
    setIsGeneratingQuiz(true);
    setQuizResult(null);
    setUserAnswers({});
    
    try {
      let mcqs: Question[] = [];
      let boards: Question[] = [];
      
      if (quizConfig.mcq > 0) {
        mcqs = await generateQuestions(document.content, 'mcq', quizConfig.mcq);
      }
      
      // Small delay between requests to avoid hitting TPM limit
      if (quizConfig.mcq > 0 && quizConfig.board > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      if (quizConfig.board > 0) {
        boards = await generateQuestions(document.content, 'board', quizConfig.board);
      }
      
      setQuizQuestions([...mcqs, ...boards]);
    } catch (error) {
      alert('Failed to generate quiz. Please check your Groq API key.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleSubmitQuiz = () => {
    let score = 0;
    const answers = quizQuestions.map(q => {
      const isCorrect = userAnswers[q.id]?.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
      if (isCorrect) score++;
      return {
        questionId: q.id,
        userAnswer: userAnswers[q.id] || '',
        isCorrect
      };
    });

    setQuizResult({
      score,
      total: quizQuestions.length,
      answers
    });
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    const title = document?.name || 'Question Paper';
    
    // Header
    doc.setFontSize(22);
    doc.text(title, 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Generated by StudyFlow AI | Date: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });
    doc.line(20, 35, 190, 35);

    let y = 45;

    // MCQs
    const mcqs = quizQuestions.filter(q => q.type === 'mcq');
    if (mcqs.length > 0) {
      doc.setFontSize(16);
      doc.text('Section A: Multiple Choice Questions', 20, y);
      y += 10;
      
      mcqs.forEach((q, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        const lines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 170);
        doc.text(lines, 20, y);
        y += (lines.length * 7);
        
        q.options?.forEach((opt, j) => {
          const char = String.fromCharCode(65 + j);
          doc.text(`${char}) ${opt}`, 30, y);
          y += 7;
        });
        y += 5;
      });
    }

    // Board Questions
    const boards = quizQuestions.filter(q => q.type === 'board');
    if (boards.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      y += 10;
      doc.setFontSize(16);
      doc.text('Section B: Descriptive Questions', 20, y);
      y += 10;

      boards.forEach((q, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        const lines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 170);
        doc.text(lines, 20, y);
        y += (lines.length * 7) + 20; // Space for answer
      });
    }

    doc.save(`${title.replace(/\.[^/.]+$/, "")}_Questions.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Sidebar */}
      <nav className="fixed left-0 top-0 h-full w-20 bg-white border-r border-gray-200 flex flex-col items-center py-8 gap-8 z-50">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-200 mb-4">
          <BookOpen size={28} />
        </div>
        
        <button 
          onClick={() => setActiveTab('study')}
          className={cn(
            "p-3 rounded-xl transition-all duration-200",
            activeTab === 'study' ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
          )}
        >
          <MessageSquare size={24} />
        </button>
        
        <button 
          onClick={() => setActiveTab('quiz')}
          className={cn(
            "p-3 rounded-xl transition-all duration-200",
            activeTab === 'quiz' ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
          )}
        >
          <CheckCircle2 size={24} />
        </button>
        
        <button 
          onClick={() => setActiveTab('export')}
          className={cn(
            "p-3 rounded-xl transition-all duration-200",
            activeTab === 'export' ? "bg-indigo-50 text-indigo-600" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
          )}
        >
          <Printer size={24} />
        </button>

        <div className="mt-auto">
          <button className="p-3 text-gray-400 hover:text-gray-600 rounded-xl">
            <Settings size={24} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 min-h-screen">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">StudyFlow <span className="text-indigo-600">AI</span></h1>
            {document && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-full text-sm font-medium text-gray-600 border border-gray-200">
                <FileText size={14} />
                <span className="max-w-[200px] truncate">{document.name}</span>
                <button onClick={() => setDocument(null)} className="hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {!document && (
              <label className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm font-medium">
                <Upload size={18} />
                <span>Upload Document</span>
                <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />
              </label>
            )}
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 border-2 border-white shadow-sm" />
          </div>
        </header>

        <div className="p-8 max-w-6xl mx-auto">
          {!document ? (
            <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
              <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 animate-bounce">
                <Upload size={48} />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Ready to master your studies?</h2>
              <p className="text-gray-500 max-w-md mb-8">Upload a PDF, Word document, or text file to start asking questions, generating quizzes, and creating custom question papers.</p>
              <label className="group relative flex flex-col items-center justify-center w-full max-w-lg h-64 border-2 border-dashed border-gray-300 rounded-3xl bg-white hover:bg-gray-50 hover:border-indigo-400 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 mb-4 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                  <p className="text-xs text-gray-400">PDF, DOCX, or TXT (MAX. 50MB)</p>
                </div>
                <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />
                {isUploading && (
                  <div className="absolute inset-0 bg-white/80 rounded-3xl flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                    <p className="text-sm font-medium text-gray-700">Analyzing document...</p>
                  </div>
                )}
              </label>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeTab === 'study' && (
                <motion.div 
                  key="study"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col h-[calc(100vh-180px)]"
                >
                  <div className="flex-1 overflow-y-auto pr-4 space-y-6 mb-4 custom-scrollbar">
                    {messages.map((msg, i) => (
                      <div key={i} className={cn(
                        "flex w-full",
                        msg.role === 'user' ? "justify-end" : "justify-start"
                      )}>
                        <div className={cn(
                          "max-w-[80%] p-4 rounded-2xl shadow-sm",
                          msg.role === 'user' 
                            ? "bg-indigo-600 text-white rounded-tr-none" 
                            : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"
                        )}>
                          <div className="prose prose-sm max-w-none dark:prose-invert">
                            <Markdown>{msg.content}</Markdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isAsking && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                          <Loader2 size={18} className="animate-spin text-indigo-600" />
                          <span className="text-sm text-gray-500">Thinking...</span>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>
                  
                  <div className="relative">
                    <input 
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask anything about the document..."
                      className="w-full bg-white border border-gray-200 rounded-2xl px-6 py-4 pr-16 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                    <button 
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isAsking}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'quiz' && (
                <motion.div 
                  key="quiz"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-8"
                >
                  {quizQuestions.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center max-w-2xl mx-auto">
                      <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-6">
                        <Award size={40} />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-4">Generate Your Quiz</h3>
                      <p className="text-gray-500 mb-8">Challenge yourself with AI-generated questions based on your document content.</p>
                      
                      <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="space-y-2 text-left">
                          <label className="text-sm font-semibold text-gray-700">MCQs (Multiple Choice)</label>
                          <input 
                            type="number" 
                            min="0" max="20"
                            value={quizConfig.mcq}
                            onChange={(e) => setQuizConfig(prev => ({ ...prev, mcq: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                          />
                        </div>
                        <div className="space-y-2 text-left">
                          <label className="text-sm font-semibold text-gray-700">Board Questions (Descriptive)</label>
                          <input 
                            type="number" 
                            min="0" max="10"
                            value={quizConfig.board}
                            onChange={(e) => setQuizConfig(prev => ({ ...prev, board: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                          />
                        </div>
                      </div>

                      <button 
                        onClick={handleGenerateQuiz}
                        disabled={isGeneratingQuiz}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                      >
                        {isGeneratingQuiz ? (
                          <>
                            <Loader2 size={20} className="animate-spin" />
                            <span>Generating Questions...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={20} />
                            <span>Start Quiz</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-8 pb-20">
                      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-gray-100 shadow-sm sticky top-20 z-30">
                        <div>
                          <h3 className="text-lg font-bold">Document Quiz</h3>
                          <p className="text-sm text-gray-500">{quizQuestions.length} Questions total</p>
                        </div>
                        {quizResult ? (
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-500">Your Score</p>
                              <p className="text-2xl font-black text-indigo-600">{quizResult.score} / {quizResult.total}</p>
                            </div>
                            <button 
                              onClick={() => setQuizQuestions([])}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-xl font-bold transition-colors"
                            >
                              New Quiz
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={handleSubmitQuiz}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all"
                          >
                            Submit Answers
                          </button>
                        )}
                      </div>

                      <div className="space-y-6">
                        {quizQuestions.map((q, i) => (
                          <div key={q.id} className={cn(
                            "bg-white p-8 rounded-3xl border transition-all",
                            quizResult 
                              ? (quizResult.answers.find(a => a.questionId === q.id)?.isCorrect ? "border-green-200 bg-green-50/30" : "border-red-200 bg-red-50/30")
                              : "border-gray-100 shadow-sm"
                          )}>
                            <div className="flex items-start gap-4 mb-6">
                              <span className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm font-bold text-gray-500">
                                {i + 1}
                              </span>
                              <h4 className="text-lg font-semibold text-gray-900 pt-1">{q.question}</h4>
                            </div>

                            {q.type === 'mcq' ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-12">
                                {q.options?.map((opt, idx) => {
                                  const isSelected = userAnswers[q.id] === opt;
                                  const isCorrect = opt === q.correctAnswer;
                                  return (
                                    <button
                                      key={idx}
                                      disabled={!!quizResult}
                                      onClick={() => setUserAnswers(prev => ({ ...prev, [q.id]: opt }))}
                                      className={cn(
                                        "p-4 rounded-xl border text-left transition-all flex items-center gap-3",
                                        isSelected ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50",
                                        quizResult && isCorrect && "border-green-500 bg-green-50 text-green-700",
                                        quizResult && isSelected && !isCorrect && "border-red-500 bg-red-50 text-red-700"
                                      )}
                                    >
                                      <span className="w-6 h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold">
                                        {String.fromCharCode(65 + idx)}
                                      </span>
                                      {opt}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="ml-12 space-y-4">
                                <textarea 
                                  disabled={!!quizResult}
                                  value={userAnswers[q.id] || ''}
                                  onChange={(e) => setUserAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                  placeholder="Type your answer here..."
                                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 min-h-[120px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                                />
                                {quizResult && (
                                  <div className="bg-white p-4 rounded-xl border border-indigo-100">
                                    <p className="text-sm font-bold text-indigo-600 mb-1">Model Answer:</p>
                                    <p className="text-gray-700 text-sm">{q.correctAnswer}</p>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {quizResult && (
                              <div className="mt-6 ml-12 p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-sm font-bold text-gray-700 mb-1">Explanation:</p>
                                <p className="text-gray-600 text-sm">{q.explanation}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === 'export' && (
                <motion.div 
                  key="export"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm mb-8">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">Printable Question Paper</h3>
                        <p className="text-gray-500">Customize and download your study material as a professional PDF.</p>
                      </div>
                      <button 
                        onClick={downloadPDF}
                        disabled={quizQuestions.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        <Download size={20} />
                        Download PDF
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                      <button 
                        onClick={() => setExportTemplate('standard')}
                        className={cn(
                          "p-6 rounded-2xl border-2 text-left transition-all",
                          exportTemplate === 'standard' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                        )}
                      >
                        <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 mb-4 flex items-center justify-center text-gray-400">
                          <FileText size={20} />
                        </div>
                        <h4 className="font-bold text-gray-900">Standard</h4>
                        <p className="text-xs text-gray-500 mt-1">Classic academic layout with clear sections.</p>
                      </button>
                      
                      <button 
                        onClick={() => setExportTemplate('modern')}
                        className={cn(
                          "p-6 rounded-2xl border-2 text-left transition-all",
                          exportTemplate === 'modern' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                        )}
                      >
                        <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 mb-4 flex items-center justify-center text-gray-400">
                          <Award size={20} />
                        </div>
                        <h4 className="font-bold text-gray-900">Modern</h4>
                        <p className="text-xs text-gray-500 mt-1">Clean, spacious design with bold headers.</p>
                      </button>

                      <button 
                        onClick={() => setExportTemplate('minimal')}
                        className={cn(
                          "p-6 rounded-2xl border-2 text-left transition-all",
                          exportTemplate === 'minimal' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                        )}
                      >
                        <div className="w-10 h-10 bg-white rounded-lg border border-gray-200 mb-4 flex items-center justify-center text-gray-400">
                          <ChevronRight size={20} />
                        </div>
                        <h4 className="font-bold text-gray-900">Minimal</h4>
                        <p className="text-xs text-gray-500 mt-1">Compact layout focused on saving space.</p>
                      </button>
                    </div>

                    {quizQuestions.length === 0 ? (
                      <div className="bg-gray-50 rounded-2xl p-12 text-center border border-dashed border-gray-200">
                        <p className="text-gray-500 mb-4">No questions generated yet. Go to the Quiz tab to create some questions first.</p>
                        <button 
                          onClick={() => setActiveTab('quiz')}
                          className="text-indigo-600 font-bold hover:underline"
                        >
                          Generate Questions Now →
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-2xl p-8 border border-gray-200">
                        <div className="flex items-center justify-between mb-6">
                          <h4 className="font-bold text-gray-700">Preview</h4>
                          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Page 1 of 1</span>
                        </div>
                        <div className="bg-white shadow-sm border border-gray-200 p-12 aspect-[1/1.414] w-full max-w-lg mx-auto overflow-hidden">
                          <div className="text-center mb-8">
                            <h2 className="text-xl font-bold uppercase tracking-widest border-b-2 border-gray-900 pb-2 inline-block">
                              {document.name.replace(/\.[^/.]+$/, "")}
                            </h2>
                            <div className="flex justify-between text-[10px] font-bold mt-4 text-gray-500">
                              <span>TIME: 1 HOUR</span>
                              <span>TOTAL MARKS: {quizQuestions.length * 5}</span>
                            </div>
                          </div>
                          
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <h5 className="text-xs font-black border-l-4 border-indigo-600 pl-2">SECTION A: OBJECTIVE</h5>
                              {quizQuestions.filter(q => q.type === 'mcq').slice(0, 3).map((q, i) => (
                                <div key={i} className="text-[10px] space-y-1">
                                  <p className="font-bold">Q{i+1}. {q.question}</p>
                                  <div className="grid grid-cols-2 gap-x-4 pl-4 text-gray-600">
                                    {q.options?.map((opt, idx) => (
                                      <span key={idx}>{String.fromCharCode(97 + idx)}) {opt}</span>
                                    ))}
                                  </div>
                                </div>
                              ))}
                              {quizQuestions.filter(q => q.type === 'mcq').length > 3 && (
                                <p className="text-[8px] text-gray-400 italic text-center">... and {quizQuestions.filter(q => q.type === 'mcq').length - 3} more questions</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #CBD5E0;
        }
      `}</style>
    </div>
  );
}
