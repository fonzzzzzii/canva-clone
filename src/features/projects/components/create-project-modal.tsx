"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Grid, Sparkles, ArrowRight, ArrowLeft, X, GripVertical, Plus } from "lucide-react";
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
import { UploadDropzone, UploadButton } from "@/lib/uploadthing";

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

type SortBy = "date-asc" | "date-desc" | "title" | "custom";

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
      className="relative group"
    >
      {/* Remove Button - positioned outside to avoid clipping */}
      <button
        onClick={() => onRemove(image.id)}
        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-md"
        type="button"
      >
        <X className="size-3" />
      </button>

      {/* Card content */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-10 bg-white/90 rounded p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="size-4 text-gray-600" />
        </div>

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
  const [pageCount, setPageCount] = useState(2); // Start with 2 (even number)
  const [pageCountInput, setPageCountInput] = useState("2"); // String value for controlled input
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
      // Switch to custom sort after manual reordering
      setSortBy("custom");
    }
  };

  // Calculate suggested page count based on images (always even)
  const getSuggestedPageCount = (imageCount: number): number => {
    if (imageCount === 0) return 2;
    // Suggest 4 images per page as baseline
    const calculatedPages = Math.ceil(imageCount / 4);
    // Round up to nearest even number
    return calculatedPages % 2 === 0 ? calculatedPages : calculatedPages + 1;
  };

  // Update suggested page count when images change
  useEffect(() => {
    if (uploadedImages.length > 0) {
      const suggested = getSuggestedPageCount(uploadedImages.length);
      setPageCount(suggested);
      setPageCountInput(suggested.toString());
    }
  }, [uploadedImages]);

  // Debounced validation for page count input
  useEffect(() => {
    const timer = setTimeout(() => {
      const value = parseInt(pageCountInput);
      if (!isNaN(value) && value > 0) {
        let validValue = value;
        // Ensure it's even
        if (validValue % 2 !== 0) {
          validValue = validValue + 1;
        }
        // Clamp between 2 and 100
        validValue = Math.min(Math.max(2, validValue), 100);

        if (validValue !== value) {
          setPageCountInput(validValue.toString());
        }
        setPageCount(validValue);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [pageCountInput]);

  const handleClose = () => {
    setStep(1);
    setName("Untitled project");
    setUploadedImages([]);
    setLayoutType(null);
    setPageCount(2);
    setPageCountInput("2");
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
    // Create empty project with 2 pages (even number)
    mutation.mutate(
      {
        name,
        json: "",
        width: 2970,
        height: 2100,
        pageCount: 2,
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

  // Apply sorting when sort option changes
  useEffect(() => {
    if (sortBy === "custom") return; // Don't sort if custom order

    setUploadedImages((items) => {
      const sorted = [...items];
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
    });
  }, [sortBy]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <div className="border-b shrink-0">
          <DialogHeader className="px-6 pt-6 pb-4">
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

          {/* Step 2: Add Images and Sort controls - Fixed with header */}
          {step === 2 && uploadedImages.length > 0 && (
            <div className="px-6 pb-4 flex items-center justify-between">
              {/* Add Images Button - Left */}
              <UploadButton
                endpoint="imageUploader"
                config={{
                  mode: "auto",
                }}
                appearance={{
                  button: "ut-ready:bg-blue-500 ut-ready:hover:bg-blue-600 ut-uploading:bg-blue-400 whitespace-nowrap",
                  allowedContent: "hidden",
                }}
                content={{
                  button({ ready }) {
                    if (ready) return (
                      <div className="flex items-center gap-2">
                        <Plus className="size-4" />
                        <span>Add Images</span>
                      </div>
                    );
                    return "Getting ready...";
                  },
                }}
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

              {/* Sort dropdown - Right */}
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
          )}
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

        {/* Step 1: Project Name */}
        {step === 1 && (
          <div className="space-y-4">
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    e.preventDefault();
                    setStep(2);
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Step 2: Upload Images */}
        {step === 2 && (
          <div className="space-y-4">
            {uploadedImages.length === 0 ? (
              <UploadDropzone
                endpoint="imageUploader"
                config={{
                  mode: "auto",
                }}
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
            ) : (
              <>
                {/* Sortable Grid */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={uploadedImages.map((img) => img.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-3 gap-4">
                      {uploadedImages.map((image) => (
                        <SortableImageItem
                          key={image.id}
                          image={image}
                          onRemove={removeImage}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
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
                <Label htmlFor="pageCount">Number of Pages (must be even)</Label>
                <Input
                  id="pageCount"
                  type="text"
                  inputMode="numeric"
                  value={pageCountInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Allow empty string or numbers only
                    if (value === "" || /^\d+$/.test(value)) {
                      setPageCountInput(value);
                    }
                  }}
                  placeholder={`Suggested: ${getSuggestedPageCount(uploadedImages.length)}`}
                />
                <p className="text-sm text-muted-foreground">
                  Suggested: {getSuggestedPageCount(uploadedImages.length)} pages for{" "}
                  {uploadedImages.length} images. Page count must be even for book spread layout.
                </p>
              </div>
            )}
          </div>
        )}
        </div>
        {/* End of scrollable content area */}

        {/* Fixed Footer */}
        <div className="border-t px-6 py-4 shrink-0">
          {/* Step 1 Footer */}
          {step === 1 && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => name.trim() && setStep(2)}
                disabled={!name.trim()}
              >
                Next
                <ArrowRight className="size-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 2 Footer */}
          {step === 2 && (
            <div className="flex items-center justify-between w-full">
              {/* Image count on the left */}
              <div className="text-sm text-muted-foreground">
                {uploadedImages.length > 0 && (
                  <span>{uploadedImages.length} image{uploadedImages.length !== 1 ? 's' : ''} selected</span>
                )}
              </div>

              {/* Buttons on the right */}
              <div className="flex gap-2">
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
              </div>
            </div>
          )}

          {/* Step 3 Footer */}
          {step === 3 && (
            <div className="flex justify-end gap-2">
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
