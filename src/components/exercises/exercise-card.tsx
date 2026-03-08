import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils/timestamps";
import type { Exercise } from "@/lib/db/schema";

interface ExerciseCardProps {
  exercise: Exercise;
  onClick?: () => void;
}

export function ExerciseCard({ exercise, onClick }: ExerciseCardProps) {
  const muscleGroups: string[] = exercise.muscleGroups
    ? JSON.parse(exercise.muscleGroups)
    : [];

  return (
    <Card
      className="cursor-pointer overflow-hidden border-border bg-card transition-all hover:border-[#00CCFF]/30 hover:shadow-md"
      onClick={onClick}
    >
      {exercise.thumbnailFilePath && (
        <div className="relative aspect-video w-full bg-secondary">
          <Image
            src={exercise.thumbnailFilePath}
            alt={exercise.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
          {exercise.clipDurationSeconds && (
            <span className="absolute bottom-2 right-2 rounded bg-[#111F32]/80 px-1.5 py-0.5 text-xs text-white">
              {formatDuration(exercise.clipDurationSeconds)}
            </span>
          )}
        </div>
      )}
      <CardContent className="p-3">
        <h3 className="font-semibold leading-tight text-foreground">{exercise.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {exercise.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {exercise.category && (
            <Badge variant="secondary" className="bg-[#00CCFF]/10 text-xs text-[#00CCFF]">
              {exercise.category}
            </Badge>
          )}
          {exercise.difficulty && (
            <Badge variant="outline" className="border-border text-xs text-secondary-foreground">
              {exercise.difficulty}
            </Badge>
          )}
          {exercise.repCount != null && (
            <Badge variant="outline" className="border-border text-xs text-secondary-foreground">
              {exercise.repCount} reps
            </Badge>
          )}
          {exercise.setCount != null && (
            <Badge variant="outline" className="border-border text-xs text-secondary-foreground">
              {exercise.setCount} sets
            </Badge>
          )}
        </div>
        {muscleGroups.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {muscleGroups.slice(0, 3).map((mg) => (
              <span
                key={mg}
                className="rounded-full bg-[#07B492]/10 px-2 py-0.5 text-[10px] text-[#07B492]"
              >
                {mg}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
