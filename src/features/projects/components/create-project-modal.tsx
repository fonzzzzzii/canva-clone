"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Grid, Sparkles, ArrowRight, ArrowLeft, X, GripVertical, Plus, BookOpen, Minimize2, LayoutGrid } from "lucide-react";
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
import { generateCanvasJsonWithImages, generateCanvasJsonWithAutoLayout } from "@/features/editor/utils/generate-canvas-json";
import { generateAutoLayout, calculateMinimumPages, STYLE_CONFIG, AlbumStyle, ImageWithOrientation } from "@/features/editor/utils/auto-layout";
import { StylePreview } from "@/features/editor/components/style-preview";
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

// Pricing configuration (placeholder - can be updated later)
const PRICING = {
  baseCost: 20,
  perPageCost: 2,
};

type SortBy = "date-asc" | "date-desc" | "title" | "custom";

interface ImageMetadata {
  url: string;
  uploadedAt: string;
  originalName: string;
  size: number;
  id: string; // Unique ID for drag-and-drop
  // Added for auto-layout orientation analysis
  width?: number;
  height?: number;
  orientation?: "portrait" | "landscape" | "square";
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
  const [layoutType, setLayoutType] = useState<LayoutType>("auto"); // Default to auto layout
  const [pageCount, setPageCount] = useState(2); // Start with 2 (even number)
  const [pageCountInput, setPageCountInput] = useState("2"); // String value for controlled input
  const [sortBy, setSortBy] = useState<SortBy>("date-asc");

  // Auto-layout specific state
  const [albumStyle, setAlbumStyle] = useState<AlbumStyle>("classic");
  const [minimumPages, setMinimumPages] = useState(2);
  const [isAnalyzingImages, setIsAnalyzingImages] = useState(false);

  // Calculate estimated price
  const estimatedPrice = useMemo(
    () => PRICING.baseCost + pageCount * PRICING.perPageCost,
    [pageCount]
  );

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

  // Calculate suggested page count based on images (always even) - for manual layout
  const getSuggestedPageCount = (imageCount: number): number => {
    if (imageCount === 0) return 2;
    // Suggest 4 images per page as baseline
    const calculatedPages = Math.ceil(imageCount / 4);
    // Round up to nearest even number
    return calculatedPages % 2 === 0 ? calculatedPages : calculatedPages + 1;
  };

  // Analyze image dimensions to determine orientation
  const analyzeImageDimensions = async (
    images: ImageMetadata[]
  ): Promise<ImageMetadata[]> => {
    return Promise.all(
      images.map(async (img) => {
        // Skip if already analyzed
        if (img.width && img.height && img.orientation) return img;

        return new Promise<ImageMetadata>((resolve) => {
          const image = new Image();
          image.onload = () => {
            const width = image.naturalWidth;
            const height = image.naturalHeight;
            const aspectRatio = width / height;

            let orientation: "portrait" | "landscape" | "square";
            if (aspectRatio > 1.15) orientation = "landscape";
            else if (aspectRatio < 0.85) orientation = "portrait";
            else orientation = "square";

            resolve({ ...img, width, height, orientation });
          };
          image.onerror = () => {
            // Default to square if we can't load the image
            resolve({ ...img, width: 100, height: 100, orientation: "square" });
          };
          image.src = img.url;
        });
      })
    );
  };

  // Calculate minimum pages based on style and image count (for auto layout)
  useEffect(() => {
    if (layoutType === "auto") {
      const min = calculateMinimumPages(uploadedImages.length, albumStyle);
      setMinimumPages(min);
      // Always update page count to new minimum when style changes
      setPageCount(min);
      setPageCountInput(min.toString());
    }
  }, [albumStyle, uploadedImages.length, layoutType]);

  // Analyze images when entering Step 3 (for auto layout orientation matching)
  useEffect(() => {
    if (step === 3 && uploadedImages.length > 0 && layoutType === "auto") {
      // Check if any images need analysis
      const needsAnalysis = uploadedImages.some(
        (img) => !img.width || !img.height || !img.orientation
      );

      if (needsAnalysis) {
        setIsAnalyzingImages(true);
        analyzeImageDimensions(uploadedImages).then((analyzed) => {
          setUploadedImages(analyzed);
          setIsAnalyzingImages(false);
        });
      }
    }
  }, [step, layoutType]);

  // Update suggested page count when images change (for manual layout)
  useEffect(() => {
    if (uploadedImages.length > 0 && layoutType === "manual") {
      const suggested = getSuggestedPageCount(uploadedImages.length);
      setPageCount(suggested);
      setPageCountInput(suggested.toString());
    } else if (uploadedImages.length > 0 && layoutType === "auto") {
      const min = calculateMinimumPages(uploadedImages.length, albumStyle);
      setPageCount(min);
      setPageCountInput(min.toString());
    }
  }, [uploadedImages.length]);

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
        // For auto layout, respect minimum pages
        const minPages = layoutType === "auto" ? minimumPages : 2;
        // Clamp between min and 100
        validValue = Math.min(Math.max(minPages, validValue), 100);

        if (validValue !== value) {
          setPageCountInput(validValue.toString());
        }
        setPageCount(validValue);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [pageCountInput, layoutType, minimumPages]);

  const handleClose = () => {
    setStep(1);
    setName("Untitled project");
    setUploadedImages([]);
    setLayoutType("auto"); // Reset to default
    setPageCount(2);
    setPageCountInput("2");
    setAlbumStyle("classic");
    setMinimumPages(2);
    setIsAnalyzingImages(false);
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

  const handleCreateProject = async () => {
    if (!layoutType) return;

    const validPageCount = Math.min(Math.max(2, pageCount), 100);

    let canvasJson = "";

    if (uploadedImages.length > 0) {
      if (layoutType === "auto") {
        // Ensure images have dimension data for auto layout
        let analyzedImages = uploadedImages;
        const needsAnalysis = uploadedImages.some(
          (img) => !img.width || !img.height || !img.orientation
        );
        if (needsAnalysis) {
          setIsAnalyzingImages(true);
          analyzedImages = await analyzeImageDimensions(uploadedImages);
          setIsAnalyzingImages(false);
        }

        // Convert to ImageWithOrientation format for auto-layout algorithm
        const imagesWithOrientation: ImageWithOrientation[] = analyzedImages
          .filter((img) => img.width && img.height && img.orientation)
          .map((img) => ({
            url: img.url,
            width: img.width!,
            height: img.height!,
            orientation: img.orientation!,
          }));

        // Generate auto layout
        const layoutResult = generateAutoLayout(
          imagesWithOrientation,
          validPageCount,
          albumStyle
        );

        // Generate canvas JSON with template-based layout
        canvasJson = generateCanvasJsonWithAutoLayout(layoutResult, 2970, 2100);
      } else {
        // Manual layout - use existing grid-based generation
        canvasJson = generateCanvasJsonWithImages(
          uploadedImages,
          2970,
          2100,
          validPageCount
        );
      }
    }

    mutation.mutate(
      {
        name,
        json: canvasJson,
        width: 2970,
        height: 2100,
        pageCount: validPageCount,
        uploadedImages: JSON.stringify(uploadedImages),
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
          <div className="space-y-6">
            {/* Layout Type Selection */}
            <div className="grid grid-cols-2 gap-4">
              {/* Auto Layout - Primary (default) */}
              <Card
                className={cn(
                  "cursor-pointer transition-all hover:border-purple-400",
                  layoutType === "auto" && "border-purple-500 border-2"
                )}
                onClick={() => setLayoutType("auto")}
              >
                <CardContent className="flex flex-col items-center justify-center p-6 space-y-2">
                  <Sparkles className="h-12 w-12 text-purple-500" />
                  <h3 className="font-semibold">Auto Layout</h3>
                  <p className="text-sm text-muted-foreground text-center">
                    Smart arrangement based on your photos
                  </p>
                </CardContent>
              </Card>

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
                    Full control over page layouts
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Auto Layout Options */}
            {layoutType === "auto" && (
              <div className="space-y-4 p-4 bg-muted rounded-lg">
                {/* Album Style Selector */}
                <div className="space-y-2">
                  <Label>Album Style</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        style: "classic" as const,
                        title: "Classic",
                        desc: "2-3 photos/page",
                        icon: BookOpen,
                      },
                      {
                        style: "modern" as const,
                        title: "Modern",
                        desc: "1-2 photos/page",
                        icon: Minimize2,
                      },
                      {
                        style: "collage" as const,
                        title: "Collage",
                        desc: "3-6 photos/page",
                        icon: LayoutGrid,
                      },
                    ].map(({ style, title, desc, icon: Icon }) => (
                      <button
                        key={style}
                        type="button"
                        className={cn(
                          "p-3 rounded-lg border-2 transition-all text-left",
                          albumStyle === style
                            ? "border-purple-500 bg-purple-50"
                            : "border-gray-200 bg-white hover:border-purple-300"
                        )}
                        onClick={() => setAlbumStyle(style)}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <StylePreview style={style} className="flex-shrink-0" />
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-medium text-sm">{title}</span>
                            <span className="text-xs text-muted-foreground">
                              {desc}
                            </span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Page Count with Price */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="autoPageCount">Number of Pages</Label>
                    <span className="text-sm font-medium text-green-600">
                      Est. ${estimatedPrice.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="autoPageCount"
                      type="number"
                      min={minimumPages}
                      step={2}
                      value={pageCountInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === "" || /^\d+$/.test(value)) {
                          setPageCountInput(value);
                        }
                      }}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">
                      (min {minimumPages} for {uploadedImages.length} photos)
                    </span>
                  </div>
                </div>

                {/* Analyzing indicator */}
                {isAnalyzingImages && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing photos...
                  </div>
                )}
              </div>
            )}

            {/* Manual Layout Options */}
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
                disabled={!layoutType || mutation.isPending || isAnalyzingImages}
              >
                {mutation.isPending || isAnalyzingImages ? (
                  <>
                    {isAnalyzingImages ? "Analyzing..." : "Creating..."}
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
