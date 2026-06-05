"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// A live Inngest job may still be writing to these videos — deletion is refused
// server-side too (DELETE route returns 409). Hide the button to match.
const IN_FLIGHT = new Set(["transcribing", "analyzing", "clipping"]);

interface DeleteVideoButtonProps {
  videoId: string;
  status: string;
  /** When set, render a labelled button (detail page). Otherwise icon-only (cards). */
  label?: string;
  /** Where to go after delete. Omit to stay and refresh (list); set to "/videos" on the detail page (the row is gone → would 404 on refresh). */
  redirectTo?: string;
  className?: string;
}

export function DeleteVideoButton({
  videoId,
  status,
  label,
  redirectTo,
  className,
}: DeleteVideoButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Don't offer delete while a job could still be writing to the video.
  if (IN_FLIGHT.has(status)) return null;

  // Video cards wrap the whole card in a <Link>; stop the click from navigating.
  function openDialog(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      toast.success("Video deleted");
      setOpen(false);
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    } catch {
      // Never surface the raw server/R2 error.
      toast.error("Could not delete, please retry");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      {label ? (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className={className}
          onClick={openDialog}
        >
          <Trash2 />
          {label}
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Delete video"
          onClick={openDialog}
          className={cn(
            "bg-background/70 text-slate-500 shadow-sm backdrop-blur-sm hover:bg-background hover:text-destructive dark:bg-slate-900/70 dark:hover:bg-slate-900",
            className
          )}
        >
          <Trash2 />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete video?</DialogTitle>
            <DialogDescription>
              This will permanently delete the video and all its clips. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="outline" disabled={isDeleting} />}
            >
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="animate-spin" />
                  Deleting…
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
