"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDuration } from "@/lib/utils/timestamps";
import type { Exercise } from "@/lib/db/schema";

interface ExerciseDetailProps {
  exercise: Exercise;
  open: boolean;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onUpdate?: (exercise: Exercise) => void;
}

export function ExerciseDetail({
  exercise,
  open,
  onClose,
  onDelete,
  onUpdate,
}: ExerciseDetailProps) {
  const muscleGroups: string[] = exercise.muscleGroups
    ? JSON.parse(exercise.muscleGroups)
    : [];
  const equipment: string[] = exercise.equipment
    ? JSON.parse(exercise.equipment)
    : [];
  const coachingCues: string[] = exercise.coachingCues
    ? JSON.parse(exercise.coachingCues)
    : [];
  const tags: string[] = exercise.tags ? JSON.parse(exercise.tags) : [];

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState({
    name: exercise.name ?? "",
    description: exercise.description ?? "",
    formNotes: exercise.formNotes ?? "",
  });

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: Exercise = await res.json();
      onUpdate?.(updated);
      setEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/exercises/${exercise.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      onDelete?.(exercise.id);
    } catch (err) {
      console.error(err);
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  function handleCancelEdit() {
    setFormData({
      name: exercise.name ?? "",
      description: exercise.description ?? "",
      formNotes: exercise.formNotes ?? "",
    });
    setEditing(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {exercise.clipFilePath && (
          <video
            src={exercise.clipFilePath}
            controls
            className="w-full rounded-lg"
            poster={exercise.thumbnailFilePath || undefined}
          />
        )}

        <div className="space-y-4">
          {/* Header: name + edit button */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              {editing ? (
                <Input
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="text-xl font-bold"
                  placeholder="Exercise name"
                />
              ) : (
                <h2 className="text-xl font-bold">{exercise.name}</h2>
              )}
              <p className="text-sm text-muted-foreground">
                {exercise.startTimestamp} - {exercise.endTimestamp}
                {exercise.clipDurationSeconds &&
                  ` (${formatDuration(exercise.clipDurationSeconds)})`}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {editing ? (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>
              )}
            </div>
          </div>

          {/* Description */}
          {editing ? (
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Exercise description"
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ) : (
            exercise.description && <p>{exercise.description}</p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {exercise.category && <Badge>{exercise.category}</Badge>}
            {exercise.difficulty && (
              <Badge variant="secondary">{exercise.difficulty}</Badge>
            )}
            {exercise.repCount != null && (
              <Badge variant="outline">{exercise.repCount} reps</Badge>
            )}
            {exercise.setCount != null && (
              <Badge variant="outline">{exercise.setCount} sets</Badge>
            )}
          </div>

          {muscleGroups.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Muscle Groups</h3>
              <div className="flex flex-wrap gap-1">
                {muscleGroups.map((mg) => (
                  <Badge key={mg} variant="outline" className="text-xs">
                    {mg}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {equipment.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Equipment</h3>
              <p className="text-sm">{equipment.join(", ")}</p>
            </div>
          )}

          <Separator />

          {/* Form Notes */}
          {editing ? (
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Form Notes
              </label>
              <textarea
                value={formData.formNotes}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    formNotes: e.target.value,
                  }))
                }
                rows={3}
                placeholder="Form notes"
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          ) : (
            exercise.formNotes && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Form Notes</h3>
                <p className="text-sm">{exercise.formNotes}</p>
              </div>
            )
          )}

          {coachingCues.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Coaching Cues</h3>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {coachingCues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            </div>
          )}

          {tags.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Tags</h3>
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Delete section */}
          <div className="flex items-center justify-end gap-2">
            {confirmingDelete ? (
              <>
                <span className="text-sm text-destructive">
                  Are you sure? This cannot be undone.
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
              >
                Delete exercise
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
