"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useCreateProjectModal } from "@/features/projects/store/use-create-project-modal";
import { useCreateProject } from "@/features/projects/api/use-create-project";

import {
  Dialog,
  DialogTitle,
  DialogFooter,
  DialogHeader,
  DialogContent,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const CreateProjectModal = () => {
  const router = useRouter();
  const { isOpen, onClose } = useCreateProjectModal();
  const mutation = useCreateProject();

  const [name, setName] = useState("Untitled project");
  const [pageCount, setPageCount] = useState(1);

  const handleClose = () => {
    setName("Untitled project");
    setPageCount(1);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const validPageCount = Math.min(Math.max(1, pageCount), 100);

    mutation.mutate(
      {
        name,
        json: "",
        width: 2970,
        height: 2100,
        pageCount: validPageCount,
      },
      {
        onSuccess: ({ data }) => {
          handleClose();
          router.push(`/editor/${data.id}`);
        },
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Enter project details to get started
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              placeholder="Untitled project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mutation.isPending}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pageCount">Number of Pages (1-100)</Label>
            <Input
              id="pageCount"
              type="number"
              min={1}
              max={100}
              value={pageCount}
              onChange={(e) => setPageCount(parseInt(e.target.value) || 1)}
              disabled={mutation.isPending}
              required
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  Creating...
                  <Loader2 className="size-4 ml-2 animate-spin" />
                </>
              ) : (
                "Create Project"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
