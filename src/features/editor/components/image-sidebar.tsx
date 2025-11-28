import { useState, useEffect, useRef } from "react";
import { Upload, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
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
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";

import { cn } from "@/lib/utils";
import { UploadButton } from "@/lib/uploadthing";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      className="relative w-full h-[100px] group bg-muted rounded-sm overflow-hidden border hover:ring-2 hover:ring-primary/50 transition cursor-grab active:cursor-grabbing"
    >
      <img
        src={image.url}
        alt={image.originalName}
        className="object-cover w-full h-full pointer-events-none"
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
    <div className="w-[150px] h-[100px] bg-muted rounded-sm overflow-hidden border-2 border-primary shadow-lg opacity-90">
      <img
        src={image.url}
        alt={image.originalName}
        className="object-cover w-full h-full"
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
  const sidebarRef = useRef<HTMLDivElement>(null);

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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, activatorEvent } = event;

    // Get the final pointer position
    const pointerEvent = activatorEvent as PointerEvent;

    // Check if drag ended outside the sidebar (dropped on canvas)
    if (sidebarRef.current) {
      const sidebarRect = sidebarRef.current.getBoundingClientRect();
      const dragEndEvent = event.activatorEvent as MouseEvent;

      // Get the current pointer position from the delta
      const finalX = (dragEndEvent?.clientX || 0) + (event.delta?.x || 0);
      const finalY = (dragEndEvent?.clientY || 0) + (event.delta?.y || 0);

      // If dropped outside sidebar (to the right), add to canvas
      if (finalX > sidebarRect.right) {
        const draggedImage = uploadedImages.find((img) => img.id === active.id);
        if (draggedImage && editor?.canvas) {
          // Calculate canvas position
          const canvasEl = editor.canvas.getElement();
          const canvasRect = canvasEl.getBoundingClientRect();

          // Convert to canvas coordinates
          const point = editor.canvas.getPointer({
            clientX: finalX,
            clientY: finalY
          } as MouseEvent);

          editor.addImage(draggedImage.url, { left: point.x, top: point.y });
        }
        setActiveId(null);
        return;
      }
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
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <SortableContext
                items={uploadedImages.map((img) => img.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 gap-4">
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
    </aside>
  );
};
