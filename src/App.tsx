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
  Settings,
  Menu,
  X as XIcon
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

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const NAV_ITEMS = [
  { tab: 'study',  label: 'Study',    Icon: MessageSquare },
  { tab: 'quiz',   label: 'Quiz',     Icon: CheckCircle2  },
  { tab: 'export', label: 'Print',    Icon: Printer       },
] as const;

type Tab = 'study' | 'quiz' | 'export';

export default function App() {
  const [activeTab, setActiveTab]         = useState<Tab>('study');
  const [document, setDocument]           = useState<DocumentData | null>(null);
  const [isUploading, setIsUploading]     = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(false);

  // Chat
  const [messages, setMessages]   = useState<{ role: 'user' | 'ai'; content: string }[]>([]);
  const [input, setInput]         = useState('');
  const [isAsking, setIsAsking]   = useState(false);
  const chatEndRef                = useRef<HTMLDivElement>(null);

  // Quiz
  const [quizQuestions, setQuizQuestions]   = useState<Question[]>([]);
  const [quizConfig, setQuizConfig]         = useState({ mcq: 5, board: 2 });
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState(false);
  const [userAnswers, setUserAnswers]       = useState<Record<string, string>>({});
  const [quizResult, setQuizResult]         = useState<QuizResult | null>(null);

  // Export
  const [exportTemplate, setExportTemplate] = useState<'standard' | 'modern' | 'minimal'>('standard');

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close sidebar on tab change (mobile)
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const extractTextFromPDF = async (data: ArrayBuffer): Promise<string> => {
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      if (file.type === 'application/pdf') {
        const ab   = await file.arrayBuffer();
        const text = await extractTextFromPDF(ab);
        setDocument({ id: Math.random().toString(36).substr(2,9), name: file.name, type: 'pdf', content: text, mimeType: 'application/pdf' });
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const ab     = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: ab });
        setDocument({ id: Math.random().toString(36).substr(2,9), name: file.name, type: 'docx', content: result.value });
      } else {
        const text = await file.text();
        setDocument({ id: Math.random().toString(36).substr(2,9), name: file.name, type: 'text', content: text });
      }
      setMessages([{ role: 'ai', content: `I've analyzed "${file.name}". How can I help you study today? You can ask questions or generate a quiz.` }]);
    } catch (err) {
      console.error(err);
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
      setMessages(prev => [...prev, { role: 'ai', content: answer || "Sorry, I couldn't find an answer." }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', content: 'Error connecting to AI. Please check your API key.' }]);
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
      let mcqs:   Question[] = [];
      let boards: Question[] = [];
      if (quizConfig.mcq   > 0) mcqs   = await generateQuestions(document.content, 'mcq',   quizConfig.mcq);
      if (quizConfig.mcq   > 0 && quizConfig.board > 0) await new Promise(r => setTimeout(r, 3000));
      if (quizConfig.board > 0) boards = await generateQuestions(document.content, 'board', quizConfig.board);
      setQuizQuestions([...mcqs, ...boards]);
    } catch {
      alert('Failed to generate quiz. Please check your API key.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  const handleSubmitQuiz = () => {
    let score = 0;
    const answers = quizQuestions.map(q => {
      const isCorrect = userAnswers[q.id]?.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
      if (isCorrect) score++;
      return { questionId: q.id, userAnswer: userAnswers[q.id] || '', isCorrect };
    });
    setQuizResult({ score, total: quizQuestions.length, answers });
  };

  const downloadPDF = () => {
    const doc   = new jsPDF();
    const title = document?.name || 'Question Paper';
    doc.setFontSize(22);
    doc.text(title, 105, 20, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`Generated by StudyFlow AI | Date: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });
    doc.line(20, 35, 190, 35);
    let y = 45;

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
        y += lines.length * 7;
        q.options?.forEach((opt, j) => { doc.text(`${String.fromCharCode(65+j)}) ${opt}`, 30, y); y += 7; });
        y += 5;
      });
    }

    const boards = quizQuestions.filter(q => q.type === 'board');
    if (boards.length > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      y += 10;
      doc.setFontSize(16);
      doc.text('Section B: Descriptive Questions', 20, y);
      y += 10;
      boards.forEach((q, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        const lines = doc.splitTextToSize(`${i + 1}. ${q.question}`, 170);
        doc.text(lines, 20, y);
        y += lines.length * 7 + 20;
      });
    }
    doc.save(`${title.replace(/\.[^/.]+$/, '')}_Questions.pdf`);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">

      {/* ── Mobile top bar ── */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-50">
        <button
          onClick={() => setSidebarOpen(v => !v)}
          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100"
        >
          {sidebarOpen ? <XIcon size={22} /> : <Menu size={22} />}
        </button>
        <h1 className="text-lg font-bold tracking-tight">
          StudyFlow <span className="text-indigo-600">AI</span>
        </h1>
        {document ? (
          <button onClick={() => setDocument(null)} className="p-2 text-gray-400 hover:text-red-500">
            <X size={20} />
          </button>
        ) : (
          <label className="p-2 text-indigo-600 cursor-pointer">
            <Upload size={20} />
            <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} />
          </label>
        )}
      </header>

      {/* ── Mobile drawer overlay ── */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 bg-black/30 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Sidebar (desktop: fixed left column | mobile: slide-in drawer) ── */}
      <nav className={cn(
        // shared
        "fixed top-0 h-full bg-white border-r border-gray-200 flex flex-col items-center py-8 gap-2 z-50 transition-transform duration-300",
        // desktop
        "md:translate-x-0 md:w-24",
        // mobile
        "w-64 pt-20",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        {/* Logo — hidden on mobile (shown in top bar) */}
        <div className="hidden md:flex w-12 h-12 bg-indigo-600 rounded-2xl items-center justify-center text-white shadow-lg shadow-indigo-200 mb-6">
          <BookOpen size={26} />
        </div>

        {/* Nav items */}
        {NAV_ITEMS.map(({ tab, label, Icon }) => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={cn(
              // desktop: stacked icon+label centred
              "md:flex-col md:w-full md:px-2 md:py-3 md:gap-1 md:justify-center",
              // mobile: row with icon + bigger label
              "flex items-center gap-3 w-full px-5 py-3 rounded-xl transition-all duration-200 text-left",
              activeTab === tab
                ? "bg-indigo-50 text-indigo-600"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
            )}
          >
            <Icon size={20} className="shrink-0" />
            <span className={cn(
              "font-medium leading-none",
              // desktop: tiny label
              "md:text-[11px]",
              // mobile: readable label
              "text-sm"
            )}>
              {label}
            </span>
          </button>
        ))}

        {/* Settings */}
        <div className="mt-auto w-full">
          <button className={cn(
            "md:flex-col md:w-full md:px-2 md:py-3 md:gap-1 md:justify-center",
            "flex items-center gap-3 w-full px-5 py-3 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all duration-200"
          )}>
            <Settings size={20} className="shrink-0" />
            <span className="font-medium leading-none md:text-[11px] text-sm">Settings</span>
          </button>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className="md:pl-24 pt-14 md:pt-0 min-h-screen">

        {/* Desktop header bar */}
        <header className="hidden md:flex h-16 bg-white border-b border-gray-200 items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-gray-900">
              StudyFlow <span className="text-indigo-600">AI</span>
            </h1>
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

        <div className="p-4 md:p-8 max-w-6xl mx-auto">
          {!document ? (
            /* ── Upload screen ── */
            <div className="flex flex-col items-center justify-center min-h-[75vh] text-center px-4">
              <div className="w-20 h-20 md:w-24 md:h-24 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 mb-6 animate-bounce">
                <Upload size={40} />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">Ready to master your studies?</h2>
              <p className="text-gray-500 max-w-md mb-8 text-sm md:text-base">
                Upload a PDF, Word document, or text file to start asking questions, generating quizzes, and creating custom question papers.
              </p>
              <label className="group relative flex flex-col items-center justify-center w-full max-w-lg h-52 md:h-64 border-2 border-dashed border-gray-300 rounded-3xl bg-white hover:bg-gray-50 hover:border-indigo-400 transition-all cursor-pointer">
                <Upload className="w-10 h-10 mb-3 text-gray-400 group-hover:text-indigo-500 transition-colors" />
                <p className="mb-1 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-gray-400">PDF, DOCX, or TXT (MAX. 50MB)</p>
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

              {/* ── Study / Chat ── */}
              {activeTab === 'study' && (
                <motion.div
                  key="study"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="flex flex-col"
                  style={{ height: 'calc(100dvh - 130px)' }}
                >
                  <div className="flex-1 overflow-y-auto pr-2 md:pr-4 space-y-4 md:space-y-6 mb-4 custom-scrollbar">
                    {messages.map((msg, i) => (
                      <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                        <div className={cn(
                          "max-w-[85%] md:max-w-[80%] p-3 md:p-4 rounded-2xl shadow-sm text-sm md:text-base",
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
                        <div className="bg-white border border-gray-100 p-3 md:p-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                          <Loader2 size={16} className="animate-spin text-indigo-600" />
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
                      onChange={e => setInput(e.target.value)}
                      onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Ask anything about the document..."
                      className="w-full bg-white border border-gray-200 rounded-2xl px-4 md:px-6 py-3 md:py-4 pr-14 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm md:text-base"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!input.trim() || isAsking}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Quiz ── */}
              {activeTab === 'quiz' && (
                <motion.div
                  key="quiz"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-6 md:space-y-8"
                >
                  {quizQuestions.length === 0 ? (
                    <div className="bg-white rounded-3xl p-6 md:p-12 border border-gray-100 shadow-sm text-center max-w-2xl mx-auto">
                      <div className="w-16 h-16 md:w-20 md:h-20 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-5 md:mb-6">
                        <Award size={36} />
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-3 md:mb-4">Generate Your Quiz</h3>
                      <p className="text-gray-500 mb-6 md:mb-8 text-sm md:text-base">
                        Challenge yourself with AI-generated questions based on your document content.
                      </p>

                      <div className="grid grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8">
                        <div className="space-y-2 text-left">
                          <label className="text-xs md:text-sm font-semibold text-gray-700">MCQs</label>
                          <input
                            type="number" min="0" max="20"
                            value={quizConfig.mcq}
                            onChange={e => setQuizConfig(p => ({ ...p, mcq: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 md:px-4 py-2 md:py-3 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm"
                          />
                        </div>
                        <div className="space-y-2 text-left">
                          <label className="text-xs md:text-sm font-semibold text-gray-700">Descriptive</label>
                          <input
                            type="number" min="0" max="10"
                            value={quizConfig.board}
                            onChange={e => setQuizConfig(p => ({ ...p, board: parseInt(e.target.value) || 0 }))}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 md:px-4 py-2 md:py-3 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleGenerateQuiz}
                        disabled={isGeneratingQuiz}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 md:py-4 rounded-2xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                      >
                        {isGeneratingQuiz ? (
                          <><Loader2 size={18} className="animate-spin" /><span>Generating...</span></>
                        ) : (
                          <><CheckCircle2 size={18} /><span>Start Quiz</span></>
                        )}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-6 pb-20">
                      {/* Sticky quiz header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 md:p-6 rounded-2xl border border-gray-100 shadow-sm sticky top-14 md:top-16 z-30">
                        <div>
                          <h3 className="text-base md:text-lg font-bold">Document Quiz</h3>
                          <p className="text-xs md:text-sm text-gray-500">{quizQuestions.length} Questions</p>
                        </div>
                        {quizResult ? (
                          <div className="flex items-center gap-3 md:gap-4">
                            <div className="text-right">
                              <p className="text-xs font-medium text-gray-500">Score</p>
                              <p className="text-xl md:text-2xl font-black text-indigo-600">{quizResult.score} / {quizResult.total}</p>
                            </div>
                            <button
                              onClick={() => setQuizQuestions([])}
                              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 md:px-6 py-2 rounded-xl font-bold transition-colors text-sm"
                            >
                              New Quiz
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={handleSubmitQuiz}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 md:px-8 py-2 md:py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all text-sm"
                          >
                            Submit
                          </button>
                        )}
                      </div>

                      {quizQuestions.map((q, i) => (
                        <div
                          key={q.id}
                          className={cn(
                            "bg-white p-5 md:p-8 rounded-3xl border transition-all",
                            quizResult
                              ? (quizResult.answers.find(a => a.questionId === q.id)?.isCorrect
                                ? "border-green-200 bg-green-50/30"
                                : "border-red-200 bg-red-50/30")
                              : "border-gray-100 shadow-sm"
                          )}
                        >
                          <div className="flex items-start gap-3 md:gap-4 mb-5 md:mb-6">
                            <span className="w-7 h-7 md:w-8 md:h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs md:text-sm font-bold text-gray-500 shrink-0">
                              {i + 1}
                            </span>
                            <h4 className="text-base md:text-lg font-semibold text-gray-900 pt-0.5">{q.question}</h4>
                          </div>

                          {q.type === 'mcq' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 ml-10 md:ml-12">
                              {q.options?.map((opt, idx) => {
                                const isSelected = userAnswers[q.id] === opt;
                                const isCorrect  = opt === q.correctAnswer;
                                return (
                                  <button
                                    key={idx}
                                    disabled={!!quizResult}
                                    onClick={() => setUserAnswers(p => ({ ...p, [q.id]: opt }))}
                                    className={cn(
                                      "p-3 md:p-4 rounded-xl border text-left transition-all flex items-center gap-2 md:gap-3 text-sm",
                                      isSelected ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-100 hover:border-indigo-200 hover:bg-gray-50",
                                      quizResult && isCorrect && "border-green-500 bg-green-50 text-green-700",
                                      quizResult && isSelected && !isCorrect && "border-red-500 bg-red-50 text-red-700"
                                    )}
                                  >
                                    <span className="w-5 h-5 md:w-6 md:h-6 rounded-full border border-current flex items-center justify-center text-xs font-bold shrink-0">
                                      {String.fromCharCode(65 + idx)}
                                    </span>
                                    {opt}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="ml-10 md:ml-12 space-y-3 md:space-y-4">
                              <textarea
                                disabled={!!quizResult}
                                value={userAnswers[q.id] || ''}
                                onChange={e => setUserAnswers(p => ({ ...p, [q.id]: e.target.value }))}
                                placeholder="Type your answer here..."
                                className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-3 md:p-4 min-h-[100px] md:min-h-[120px] focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
                              />
                              {quizResult && (
                                <div className="bg-white p-3 md:p-4 rounded-xl border border-indigo-100">
                                  <p className="text-xs md:text-sm font-bold text-indigo-600 mb-1">Model Answer:</p>
                                  <p className="text-gray-700 text-xs md:text-sm">{q.correctAnswer}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {quizResult && (
                            <div className="mt-4 md:mt-6 ml-10 md:ml-12 p-3 md:p-4 bg-gray-50 rounded-xl border border-gray-100">
                              <p className="text-xs md:text-sm font-bold text-gray-700 mb-1">Explanation:</p>
                              <p className="text-gray-600 text-xs md:text-sm">{q.explanation}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ── Export / Print ── */}
              {activeTab === 'export' && (
                <motion.div
                  key="export"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="bg-white rounded-3xl p-5 md:p-8 border border-gray-100 shadow-sm mb-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
                      <div>
                        <h3 className="text-xl md:text-2xl font-bold text-gray-900">Printable Question Paper</h3>
                        <p className="text-gray-500 text-sm md:text-base">Customize and download as a professional PDF.</p>
                      </div>
                      <button
                        onClick={downloadPDF}
                        disabled={quizQuestions.length === 0}
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 md:px-8 py-3 rounded-xl font-bold shadow-lg shadow-indigo-100 transition-all disabled:opacity-50 text-sm md:text-base whitespace-nowrap"
                      >
                        <Download size={18} />
                        Download PDF
                      </button>
                    </div>

                    {/* Template picker */}
                    <div className="grid grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
                      {([
                        { key: 'standard', label: 'Standard', desc: 'Classic academic layout.',  Icon: FileText    },
                        { key: 'modern',   label: 'Modern',   desc: 'Bold, spacious headers.',   Icon: Award       },
                        { key: 'minimal',  label: 'Minimal',  desc: 'Compact, space-saving.',    Icon: ChevronRight },
                      ] as const).map(({ key, label, desc, Icon }) => (
                        <button
                          key={key}
                          onClick={() => setExportTemplate(key)}
                          className={cn(
                            "p-3 md:p-6 rounded-2xl border-2 text-left transition-all",
                            exportTemplate === key ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-indigo-200"
                          )}
                        >
                          <div className="w-8 h-8 md:w-10 md:h-10 bg-white rounded-lg border border-gray-200 mb-2 md:mb-4 flex items-center justify-center text-gray-400">
                            <Icon size={16} />
                          </div>
                          <h4 className="font-bold text-gray-900 text-sm md:text-base">{label}</h4>
                          <p className="text-[10px] md:text-xs text-gray-500 mt-0.5 md:mt-1 hidden sm:block">{desc}</p>
                        </button>
                      ))}
                    </div>

                    {/* Preview or empty state */}
                    {quizQuestions.length === 0 ? (
                      <div className="bg-gray-50 rounded-2xl p-8 md:p-12 text-center border border-dashed border-gray-200">
                        <p className="text-gray-500 mb-4 text-sm md:text-base">
                          No questions generated yet. Go to the Quiz tab first.
                        </p>
                        <button
                          onClick={() => setActiveTab('quiz')}
                          className="text-indigo-600 font-bold hover:underline text-sm"
                        >
                          Generate Questions Now →
                        </button>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-2xl p-4 md:p-8 border border-gray-200 overflow-auto">
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                          <h4 className="font-bold text-gray-700 text-sm">Preview</h4>
                          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Page 1 of 1</span>
                        </div>
                        <div className="bg-white shadow-sm border border-gray-200 p-6 md:p-12 aspect-[1/1.414] w-full max-w-sm md:max-w-lg mx-auto overflow-hidden">
                          <div className="text-center mb-6 md:mb-8">
                            <h2 className="text-base md:text-xl font-bold uppercase tracking-widest border-b-2 border-gray-900 pb-2 inline-block">
                              {document.name.replace(/\.[^/.]+$/, '')}
                            </h2>
                            <div className="flex justify-between text-[8px] md:text-[10px] font-bold mt-3 md:mt-4 text-gray-500">
                              <span>TIME: 1 HOUR</span>
                              <span>MARKS: {quizQuestions.length * 5}</span>
                            </div>
                          </div>
                          <div className="space-y-4 md:space-y-6">
                            <h5 className="text-[8px] md:text-xs font-black border-l-4 border-indigo-600 pl-2">SECTION A: OBJECTIVE</h5>
                            {quizQuestions.filter(q => q.type === 'mcq').slice(0, 3).map((q, i) => (
                              <div key={i} className="text-[7px] md:text-[10px] space-y-1">
                                <p className="font-bold">Q{i + 1}. {q.question}</p>
                                <div className="grid grid-cols-2 gap-x-4 pl-3 text-gray-600">
                                  {q.options?.map((opt, idx) => (
                                    <span key={idx}>{String.fromCharCode(97 + idx)}) {opt}</span>
                                  ))}
                                </div>
                              </div>
                            ))}
                            {quizQuestions.filter(q => q.type === 'mcq').length > 3 && (
                              <p className="text-[6px] md:text-[8px] text-gray-400 italic text-center">
                                ... and {quizQuestions.filter(q => q.type === 'mcq').length - 3} more
                              </p>
                            )}
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
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #CBD5E0; }
      `}</style>
    </div>
  );
}