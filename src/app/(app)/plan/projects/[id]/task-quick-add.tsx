"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/toast";
import { createTaskAction } from "@/domains/plan/actions";

/**
 * Inline task add for a project page.
 *
 * A single input with Enter to submit. The project context is already known, so
 * the only thing asked for is the task itself — adding a step should not cost
 * a trip to another page.
 */
export function TaskQuickAdd({ projectId }: { projectId: string }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");

  function submit() {
    if (!title.trim()) return;

    startTransition(async () => {
      const result = await createTaskAction({
        title: title.trim(),
        status: "INBOX",
        projectId,
      });

      if (!result.ok) {
        toast.error("Gagal menambah tugas", result.error.message);
        return;
      }

      setTitle("");
      inputRef.current?.focus();
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="Tambah langkah ke proyek ini"
        aria-label="Tambah tugas ke proyek"
        className={cn(
          "h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2.5 text-sm",
          "placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
          pending && "opacity-60",
        )}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !title.trim()}
        aria-label="Tambah tugas"
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border-strong text-ink-muted transition-colors duration-fast hover:border-accent hover:bg-accent-soft hover:text-accent disabled:opacity-40 disabled:pointer-events-none"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
