# Integration Guide: Quiz & Transcription Features

## Summary
The core implementation is complete for video transcription and MCQ assessment. Here's how to integrate:

## 1. CourseContent.tsx Integration

To integrate the quiz modal, you'll need to add the following to `CourseContent.tsx`:

### Required Imports
```typescript
import { LessonQuiz } from '@/components/student/LessonQuiz';
import { getLessonMCQs } from '@/app/admin/lessons/mcqs/actions';
import { getQuizAttempts } from '@/app/student/quiz/actions';
```

### State Variables
```typescript
const [isQuizOpen, setIsQuizOpen] = useState(false);
const [lessonQuestions, setLessonQuestions] = useState([]);
const [hasPassed Quiz, setHasPassedQuiz] = useState(false);
```

### Fetch Questions
```typescript
useEffect(() => {
  async function fetchMCQs() {
    const result = await getLessonMCQs(lessonId);
    if (result.success && result.questions) {
      setLessonQuestions(result.questions);
    }
    
    // Check if already passed
    const attempts = await getQuizAttempts(lessonId);
    if (attempts.success && attempts.hasPassed) {
      setHasPassedQuiz(true);
    }
  }
  fetchMCQs();
}, [lessonId]);
```

### Replace "Mark Complete" Button
Replace lines 684-693 (desktop) and 637-651 (mobile) with:

```tsx
{hasPassedQuiz || isCompleted ? (
  <Button disabled className="gap-2 rounded-full px-6">
    <CheckCircle className="size-4" />
    Completed
  </Button>
) : (
  <Button 
    onClick={() => lessonQuestions.length === 20 ? setIsQuizOpen(true) : toast.error('No quiz available')}
    disabled={!hasVideo || lessonQuestions.length !== 20}
    className="gap-2 rounded-full px-6"
  >
    <CheckCircle className="size-4" />
    Complete Lesson
  </Button>
)}
```

### Add Quiz Modal (at end of return statement)
```tsx
{lessonQuestions.length === 20 && (
  <LessonQuiz
    lessonId={lessonId}
    questions={lessonQuestions}
    isOpen={isQuizOpen}
    onClose={() => setIsQuizOpen(false)}
    onPass={() => {
      setHasPassedQuiz(true);
      setOptimisticCompleted(true);
      setIsQuizOpen(false);
      queryClient.invalidateQueries({ queryKey: ["lesson_content", lessonId] });
      toast.success("Lesson completed! 🎉");
    }}
  />
)}
```

### Add VTT Captions Track
Inside `<CustomPlayer>` component (around line 475), add transcription support:

```tsx
<CustomPlayer
  // ... existing props
  tracks={data.transcription?.vttUrl ? [{
    kind: 'subtitles',
    src: data.transcription.vttUrl,
    srclang: 'en',
    label: 'English',
    default: true
  }] : undefined}
/>
```

Note: You may need to update the VideoPlayer component to support a `tracks` prop.

## 2. Admin Lesson Edit Page Integration

Add transcription and MCQ management to your admin lesson edit page:

```tsx
import { TranscriptionButton } from '@/components/admin/TranscriptionButton';
import { MCQPromptCopier } from '@/components/admin/MCQPromptCopier';
import { getTranscription } from '@/app/admin/lessons/transcription/actions';

// In your component:
const [transcription, setTranscription] = useState(null);

useEffect(() => {
  async function loadTranscription() {
    const result = await getTranscription(lessonId);
    if (result.success) {
      setTranscription(result.transcription);
    }
  }
  loadTranscription();
}, [lessonId]);

// In your render:
<div className="space-y-4">
  <TranscriptionButton
    lessonId={lessonId}
    lessonTitle={lesson.title}
    videoUrl={videoSignedUrl}
    existingTranscription={transcription}
    onComplete={(vttContent) => {
      // Refresh transcription
      loadTranscription();
    }}
  />
  
  {transcription && (
    <MCQPromptCopier
      lessonId={lessonId}
      lessonTitle={lesson.title}
      vttContent={transcription.vttContent} // You'll need to fetch this
      onSaved={() => {
        toast.success('MCQs saved!');
      }}
    />
  )}
</div>
```

## 3. Database Migration

Run Prisma migration:

```bash
npx prisma migrate dev --name add_transcription_and_mcq
```

## 4. S3 Configuration

Ensure your S3 bucket has CORS configured to allow VTT file access:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }
]
```

##5. Complete Test Flow

### Admin Workflow:
1. Upload video to lesson
2. Click "Generate Transcription" → Wait for completion
3. Click "Generate MCQs" → Copy prompt
4. Paste into ChatGPT/Claude → Get 20 questions
5. Paste JSON back → Save

### Student Workflow:
1. Watch video with captions
2. Click "Complete Lesson"
3. Answer 20 MCQ questions
4. Submit → Must score 15/20 to pass
5. If failed, retry with different questions order
6. On pass → Lesson marks complete with confetti 🎉

## Next Steps

1. Integrate quiz modal into CourseContent.tsx (see above)
2. Add transcription/MCQ tools to admin lesson edit page
3. Run database migration
4. Test with a sample lesson
5. Adjust sprite generation if needed (currently using tier system)
