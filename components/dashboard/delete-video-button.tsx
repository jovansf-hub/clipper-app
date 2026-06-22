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

interface DeleteVideoButtonProps {
  videoId: string;
  /**
   * Accepted for call-site compatibility but no longer gates visibility — the
   * server is the source of truth. In-flight videos younger than the 15-min
   * stuck threshold return 409, which we surface as a toast (see handleDelete).
   */
  status?: string;
  /** When set, render a labelled button (detail page). Otherwise icon-only (cards). */
  label?: string;
  /** Where to go after delete. Omit to stay and refresh (list); set to "/videos" on the detail page (the row is gone → would 404 on refresh). */
  redirectTo?: string;
  /** Called after a successful delete. When provided (grid), the parent removes
   *  the row in place — no router.refresh() round-trip (avoids the empty-state flash). */
  onDeleted?: () => void;
  className?: string;
}

export function DeleteVideoButton({
  videoId,
  label,
  redirectTo,
  onDeleted,
  className,
}: DeleteVideoButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Always rendered. The DELETE route decides eligibility (stuck/15-min rule).
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
      // 409 = a live job could still be writing (younger than the stuck
      // threshold). Don't treat as an error — tell the user to wait.
      if (res.status === 409) {
        toast.error("Cannot delete while processing");
        setOpen(false);
        return;
      }
      if (!res.ok) throw new Error("delete failed");
      toast.success("Video deleted");
      setOpen(false);
      if (onDeleted) {
        // Grid: remove the row in place — no server round-trip, no flash.
        onDeleted();
      } else if (redirectTo) {
        // Detail page: the current row is gone. A client fetch() DELETE does NOT
        // invalidate the App Router Cache, so push() alone can resolve against a
        // stale cached tree and leave us on the deleted detail. push() switches
        // the active route to /videos first; refresh() then revalidates THAT
        // route's data (the list) — never the deleted detail, so it can't 404.
        router.push(redirectTo);
        router.refresh();
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
