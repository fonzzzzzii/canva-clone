import { useState, useEffect, useRef } from "react";
import { Upload, X, RefreshCw } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragMoveEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { ActiveTool, Editor } from "@/features/editor/types";
import { isFrameType } from "@/features/editor/objects/image-frame";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { StylePreview } from "@/features/editor/components/style-preview";
import type { AlbumStyle } from "@/features/editor/utils/auto-layout";

import { cn } from "@/lib/utils";
import { UploadButton } from "@/lib/uploadthing";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type SortBy = "date-asc" | "date-desc" | "title" | "custom";

export interface ImageMetadata {
  url: string;
  uploadedAt: string;
  originalName: string;
  size: number;
  id: string;
}

interface SortableImageItemProps {
  image: ImageMetadata;
  onRemove: (id: string) => void;
  isDragging?: boolean;
}

const SortableImageItem = ({ image, onRemove, isDragging }: SortableImageItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="relative w-full group bg-muted rounded-sm overflow-hidden border hover:ring-2 hover:ring-primary/50 transition cursor-grab active:cursor-grabbing"
    >
      <img
        src={image.url}
        alt={image.originalName}
        className="w-full h-auto pointer-events-none"
        loading="lazy"
      />

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onRemove(image.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        <X className="size-3" />
      </button>
    </div>
  );
};

// Overlay shown while dragging
const DragOverlayContent = ({ image }: { image: ImageMetadata }) => {
  return (
    <div className="max-w-[150px] bg-muted rounded-sm overflow-hidden border-2 border-primary shadow-lg opacity-90">
      <img
        src={image.url}
        alt={image.originalName}
        className="w-full h-auto"
      />
    </div>
  );
};

interface ImageSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
  uploadedImages: ImageMetadata[];
  onUploadedImagesChange: (images: ImageMetadata[]) => void;
}

export const ImageSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
  uploadedImages,
  onUploadedImagesChange,
}: ImageSidebarProps) => {
  const [sortBy, setSortBy] = useState<SortBy>("custom");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredFrame, setHoveredFrame] = useState<any>(null);
  const [showRedistributeDialog, setShowRedistributeDialog] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<AlbumStyle | "current">("current");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mousePositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track mouse position globally during drag
  useEffect(() => {
    if (!activeId) return;

    const handleMouseMove = (e: MouseEvent) => {
      mousePositionRef.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [activeId]);

  // Drag and drop sensors for reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // Helper to find frame at position using fabric's native hit testing
  const findFrameAtPosition = (clientX: number, clientY: number) => {
    if (!editor?.canvas) return null;

    // Create a synthetic mouse event for fabric's findTarget
    const canvasEl = editor.canvas.getElement();
    const rect = canvasEl.getBoundingClientRect();

    // Create a minimal event object that fabric.js needs
    const syntheticEvent = {
      clientX,
      clientY,
      target: canvasEl,
      currentTarget: canvasEl,
    } as unknown as MouseEvent;

    // Use fabric's native hit testing - this is what it uses for click detection
    const target = editor.canvas.findTarget(syntheticEvent, false);

    // Return only if it's a frame type (imageFrame, circleFrame, triangleFrame, polygonFrame)
    if (target && isFrameType(target.type)) {
      return target;
    }

    return null;
  };

  // Update frame highlight during drag
  const handleDragMove = (event: DragMoveEvent) => {
    if (!editor?.canvas) return;

    // Use the tracked mouse position for accurate detection
    const { x: finalX, y: finalY } = mousePositionRef.current;

    // Check if we're over the canvas area
    const canvasEl = editor.canvas.getElement();
    const canvasRect = canvasEl.getBoundingClientRect();
    const isOverCanvas =
      finalX >= canvasRect.left &&
      finalX <= canvasRect.right &&
      finalY >= canvasRect.top &&
      finalY <= canvasRect.bottom;

    if (isOverCanvas) {
      const foundFrame = findFrameAtPosition(finalX, finalY);

      if (foundFrame !== hoveredFrame) {
        // Remove highlight from previous frame
        if (hoveredFrame) {
          hoveredFrame.set({ stroke: undefined, strokeWidth: 0 });
        }
        // Add highlight to new frame
        if (foundFrame) {
          foundFrame.set({ stroke: "#3b82f6", strokeWidth: 3 });
        }
        setHoveredFrame(foundFrame);
        editor.canvas.requestRenderAll();
      }
    } else if (hoveredFrame) {
      // Clear highlight when not over canvas
      hoveredFrame.set({ stroke: undefined, strokeWidth: 0 });
      setHoveredFrame(null);
      editor.canvas.requestRenderAll();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Check if drag ended on the canvas
    if (editor?.canvas) {
      // Use the tracked mouse position for accurate drop location
      const { x: finalX, y: finalY } = mousePositionRef.current;

      // Check if we're over the canvas area
      const canvasEl = editor.canvas.getElement();
      const canvasRect = canvasEl.getBoundingClientRect();
      const isOverCanvas =
        finalX >= canvasRect.left &&
        finalX <= canvasRect.right &&
        finalY >= canvasRect.top &&
        finalY <= canvasRect.bottom;

      if (isOverCanvas) {
        const draggedImage = uploadedImages.find((img) => img.id === active.id);
        if (draggedImage) {
          // Clear highlight
          if (hoveredFrame) {
            hoveredFrame.set({ stroke: undefined, strokeWidth: 0 });
            // Replace the frame's image
            editor.replaceFrameImage(hoveredFrame, draggedImage.url);
            setHoveredFrame(null);
          } else {
            // Convert to canvas coordinates and add new image
            const point = editor.canvas.getPointer({
              clientX: finalX,
              clientY: finalY
            } as MouseEvent);
            editor.addImage(draggedImage.url, { left: point.x, top: point.y });
          }
          editor.canvas.requestRenderAll();
        }
        setActiveId(null);
        return;
      }
    }

    // Clear any lingering highlight
    if (hoveredFrame && editor?.canvas) {
      hoveredFrame.set({ stroke: undefined, strokeWidth: 0 });
      setHoveredFrame(null);
      editor.canvas.requestRenderAll();
    }

    // Normal reorder within sidebar
    if (over && active.id !== over.id) {
      const oldIndex = uploadedImages.findIndex((item) => item.id === active.id);
      const newIndex = uploadedImages.findIndex((item) => item.id === over.id);
      const reordered = arrayMove(uploadedImages, oldIndex, newIndex);
      onUploadedImagesChange(reordered);
      // Switch to custom sort after manual reordering
      setSortBy("custom");
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    // Clear any highlight
    if (hoveredFrame && editor?.canvas) {
      hoveredFrame.set({ stroke: undefined, strokeWidth: 0 });
      setHoveredFrame(null);
      editor.canvas.requestRenderAll();
    }
    setActiveId(null);
  };

  // Apply sorting when sort option changes
  useEffect(() => {
    if (sortBy === "custom") return; // Don't sort if custom order

    const sorted = [...uploadedImages];
    switch (sortBy) {
      case "date-asc":
        sorted.sort((a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime());
        break;
      case "date-desc":
        sorted.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        break;
      case "title":
        sorted.sort((a, b) => a.originalName.localeCompare(b.originalName));
        break;
    }
    onUploadedImagesChange(sorted);
  }, [sortBy]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  const handleDelete = (idToDelete: string) => {
    onUploadedImagesChange(uploadedImages.filter((img) => img.id !== idToDelete));
  };

  const activeImage = activeId ? uploadedImages.find((img) => img.id === activeId) : null;

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "images" ? "visible" : "hidden"
      )}
    >
      <ToolSidebarHeader title="Images" description="Drag images to your canvas" />
      <div className="p-4 border-b space-y-3">
        <UploadButton
          appearance={{
            button: "w-full text-sm font-medium",
            allowedContent: "hidden",
          }}
          content={{
            button: "Upload Image",
          }}
          endpoint="imageUploader"
          onClientUploadComplete={(res) => {
            // Process ALL uploaded images with metadata
            const newImages: ImageMetadata[] = res.map((file) => ({
              url: file.url,
              uploadedAt: file.serverData?.uploadedAt || new Date().toISOString(),
              originalName: file.serverData?.originalName || file.name,
              size: file.serverData?.size || file.size,
              id: `${file.url}-${Date.now()}-${Math.random()}`,
            }));
            onUploadedImagesChange([...uploadedImages, ...newImages]);
          }}
        />
        {uploadedImages.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">Sort by:</span>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortBy)}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="date-asc">Date ↑</SelectItem>
                  <SelectItem value="date-desc">Date ↓</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => setShowRedistributeDialog(true)}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="size-4 mr-2" />
              Redistribute Images
            </Button>
          </>
        )}
      </div>
      <ScrollArea>
        <div className="p-4">
          {uploadedImages.length === 0 ? (
            <div className="flex flex-col gap-y-4 items-center justify-center py-8">
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm text-center">
                No images uploaded yet.<br />Upload an image to get started.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragMove={handleDragMove}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={uploadedImages.map((img) => img.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 gap-3">
                  {uploadedImages.map((image) => (
                    <SortableImageItem
                      key={image.id}
                      image={image}
                      onRemove={handleDelete}
                      isDragging={activeId === image.id}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay>
                {activeImage ? <DragOverlayContent image={activeImage} /> : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />

      <AlertDialog open={showRedistributeDialog} onOpenChange={setShowRedistributeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Redistribute Images</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedStyle === "current"
                ? "This will fill all existing frames with images from your library in order."
                : "This will completely regenerate your album layout based on the current image order. All manual edits will be lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Album Style</label>
              <Select
                value={selectedStyle}
                onValueChange={(value) => setSelectedStyle(value as AlbumStyle | "current")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">
                    <div className="flex items-center gap-3">
                      <StylePreview style="current" size="sm" className="flex-shrink-0" />
                      <div>
                        <div className="font-medium">Current Layout</div>
                        <div className="text-xs text-muted-foreground">Fill existing frames</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="classic">
                    <div className="flex items-center gap-3">
                      <StylePreview style="classic" size="sm" className="flex-shrink-0" />
                      <div>
                        <div className="font-medium">Classic</div>
                        <div className="text-xs text-muted-foreground">2-3 photos per page</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="modern">
                    <div className="flex items-center gap-3">
                      <StylePreview style="modern" size="sm" className="flex-shrink-0" />
                      <div>
                        <div className="font-medium">Modern</div>
                        <div className="text-xs text-muted-foreground">1-2 photos per page</div>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="collage">
                    <div className="flex items-center gap-3">
                      <StylePreview style="collage" size="sm" className="flex-shrink-0" />
                      <div>
                        <div className="font-medium">Collage</div>
                        <div className="text-xs text-muted-foreground">3-6 photos per page</div>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (editor) {
                  if (selectedStyle === "current") {
                    editor.fillFramesWithImages(uploadedImages);
                  } else {
                    editor.redistributeImages(uploadedImages, selectedStyle);
                  }
                }
                setShowRedistributeDialog(false);
              }}
            >
              {selectedStyle === "current" ? "Fill Frames" : "Redistribute"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
};
