"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle2, 
  XCircle, 
  HelpCircle,
  Trophy,
  RefreshCw,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { submitQuizAttempt } from "../actions";
import { toast } from "sonner";

interface Question {
  id: string;
  question: string;
  options: any; // string[]
  explanation: string | null;
  correctIdx: number;
}

interface AssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  lessonId: string;
  slug: string;
  onSuccess: () => void;
}

export function AssessmentModal({
  isOpen,
  onClose,
  questions,
  lessonId,
  slug,
  onSuccess
}: AssessmentModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>(new Array(questions.length).fill(-1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleSelect = (optionIdx: number) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentIndex] = optionIdx;
    setSelectedAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await submitQuizAttempt(lessonId, slug, selectedAnswers);
      if (res.status === "success" && res.score !== undefined && res.passed !== undefined) {
        setResult({ score: res.score, passed: res.passed });
        if (res.passed) {
          onSuccess();
        }
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetQuiz = () => {
    setCurrentIndex(0);
    setSelectedAnswers(new Array(questions.length).fill(-1));
    setResult(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] p-0 overflow-hidden bg-background border-border shadow-2xl rounded-2xl">
        <DialogHeader className="p-6 pb-0 sr-only">
          <DialogTitle>Lesson Assessment</DialogTitle>
          <DialogDescription>
            Answer 20 questions to complete the lesson. 15 required to pass.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="flex flex-col h-[600px] sm:h-[550px]">
            {/* Progress Bar */}
            <div className="h-1.5 w-full bg-muted overflow-hidden">
              <motion.div 
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="p-6 flex-1 flex flex-col overflow-hidden">
              {/* Header Info */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <HelpCircle className="size-5" />
                  </div>
                  <span className="text-sm uppercase tracking-wider">Question {currentIndex + 1} of {questions.length}</span>
                </div>
                <div className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-tighter">
                  Passing: 15/20 (75%)
                </div>
              </div>

              {/* Question Content */}
              <AnimatePresence mode="wait">
                <motion.div 
                  key={currentIndex}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 flex flex-col"
                >
                  <h3 className="text-xl font-bold mb-8 leading-relaxed text-foreground">
                    {currentQuestion.question}
                  </h3>

                  <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    {Array.isArray(currentQuestion.options) && currentQuestion.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelect(idx)}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border-2 transition-all duration-200 group flex items-start gap-4",
                          selectedAnswers[currentIndex] === idx 
                            ? "border-primary bg-primary/5 shadow-md shadow-primary/5" 
                            : "border-muted hover:border-primary/50 hover:bg-muted/50"
                        )}
                      >
                        <div className={cn(
                          "size-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                          selectedAnswers[currentIndex] === idx 
                            ? "border-primary bg-primary text-white" 
                            : "border-muted-foreground group-hover:border-primary"
                        )}>
                          {selectedAnswers[currentIndex] === idx && <CheckCircle2 className="size-4" />}
                        </div>
                        <span className={cn(
                          "text-sm font-medium leading-normal",
                          selectedAnswers[currentIndex] === idx ? "text-primary" : "text-muted-foreground"
                        )}>
                          {option}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer Actions */}
            <div className="p-6 border-t border-border bg-muted/20 flex items-center justify-between">
              <Button 
                variant="ghost" 
                onClick={handleBack}
                disabled={currentIndex === 0}
                className="gap-2 rounded-full font-bold uppercase tracking-tight text-xs"
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>

              {isLastQuestion ? (
                <Button 
                  onClick={handleSubmit}
                  disabled={selectedAnswers.includes(-1) || isSubmitting}
                  className="gap-2 rounded-full px-8 font-bold uppercase tracking-tight text-xs shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Finish Assessment
                </Button>
              ) : (
                <Button 
                  onClick={handleNext}
                  disabled={selectedAnswers[currentIndex] === -1}
                  className="gap-2 rounded-full px-8 font-bold uppercase tracking-tight text-xs"
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Result Screen */
          <div className="flex flex-col items-center justify-center p-12 text-center animate-in fade-in zoom-in duration-500 min-h-[500px]">
            <div className={cn(
              "size-24 rounded-full flex items-center justify-center mb-6 shadow-2xl",
              result.passed ? "bg-green-500 text-white shadow-green-500/20" : "bg-red-500 text-white shadow-red-500/20"
            )}>
              {result.passed ? <Trophy className="size-12" /> : <XCircle className="size-12" />}
            </div>

            <h2 className="text-3xl font-black mb-2 uppercase tracking-tighter">
              {result.passed ? "Assessment Passed!" : "Assessment Failed"}
            </h2>
            <p className="text-muted-foreground mb-8 font-medium">
              {result.passed 
                ? "Excellent work! You've successfully completed this lesson." 
                : "Not quite there yet. You need 15/20 correct answers to pass."}
            </p>

            <div className="bg-muted/50 rounded-2xl p-8 w-full max-w-sm mb-10 border border-border">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Your Score</span>
                <span className={cn(
                  "text-2xl font-black font-mono",
                  result.passed ? "text-green-500" : "text-red-500"
                )}>
                  {result.score}/20
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Accuracy</span>
                <span className="text-lg font-bold tabular-nums">
                  {Math.round((result.score / 20) * 100)}%
                </span>
              </div>
            </div>

            <div className="flex flex-col w-full max-w-sm gap-3">
              {result.passed ? (
                <Button onClick={onClose} className="w-full rounded-full h-12 font-bold uppercase tracking-widest shadow-xl shadow-primary/20">
                  Continue to Next Lesson
                </Button>
              ) : (
                <>
                  <Button onClick={resetQuiz} className="w-full rounded-full h-12 font-bold uppercase tracking-widest shadow-xl shadow-primary/20 gap-2">
                    <RefreshCw className="size-4" />
                    Try Again
                  </Button>
                  <Button variant="ghost" onClick={onClose} className="w-full h-12 font-bold uppercase tracking-tight text-muted-foreground">
                    Close
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
