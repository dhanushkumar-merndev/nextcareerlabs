'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Sparkles, Trophy, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { submitQuiz } from '@/app/student/quiz/actions';

interface Question {
  id: string;
  question: string;
  options: string[];
  order: number;
}

interface LessonQuizProps {
  lessonId: string;
  questions: Question[];
  isOpen: boolean;
  onClose: () => void;
  onPass?: () => void;
}

export function LessonQuiz({
  lessonId,
  questions,
  isOpen,
  onClose,
  onPass,
}: LessonQuizProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    score: number;
    passed: boolean;
    correctAnswers: boolean[];
  } | null>(null);

  const allAnswered = Object.keys(answers).length === questions.length;

  function handleAnswerChange(questionIndex: number, optionIndex: number) {
    setAnswers(prev => ({
      ...prev,
      [questionIndex]: optionIndex,
    }));
  }

  async function handleSubmit() {
    if (!allAnswered) {
      toast.error('Please answer all questions');
      return;
    }

    try {
      setIsSubmitting(true);

      // Convert answers object to array
      const answerArray = questions.map((_, idx) => answers[idx]);

      const response = await submitQuiz(lessonId, answerArray);

      if (!response.success) {
        throw new Error(response.error || 'Failed to submit quiz');
      }

      setResult({
        score: response.score!,
        passed: response.passed!,
        correctAnswers: response.correctAnswers!,
      });

      if (response.passed) {
        // Trigger confetti
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
        toast.success('Congratulations! You passed! 🎉');
        onPass?.();
      } else {
        toast.error('You need 15/20 to pass. Try again!');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to submit quiz');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleRetry() {
    setAnswers({});
    setResult(null);
  }

  return (
<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Lesson Quiz
          </DialogTitle>
          <DialogDescription>
            Answer 15 out of 20 questions correctly to complete this lesson
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-6">
            {/* Progress indicator */}
            <div className="sticky top-0 bg-background pb-4 border-b">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">
                  Answered: {Object.keys(answers).length}/{questions.length}
                </span>
                <span className="font-medium">
                  {Math.round((Object.keys(answers).length / questions.length) * 100)}%
                </span>
              </div>
              <Progress 
                value={(Object.keys(answers).length / questions.length) * 100} 
                className="h-2"
              />
            </div>

            {/* Questions */}
            <div className="space-y-6">
              {questions.map((question, qIndex) => (
                <div key={question.id} className="space-y-3 p-4 border rounded-lg">
                  <div className="flex gap-3">
                    <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm">
                      {qIndex + 1}
                    </span>
                    <p className="font-medium leading-relaxed pt-1">
                      {question.question}
                    </p>
                  </div>

                  <RadioGroup
                    value={answers[qIndex]?.toString()}
                    onValueChange={(val) => handleAnswerChange(qIndex, parseInt(val))}
                    className="pl-11 space-y-2"
                  >
                    {question.options.map((option, optIndex) => (
                      <div key={optIndex} className="flex items-center space-x-2">
                        <RadioGroupItem 
                          value={optIndex.toString()} 
                          id={`q${qIndex}-opt${optIndex}`}
                        />
                        <Label 
                          htmlFor={`q${qIndex}-opt${optIndex}`}
                          className="cursor-pointer flex-1 py-2"
                        >
                          <span className="font-medium mr-2">
                            {String.fromCharCode(65 + optIndex)})
                          </span>
                          {option}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              ))}
            </div>

            {/* Submit button */}
            <div className="sticky bottom-0 bg-background pt-4 border-t">
              <Button
                onClick={handleSubmit}
                disabled={!allAnswered || isSubmitting}
                className="w-full"
                size="lg"
              >
                {isSubmitting ? (
                  <>
                    <Sparkles className="h-5 w-5 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    Submit Quiz
                  </>
                )}
              </Button>
              {!allAnswered && (
                <p className="text-sm text-muted-foreground text-center mt-2">
                  Please answer all {questions.length} questions
                </p>
              )}
            </div>
          </div>
        ) : (
          /* Results */
          <div className="space-y-6">
            {/* Score header */}
            <div className={`text-center p-6 rounded-lg ${
              result.passed 
                ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
                : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
            } border-2`}>
              {result.passed ? (
                <>
                  <Trophy className="h-16 w-16 mx-auto mb-4 text-green-600" />
                  <h3 className="text-2xl font-bold text-green-700 dark:text-green-400 mb-2">
                    Lesson Complete! 🎉
                  </h3>
                  <p className="text-lg font-semibold">
                    Score: {result.score}/20 ({Math.round((result.score / 20) * 100)}%)
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="h-16 w-16 mx-auto mb-4 text-red-600" />
                  <h3 className="text-2xl font-bold text-red-700 dark:text-red-400 mb-2">
                    Not Quite There
                  </h3>
                  <p className="text-lg font-semibold mb-2">
                    Score: {result.score}/20 ({Math.round((result.score / 20) * 100)}%)
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You need 15/20 (75%) to pass
                  </p>
                </>
              )}
            </div>

            {/* Answer review */}
            <div className="space-y-4">
              <h4 className="font-semibold">Review Your Answers:</h4>
              <div className="space-y-3">
                {questions.map((question, idx) => {
                  const isCorrect = result.correctAnswers[idx];
                  const userAnswer = answers[idx];
                  
                  return (
                    <div 
                      key={question.id} 
                      className={`p-3 rounded-lg border-2 ${
                        isCorrect 
                          ? 'bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-800' 
                          : 'bg-red-50/50 dark:bg-red-950/10 border-red-200 dark:border-red-800'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {isCorrect ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 text-sm">
                          <p className="font-medium mb-1">Q{idx + 1}: {question.question}</p>
                          <p className={isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}>
                            Your answer: {String.fromCharCode(65 + userAnswer)} - {question.options[userAnswer]}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {result.passed ? (
                <Button onClick={onClose} className="flex-1" size="lg">
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Continue Learning
                </Button>
              ) : (
                <>
                  <Button onClick={handleRetry} variant="outline" className="flex-1" size="lg">
                    <RotateCcw className="h-5 w-5 mr-2" />
                    Try Again
                  </Button>
                  <Button onClick={onClose} variant="secondary" className="flex-1" size="lg">
                    Review Lesson
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
