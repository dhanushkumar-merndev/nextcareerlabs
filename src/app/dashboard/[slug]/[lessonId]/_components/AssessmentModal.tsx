"use client";

import { useState, useEffect } from "react";
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
  Loader2,
  Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { submitQuizAttempt } from "../actions";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface Question {
  id: string;
  question: string;
  options: any; // string[]
  explanation: string | null;
  correctIdx: number;
}

interface ShuffledQuestion extends Question {
  originalIndex: number;
  shuffledOptions: { text: string; originalIndex: number }[];
}

interface AssessmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  lessonId: string;
  slug: string;
  onSuccess: () => void;
  initialPassed?: boolean;
}

// Screens: 'quiz' | 'review'
type Screen = "quiz" | "review";

export function AssessmentModal({
  isOpen,
  onClose,
  questions,
  lessonId,
  slug,
  onSuccess,
  initialPassed
}: AssessmentModalProps) {
  const [screen, setScreen] = useState<Screen>("quiz");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>(new Array(questions.length).fill(-1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [shuffledQuestions, setShuffledQuestions] = useState<ShuffledQuestion[]>([]);
  // Maps shuffled question index -> original option index that the user selected
  const [resolvedAnswers, setResolvedAnswers] = useState<number[]>([]);
  const [showAnswers, setShowAnswers] = useState(true);

  // Initialize shuffled questions and options
  const initializeQuiz = (qs: Question[]) => {
    if (qs.length === 0) return;
    
    const shuffled = shuffleArray(qs.map((q, qIdx) => ({
      ...q,
      originalIndex: qIdx,
      shuffledOptions: shuffleArray((q.options as string[]).map((opt, oIdx) => ({
        text: opt,
        originalIndex: oIdx
      })))
    })));
    
    setShuffledQuestions(shuffled);
    setCurrentIndex(0);
    setDirection(0);
    setSelectedAnswers(new Array(qs.length).fill(-1));
    setResolvedAnswers([]);
    setResult(null);
    // Always start in quiz mode for practice (passed users) or first attempt
    setScreen("quiz");
    setShowAnswers(false); // Hide answers by default in practice
  };

  // Run when modal opens
  useEffect(() => {
    if (isOpen) {
      initializeQuiz(questions);
    }
  }, [isOpen, questions, initialPassed]);

  const currentQuestion = shuffledQuestions[currentIndex];
  if (!currentQuestion && questions.length > 0) return null;

  const isLastQuestion = currentIndex === questions.length - 1;
  const progress = ((currentIndex + 1) / questions.length) * 100;

  const handleSelect = (optionIdx: number) => {
    // Read-only in review mode
    if (screen === "review") return;
    const newAnswers = [...selectedAnswers];
    newAnswers[currentIndex] = optionIdx;
    setSelectedAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setDirection(1);
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Map shuffled answers back to original question and option indices
      const originalAnswers = new Array(questions.length).fill(-1);
      const resolved = new Array(shuffledQuestions.length).fill(-1);

      shuffledQuestions.forEach((sQ, i) => {
        const selectedUIIdx = selectedAnswers[i];
        if (selectedUIIdx !== -1) {
          const originalOptionIdx = sQ.shuffledOptions[selectedUIIdx].originalIndex;
          originalAnswers[sQ.originalIndex] = originalOptionIdx;
          resolved[i] = originalOptionIdx; // store per shuffled question slot
        }
      });

      setResolvedAnswers(resolved);

      // 🛡️ PRACTICE MODE: skip DB for already passed users
      if (initialPassed) {
        let score = 0;
        shuffledQuestions.forEach((sQ, i) => {
          if (resolved[i] === sQ.correctIdx) score++;
        });
        
        const isPracticePass = score >= 15;
        setResult({ score, passed: isPracticePass });
        setScreen("review");
        setCurrentIndex(0);
        setDirection(0);
        setShowAnswers(true);
        
        toast.success(`Practice complete! You got ${score} out of ${questions.length} correct.`, {
          duration: 3000,
        });
        return;
      }

      const res = await submitQuizAttempt(lessonId, slug, originalAnswers);
      if (res.status === "success" && res.score !== undefined && res.passed !== undefined) {
        const finalResult = { score: res.score, passed: res.passed };
        setResult(finalResult);

        // Show toast with score
        if (res.passed) {
          toast.success(`You got ${res.score} out of ${questions.length} correct! Assessment passed! 🎉`, {
            duration: 4000,
          });
          onSuccess(); // update sidebar/cache but don't close modal
        } else {
          toast.error(`You got ${res.score} out of ${questions.length} correct. 15 needed to pass.`, {
            duration: 4000,
          });
        }

        // Switch to review screen
        setScreen("review");
        setCurrentIndex(0);
        setDirection(0);
        setShowAnswers(true);
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
    initializeQuiz(questions);
  };

  // In review mode, determine per-option correctness
  const getOptionReviewState = (shuffledOptionIdx: number) => {
    if (!currentQuestion) return "neutral";
    
    // In Quiz mode (Practice), hide answers if toggle is off
    if (!isReviewMode && (result?.passed || initialPassed) && !showAnswers) return "neutral";

    const option = currentQuestion.shuffledOptions[shuffledOptionIdx];
    const isCorrect = option.originalIndex === currentQuestion.correctIdx;

    // Review mode logic: Always show correct/wrong
    if (isReviewMode) {
      const isSelected = resolvedAnswers[currentIndex] === option.originalIndex;
      if (isCorrect) return "correct";
      if (isSelected) return "wrong";
      return "neutral";
    }

    // Quiz mode logic (Practice): show only correct if toggled
    if (screen === "quiz" && initialPassed && showAnswers) {
      if (isCorrect) return "correct";
    }

    return "neutral";
  };

  const isReviewMode = screen === "review";
  const canShowAnswerToggle = !isReviewMode && (result?.passed || initialPassed);
  const reviewHeader = result 
    ? `${result.score}/${questions.length} Correct`
    : "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="fixed inset-0 z-100 w-screen h-screen max-w-none sm:max-w-none p-0 m-0 border-none rounded-none bg-background shadow-none overflow-hidden block translate-x-0 translate-y-0">
        <DialogHeader className="p-6 pb-0 sr-only">
          <DialogTitle>Lesson Assessment</DialogTitle>
          <DialogDescription>
            Answer 20 questions to complete the lesson. 15 required to pass.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col h-full w-full">
          {/* Progress Bar */}
          <div className="h-1 w-full bg-muted overflow-hidden">
            <motion.div 
              className={cn("h-full", isReviewMode && result?.passed ? "bg-green-500" : isReviewMode ? "bg-red-500" : "bg-primary")}
              initial={{ width: 0 }}
              animate={{ width: isReviewMode ? "100%" : `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden mt-10 md:mt-2">
            {/* Header Info */}
            <div className="flex items-center justify-between py-6 px-4 mb-4 w-full">
              <div className="flex items-center gap-1 text-primary font-bold">
                <div className="p-2 rounded-lg">
                  {isReviewMode ? <Eye className="size-5" /> : <HelpCircle className="size-5" />}
                </div>
                <span className="text-sm uppercase tracking-wider">
                  {isReviewMode ? `Review: ${currentIndex + 1}/${questions.length}` : `Question ${currentIndex + 1} of ${questions.length}`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isReviewMode && result && (
                  <div className={cn(
                    "flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full",
                    result.passed ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                  )}>
                    {result.passed ? <Trophy className="size-3.5" /> : <XCircle className="size-3.5" />}
                    {reviewHeader}
                  </div>
                )}
                {isReviewMode && initialPassed && !result && (
                  <div className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-green-500/10 text-green-500">
                    <Trophy className="size-3.5" />
                    Already Passed
                  </div>
                )}
                {!isReviewMode && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <div className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full uppercase tracking-tighter cursor-pointer">
                        Passing: 15/20
                      </div>
                    </PopoverTrigger>
                    <PopoverContent className="w-84 mr-6 text-xs z-10000">
                      You must score at least 15 correct answers out of 20 to pass this assessment.
                      This ensures you have a strong understanding of the topic.
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </div>

            {/* Question Content Container */}
            <div className="flex-1 flex flex-col md:justify-center px-6 pb-30 pt-0 overflow-hidden">
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div 
                  key={`${screen}-${currentIndex}`}
                  custom={direction}
                  variants={{
                    enter: (direction: number) => ({
                      x: direction > 0 ? 50 : direction < 0 ? -50 : 0,
                      opacity: 0,
                    }),
                    center: {
                      x: 0,
                      opacity: 1,
                    },
                    exit: (direction: number) => ({
                      x: direction < 0 ? 50 : -50,
                      opacity: 0,
                    }),
                  }}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{
                    x: { type: "spring", stiffness: 300, damping: 30 },
                    opacity: { duration: 0.2 }
                  }}
                  className="flex-1 flex flex-col md:max-w-4xl md:mx-auto md:w-full md:flex-initial"
                >
                  <h3 className="text-xl md:text-3xl font-bold mb-8 md:mb-12 leading-relaxed text-foreground md:text-center">
                    {currentQuestion.question}
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 md:flex-initial overflow-y-auto pr-2 custom-scrollbar md:pr-0">
                    {(currentQuestion.shuffledOptions as ShuffledQuestion["shuffledOptions"]).map((option, idx) => {
                      const reviewState = getOptionReviewState(idx);
                      const isSelected = selectedAnswers[currentIndex] === idx;

                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelect(idx)}
                          disabled={isReviewMode}
                          className={cn(
                            "w-full text-left p-4 md:p-6 rounded-xl border-2 transition-all duration-200 group flex items-start gap-4 disabled:cursor-default",
                            // Quiz mode defaults
                            !isReviewMode && reviewState === "neutral" && (isSelected
                              ? "border-primary bg-primary/5 shadow-md shadow-primary/5"
                              : "border-white/10 hover:border-primary/50 hover:bg-muted/30"),
                            // Review or Show Answers in Quiz
                            reviewState === "correct" && "border-green-500 bg-green-500/10",
                            reviewState === "wrong" && "border-red-500 bg-red-500/10",
                            isReviewMode && reviewState === "neutral" && "border-white/10 opacity-50",
                          )}
                        >
                          <div className={cn(
                            "size-6 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                            !isReviewMode && reviewState === "neutral" && (isSelected
                              ? "border-primary bg-primary text-white"
                              : "border-muted-foreground group-hover:border-primary"),
                            reviewState === "correct" && "border-green-500 bg-green-500 text-white",
                            reviewState === "wrong" && "border-red-500 bg-red-500 text-white",
                            isReviewMode && reviewState === "neutral" && "border-muted-foreground",
                          )}>
                            {!isReviewMode && reviewState === "neutral" && isSelected && <CheckCircle2 className="size-4" />}
                            {reviewState === "correct" && <CheckCircle2 className="size-4" />}
                            {reviewState === "wrong" && <XCircle className="size-4" />}
                          </div>
                          <span className={cn(
                            "text-sm md:text-base font-medium leading-normal",
                            !isReviewMode && reviewState === "neutral" && (isSelected ? "text-primary" : "text-foreground"),
                            reviewState === "correct" && "text-green-500",
                            reviewState === "wrong" && "text-red-500",
                            isReviewMode && reviewState === "neutral" && "text-muted-foreground",
                          )}>
                            {option.text}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Show explanation if toggled in Practice, or always in Review */}
                  {((isReviewMode) || (showAnswers && screen === "quiz" && initialPassed)) && (
                    <div className="mt-4 md:mt-6 p-4 rounded-xl bg-muted/50 border border-border text-sm text-muted-foreground md:max-w-4xl md:mx-auto md:w-full">
                      <span className="font-bold text-foreground">Explanation: </span>
                      {currentQuestion.explanation || "No detailed explanation available for this question."}
                    </div>
                  )}

                  {/* DESKTOP ONLY: Navigation buttons below options */}
                  <div className="hidden md:grid grid-cols-3 items-center mt-12">
                    {/* Left: Back */}
                    <div className="flex justify-start">
                      <Button 
                        onClick={handleBack}
                        disabled={currentIndex === 0}
                        className="h-12 px-6 rounded-full flex items-center gap-1 bg-transparent hover:bg-transparent focus-visible:ring-0 shadow-none cursor-pointer"
                      > 
                        <span className="w-9 h-9 flex items-center justify-center rounded-full transition-colors">
                          <ChevronLeft className="size-8" />
                        </span>
                        <span className="text-sm">Back</span>
                      </Button>
                    </div>

                    {/* Center: Show/Hide toggle — always in this slot */}
                    <div className="flex justify-center">
                      {canShowAnswerToggle && (
                        <button
                          onClick={() => setShowAnswers(v => !v)}
                          className={cn(
                            "flex items-center gap-2 px-5 py-2 rounded-full font-bold text-xs transition-all duration-200 border-2",
                            showAnswers
                              ? "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                              : "bg-muted/60 text-muted-foreground border-border hover:bg-muted"
                          )}
                        >
                          <Eye className="size-3.5" />
                          {showAnswers ? "Hide Answers" : "Show Answers"}
                        </button>
                      )}
                    </div>

                    {/* Right: Next / Finish / Passed badge */}
                    <div className="flex justify-end">
                      {isLastQuestion ? (
                        isReviewMode ? (
                          // Review mode last question: show action buttons
                          <div className="flex items-center gap-3">
                            {result && !result.passed && (
                              <Button
                                onClick={resetQuiz}
                                variant="outline"
                                className="gap-2 rounded-full px-8 h-12 font-bold uppercase tracking-tight text-xs"
                              >
                                <RefreshCw className="size-4" />
                                Try Again
                              </Button>
                            )}
                            <Button
                              onClick={onClose}
                              className={cn(
                                "rounded-full px-10 h-12 font-bold uppercase tracking-tight text-xs",
                                result?.passed ? "bg-green-500 hover:bg-green-600 shadow-xl shadow-green-500/20" : ""
                              )}
                            >
                              {result?.passed ? "Close & Continue" : "Close"}
                            </Button>
                          </div>
                        ) : (
                          <Button 
                            onClick={handleSubmit}
                            disabled={selectedAnswers.includes(-1) || isSubmitting}
                            className="gap-2 rounded-full px-10 h-12 font-bold uppercase tracking-tight text-xs"
                          >
                            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                            {initialPassed ? "Finish Practice" : "Finish Assessment"}
                          </Button>
                        )
                      ) : (
                        <Button
                          onClick={handleNext}
                          disabled={!isReviewMode && selectedAnswers[currentIndex] === -1}
                          className="h-12 px-6 rounded-full flex items-center gap-1 bg-transparent hover:bg-transparent focus-visible:ring-0 shadow-none cursor-pointer"
                        >
                          <span className="text-sm">Next</span>
                          <span className="w-9 h-9 flex items-center justify-center rounded-full transition-colors">
                            <ChevronRight className="size-8" />
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* FOOTER ACTIONS - Mobile only */}
          <div className="p-4 border-t border-border bg-muted/20 flex items-center justify-between md:hidden gap-2">
            <Button 
              variant="ghost" 
              onClick={handleBack}
              disabled={currentIndex === 0}
              className="gap-1 rounded-full font-bold uppercase tracking-tight text-xs px-3"
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>

            {/* Show/Hide toggle in mobile footer - always visible when passed */}
            {canShowAnswerToggle && (
              <button
                onClick={() => setShowAnswers(v => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-full font-bold text-[11px] transition-all duration-200 border-2 shrink-0",
                  showAnswers
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/60 text-muted-foreground border-border"
                )}
              >
                <Eye className="size-3.5" />
                {showAnswers ? "Hide" : "Show Answers"}
              </button>
            )}

            {isLastQuestion ? (
              isReviewMode ? (
                <div className="flex items-center gap-2">
                  {result && !result.passed && (
                    <Button
                      onClick={resetQuiz}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 rounded-full px-4 font-bold uppercase tracking-tight text-xs"
                    >
                      <RefreshCw className="size-3.5" />
                      Retry
                    </Button>
                  )}
                  <Button
                    onClick={onClose}
                    size="sm"
                    className={cn(
                      "rounded-full px-6 font-bold uppercase tracking-tight text-xs",
                      result?.passed ? "bg-green-500 hover:bg-green-600" : ""
                    )}
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <Button 
                  onClick={handleSubmit}
                  disabled={selectedAnswers.includes(-1) || isSubmitting}
                  className="gap-2 rounded-full px-8 font-bold uppercase tracking-tight text-xs shadow-lg shadow-primary/20"
                >
                  {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {initialPassed ? "Finish" : "Finish"}
                </Button>
              )
            ) : (
              <Button 
                onClick={handleNext}
                disabled={!isReviewMode && selectedAnswers[currentIndex] === -1}
                className="gap-2 rounded-full px-8 font-bold uppercase tracking-tight text-xs"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
        
      </DialogContent>
    </Dialog>
  );
}
