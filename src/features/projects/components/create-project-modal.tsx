"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Grid, Sparkles, ArrowRight, ArrowLeft, X, GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useCreateProjectModal } from "@/features/projects/store/use-create-project-modal";
import { useCreateProject } from "@/features/projects/api/use-create-project";
import { generateCanvasJsonWithImages } from "@/features/editor/utils/generate-canvas-json";
import { UploadDropzone } from "@/lib/uploadthing";

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
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type LayoutType = "manual" | "auto" | null;

type SortBy = "date-asc" | "date-desc" | "title";

interface ImageMetadata {
  url: string;
  uploadedAt: string;
  originalName: string;
  size: number;
  id: string; // Unique ID for drag-and-drop
}

interface SortableImageItemProps {
  image: ImageMetadata;
  onRemove: (id: string) => void;
}

const SortableImageItem = ({ image, onRemove }: SortableImageItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group bg-white rounded-lg border border-gray-200 overflow-hidden"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-10 bg-white/90 rounded p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <GripVertical className="size-4 text-gray-600" />
      </div>

      {/* Remove Button */}
      <button
        onClick={() => onRemove(image.id)}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
        type="button"
      >
        <X className="size-3" />
      </button>

      {/* Image */}
      <img
        src={image.url}
        alt={image.originalName}
        className="w-full h-32 object-cover"
      />

      {/* Filename */}
      <div className="p-2 bg-gray-50">
        <p className="text-xs text-gray-600 truncate" title={image.originalName}>
          {image.originalName}
        </p>
      </div>
    </div>
  );
};

export const CreateProjectModal = () => {
  const router = useRouter();
  const { isOpen, onClose } = useCreateProjectModal();
  const mutation = useCreateProject();

  // Step management
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form state
  const [name, setName] = useState("Untitled project");
  const [uploadedImages, setUploadedImages] = useState<ImageMetadata[]>([]);
  const [layoutType, setLayoutType] = useState<LayoutType>(null);
  const [pageCount, setPageCount] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>("date-asc");

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setUploadedImages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  // Calculate suggested page count based on images
  const getSuggestedPageCount = (imageCount: number): number => {
    if (imageCount === 0) return 1;
    // Suggest 4 images per page as baseline
    return Math.ceil(imageCount / 4);
  };

  // Update suggested page count when images change
  useEffect(() => {
    if (uploadedImages.length > 0) {
      setPageCount(getSuggestedPageCount(uploadedImages.length));
    }
  }, [uploadedImages]);

  const handleClose = () => {
    setStep(1);
    setName("Untitled project");
    setUploadedImages([]);
    setLayoutType(null);
    setPageCount(1);
    onClose();
  };

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setStep(2);
  };

  const handleStep2Next = () => {
    if (uploadedImages.length === 0) return;
    setStep(3);
  };

  const handleStep2Skip = () => {
    // Create empty project
    mutation.mutate(
      {
        name,
        json: "",
        width: 2970,
        height: 2100,
        pageCount: 1,
      },
      {
        onSuccess: ({ data }) => {
          handleClose();
          router.push(`/editor/${data.id}`);
        },
      }
    );
  };

  const handleCreateProject = () => {
    if (!layoutType) return;

    const validPageCount = Math.min(Math.max(1, pageCount), 100);

    const canvasJson =
      uploadedImages.length > 0
        ? generateCanvasJsonWithImages(uploadedImages, 2970, 2100, validPageCount)
        : "";

    mutation.mutate(
      {
        name,
        json: canvasJson,
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

  const removeImage = (id: string) => {
    setUploadedImages((prev) => prev.filter((img) => img.id !== id));
  };

  const getSortedImages = (): ImageMetadata[] => {
    const sorted = [...uploadedImages];
    switch (sortBy) {
      case "date-asc":
        return sorted.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
      case "date-desc":
        return sorted.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
      case "title":
        return sorted.sort((a, b) => a.originalName.localeCompare(b.originalName));
      default:
        return sorted;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 && "Create New Album"}
            {step === 2 && "Upload Photos"}
            {step === 3 && "Choose Layout"}
          </DialogTitle>
          <DialogDescription>
            <span className="text-sm text-muted-foreground">
              Step {step} of 3
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Project Name */}
        {step === 1 && (
          <form onSubmit={handleStep1Next} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Album Name</Label>
              <Input
                id="name"
                placeholder="My Summer Vacation"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={mutation.isPending}
                required
                autoFocus
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit">
                Next
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </DialogFooter>
          </form>
        )}

        {/* Step 2: Upload Images */}
        {step === 2 && (
          <div className="space-y-4">
            <UploadDropzone
              endpoint="imageUploader"
              onClientUploadComplete={(res) => {
                console.log("Upload complete:", res);
                const newImages: ImageMetadata[] = res.map((file) => ({
                  url: file.url,
                  uploadedAt: file.serverData?.uploadedAt || new Date().toISOString(),
                  originalName: file.serverData?.originalName || file.name,
                  size: file.serverData?.size || file.size,
                  id: `${file.url}-${Date.now()}-${Math.random()}`,
                }));
                setUploadedImages((prev) => [...prev, ...newImages]);
              }}
            />

            {uploadedImages.length > 0 && (
              <div className="space-y-4">
                {/* Header with count and sort */}
                <div className="flex items-center justify-between">
                  <Label>{uploadedImages.length} images selected</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Sort by:</span>
                    <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="date-asc">Date ↑</SelectItem>
                        <SelectItem value="date-desc">Date ↓</SelectItem>
                        <SelectItem value="title">Title</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Sortable Grid */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={getSortedImages().map((img) => img.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-3 gap-4">
                      {getSortedImages().map((image) => (
                        <SortableImageItem
                          key={image.id}
                          image={image}
                          onRemove={removeImage}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleStep2Skip}
                disabled={mutation.isPending}
              >
                Skip
              </Button>
              <Button
                type="button"
                onClick={handleStep2Next}
                disabled={uploadedImages.length === 0}
              >
                Next
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Choose Layout */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Manual Layout */}
              <Card
                className={cn(
                  "cursor-pointer transition-all hover:border-blue-400",
                  layoutType === "manual" && "border-blue-500 border-2"
                )}
                onClick={() => setLayoutType("manual")}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
                  <Grid className="h-12 w-12 text-blue-500" />
                  <h3 className="font-semibold">Manual Layout</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Choose the number of pages yourself
                  </p>
                </CardContent>
              </Card>

              {/* Auto Layout */}
              <Card
                className={cn(
                  "cursor-pointer transition-all hover:border-purple-400",
                  layoutType === "auto" && "border-purple-500 border-2"
                )}
                onClick={() => setLayoutType("auto")}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 space-y-2 relative">
                  <Sparkles className="h-12 w-12 text-purple-500" />
                  <h3 className="font-semibold">Auto Layout</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Auto arrange photos
                  </p>
                  <span className="absolute top-2 right-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                    Coming Soon
                  </span>
                </CardContent>
              </Card>
            </div>

            {/* Manual Layout: Page Count Input */}
            {layoutType === "manual" && (
              <div className="space-y-2 p-4 bg-muted rounded-lg">
                <Label htmlFor="pageCount">Number of Pages</Label>
                <Input
                  id="pageCount"
                  type="number"
                  min={1}
                  max={100}
                  value={pageCount}
                  onChange={(e) => setPageCount(parseInt(e.target.value) || 1)}
                  placeholder={`Suggested: ${getSuggestedPageCount(uploadedImages.length)}`}
                />
                <p className="text-sm text-muted-foreground">
                  Suggested: {getSuggestedPageCount(uploadedImages.length)} pages for{" "}
                  {uploadedImages.length} images
                </p>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
              >
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Button>
              <Button
                type="button"
                onClick={handleCreateProject}
                disabled={!layoutType || mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    Creating...
                    <Loader2 className="size-4 ml-2 animate-spin" />
                  </>
                ) : (
                  "Create Album"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
