export const OVERVIEW_PROMPT = `You are an expert personal trainer and exercise scientist analyzing a recorded training session.

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

export function exerciseDetailPrompt(
  startTime: string,
  endTime: string,
  label: string
) {
  return `Analyze the exercise occurring between ${startTime} and ${endTime} in this training video.
The exercise was initially identified as: "${label}"

Provide a detailed analysis including:
1. name: The correct, specific exercise name (e.g., "Dumbbell Romanian Deadlift" not just "Deadlift")
2. description: A 2-3 sentence description of how the exercise is being performed
3. muscleGroups: Array of primary muscle groups targeted (use standard anatomy terms)
4. equipment: Array of equipment used (empty array if bodyweight only)
5. difficulty: "beginner", "intermediate", or "advanced"
6. category: One of "strength", "cardio", "flexibility", "warmup", "cooldown", "plyometric"
7. repCount: Number of reps performed (null if not applicable, e.g., for holds or cardio)
8. setCount: Number of sets visible in this segment (null if not clearly distinguishable)
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

export function allExercisesDetailPrompt(
  exercises: { startTimestamp: string; endTimestamp: string; label: string }[]
) {
  const exerciseList = exercises
    .map(
      (ex, i) =>
        `  ${i}. "${ex.label}" from ${ex.startTimestamp} to ${ex.endTimestamp}`
    )
    .join("\n");

  return `Analyze ALL of the following exercises from this training video. For each exercise, watch the specified time range and provide a detailed analysis.

Exercises to analyze:
${exerciseList}

For EACH exercise, provide:
1. exerciseIndex: The index number from the list above (starting at 0)
2. name: The correct, specific exercise name (e.g., "Dumbbell Romanian Deadlift" not just "Deadlift")
3. description: A 2-3 sentence description of how the exercise is being performed
4. muscleGroups: Array of primary muscle groups targeted (use standard anatomy terms)
5. equipment: Array of equipment used (empty array if bodyweight only)
6. difficulty: "beginner", "intermediate", or "advanced"
7. category: One of "strength", "cardio", "flexibility", "warmup", "cooldown", "plyometric"
8. repCount: Number of reps performed (null if not applicable, e.g., for holds or cardio)
9. setCount: Number of sets visible in this segment (null if not clearly distinguishable)
10. formNotes: Brief assessment of the client's exercise form — what looks good and what could improve
11. coachingCues: Array of 2-3 verbal coaching cues a trainer might give

Return as a JSON array with one object per exercise, in the same order as listed above:
{
  "exercises": [
    {
      "exerciseIndex": 0,
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
    }
  ]
}`;
}
