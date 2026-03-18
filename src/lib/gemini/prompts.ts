export const OVERVIEW_PROMPT = `The camera is positioned to record a specific client's training session. Focus ONLY on the primary subject — the person who is clearly the focus of the camera framing and appears throughout the video. Ignore any other people visible in the background or periphery, even if they are exercising.

You are an expert personal trainer and exercise scientist analyzing a recorded training session.

Watch this entire video and identify every distinct exercise performed. For each exercise, provide:
1. The start timestamp (MM:SS format) when this exercise begins
2. The end timestamp (MM:SS format) when this exercise ends
3. A brief label for the exercise (e.g., "Barbell Back Squat", "Plank Hold")
4. Whether this is a rest/transition period

Important rules:
- Include warm-up and cool-down exercises
- Separate distinct sets if there is a meaningful rest period (>30 seconds) between them
- Mark transitions and rest periods with isRestPeriod: true
- Use MM:SS format for all timestamps (e.g., "2:30", "15:45")
- Be precise with timestamps — they will be used to cut video clips
- Group consecutive sets of the same exercise only if they flow together without significant breaks

Also provide:
- totalExerciseCount: the count of exercises (excluding rest periods)
- sessionSummary: a 2-3 sentence overview of the training session

Return your analysis as JSON matching this exact structure:
{
  "exercises": [
    {
      "startTimestamp": "0:00",
      "endTimestamp": "3:30",
      "label": "Exercise Name",
      "isRestPeriod": false
    }
  ],
  "totalExerciseCount": 15,
  "sessionSummary": "Description of the session..."
}`;

export function exerciseDetailPrompt(label: string) {
  return `Analyze ONLY the primary subject's performance in this clip. Ignore other people visible in the frame.

You are an expert personal trainer and exercise scientist. This video clip shows a single exercise from a training session. The exercise was identified as: "${label}"

Provide a detailed analysis including:
1. name: The correct, specific exercise name (e.g., "Dumbbell Romanian Deadlift" not just "Deadlift")
2. description: A 2-3 sentence description of how the exercise is being performed
3. muscleGroups: Array of primary muscle groups targeted (use standard anatomy terms)
4. equipment: Array of equipment used (empty array if bodyweight only)
5. difficulty: "beginner", "intermediate", or "advanced"
6. category: One of "strength", "cardio", "flexibility", "warmup", "cooldown", "plyometric"
7. repCount: Number of reps performed (null if not applicable, e.g., for holds or cardio)
8. setCount: Number of sets visible in this clip (null if not clearly distinguishable)
9. formNotes: Brief assessment of the client's exercise form — what looks good and what could improve
10. coachingCues: Array of 2-3 verbal coaching cues a trainer might give

Return as JSON matching this exact structure:
{
  "name": "Exercise Name",
  "description": "Description...",
  "muscleGroups": ["muscle1", "muscle2"],
  "equipment": ["equipment1"],
  "difficulty": "intermediate",
  "category": "strength",
  "repCount": 10,
  "setCount": 3,
  "formNotes": "Form notes...",
  "coachingCues": ["Cue 1", "Cue 2"]
}`;
}
