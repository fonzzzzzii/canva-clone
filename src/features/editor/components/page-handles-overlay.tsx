import { useEffect, useState, useCallback, useRef } from "react";
import { fabric } from "fabric";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { PageHandle } from "./page-handle";
import { Editor, PageInfo, PageTemplate } from "@/features/editor/types";
import { TemplatePickerDialog } from "./template-picker-dialog";
import { isFrameType, IFrame } from "@/features/editor/objects/image-frame";

interface PageHandlesOverlayProps {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement>;
}

interface PageScreenPosition {
  pageNumber: number;
  screenX: number;
  screenY: number;
  isVisible: boolean;
}

// Sortable wrapper for PageHandle
interface SortablePageHandleProps {
  id: string;
  pageNumber: number;
  screenPosition: { left: number; top: number };
  editor: Editor;
  onAddSpreadBefore: () => void;
  onAddSpreadAfter: () => void;
  onChangeTemplate?: (pageNumber: number) => void;
  isVisible: boolean;
}

const SortablePageHandle = ({
  id,
  pageNumber,
  screenPosition,
  editor,
  onAddSpreadBefore,
  onAddSpreadAfter,
  onChangeTemplate,
  isVisible,
}: SortablePageHandleProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // Hide non-focused pages but keep in DOM for dnd-kit
    opacity: isVisible ? 1 : 0,
    pointerEvents: isVisible ? 'auto' : 'none',
  };

  return (
    <PageHandle
      ref={setNodeRef}
      pageNumber={pageNumber}
      screenPosition={screenPosition}
      editor={editor}
      onAddSpreadBefore={onAddSpreadBefore}
      onAddSpreadAfter={onAddSpreadAfter}
      onChangeTemplate={onChangeTemplate}
      isDragging={isDragging}
      dragAttributes={attributes}
      dragListeners={listeners}
      style={style}
    />
  );
};

export const PageHandlesOverlay = ({
  editor,
  containerRef,
}: PageHandlesOverlayProps) => {
  const [pagePositions, setPagePositions] = useState<PageScreenPosition[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [insertionContext, setInsertionContext] = useState<{
    spreadIndex: number;
    position: 'before' | 'after';
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastOverId, setLastOverId] = useState<string | null>(null);
  const [hoveredPageNumber, setHoveredPageNumber] = useState<number | null>(null);

  // State for changing template
  const [changeTemplatePageNumber, setChangeTemplatePageNumber] = useState<number | null>(null);

  // Ref for animation frame cleanup
  const rafIdRef = useRef<number | null>(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const calculatePagePositions = useCallback(() => {
    if (!containerRef.current || !editor.canvas) return;

    const canvas = editor.canvas;
    const container = containerRef.current;
    const containerRect = container.getBoundingClientRect();

    const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
    const zoom = canvas.getZoom();

    const pages = editor.getPages();
    const newPositions: PageScreenPosition[] = [];

    pages.forEach((page: PageInfo) => {
      const position = editor.getPagePosition(page.pageNumber);
      if (!position) return;

      const pageRect = editor.getPageByNumber(page.pageNumber);
      if (!pageRect) return;

      const pageWidth = (pageRect as any).width || 2970;

      // Calculate center-top of page in screen coordinates
      const centerX = position.left + pageWidth / 2;
      const topY = position.top;

      // Apply viewport transform
      const screenX = centerX * zoom + vpt[4];
      const screenY = topY * zoom + vpt[5];

      // Check if page is visible in viewport
      const handleHeight = 32;
      const handleWidth = 80;
      const isVisible =
        screenX >= -handleWidth &&
        screenX <= containerRect.width + handleWidth &&
        screenY >= -handleHeight &&
        screenY <= containerRect.height + handleHeight;

      newPositions.push({
        pageNumber: page.pageNumber,
        screenX,
        screenY: screenY - 40, // Position above the page (8px gap + 32px handle height)
        isVisible,
      });
    });

    setPagePositions(newPositions);
  }, [editor, containerRef]);

  // Use a stable interval-based approach to avoid event-driven feedback loops
  useEffect(() => {
    if (!editor.canvas) return;

    // Calculate initial positions
    calculatePagePositions();

    // Use a polling approach with comparison to avoid feedback loops
    let lastSignature = "";

    const checkForChanges = () => {
      const canvas = editor.canvas;
      if (!canvas) return;

      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = canvas.getZoom();
      const signature = `${vpt[4].toFixed(0)},${vpt[5].toFixed(0)},${zoom.toFixed(3)}`;

      if (signature !== lastSignature) {
        lastSignature = signature;
        calculatePagePositions();
      }
    };

    // Check periodically but not too frequently
    const intervalId = setInterval(checkForChanges, 100);

    // Also update on resize
    window.addEventListener('resize', calculatePagePositions);

    return () => {
      clearInterval(intervalId);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('resize', calculatePagePositions);
    };
  }, [editor.canvas, calculatePagePositions]);

  // Track mouse hover to show page handle when hovering over a page
  useEffect(() => {
    if (!editor.canvas || !containerRef.current) return;

    const canvas = editor.canvas;
    const container = containerRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      // Convert screen coordinates to canvas coordinates
      const vpt = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const zoom = canvas.getZoom();
      const canvasX = (mouseX - vpt[4]) / zoom;
      const canvasY = (mouseY - vpt[5]) / zoom;

      // Check which page the mouse is over
      const pages = editor.getPages();
      let foundPage: number | null = null;

      for (const page of pages) {
        const pageRect = editor.getPageByNumber(page.pageNumber);
        if (!pageRect) continue;

        const pageLeft = pageRect.left || 0;
        const pageTop = pageRect.top || 0;
        const pageWidth = (pageRect as any).width || 0;
        const pageHeight = (pageRect as any).height || 0;

        // Extend detection area above the page to include the menu handle area
        // The handle is positioned ~50px above the page top (40px offset + handle height)
        const extendedTop = pageTop - 60 / zoom; // Account for zoom level

        if (
          canvasX >= pageLeft &&
          canvasX <= pageLeft + pageWidth &&
          canvasY >= extendedTop &&
          canvasY <= pageTop + pageHeight
        ) {
          foundPage = page.pageNumber;
          break;
        }
      }

      setHoveredPageNumber(foundPage);
    };

    const handleMouseLeave = () => {
      setHoveredPageNumber(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [editor, containerRef]);

  const handleAddSpreadBefore = (pageNumber: number) => {
    const spreadIndex = Math.floor((pageNumber - 1) / 2);
    if (spreadIndex === 0) {
      setInsertionContext({ spreadIndex: 0, position: 'before' });
    } else {
      setInsertionContext({ spreadIndex: spreadIndex - 1, position: 'after' });
    }
    setTemplateDialogOpen(true);
  };

  const handleAddSpreadAfter = (pageNumber: number) => {
    const spreadIndex = Math.floor((pageNumber - 1) / 2);
    setInsertionContext({ spreadIndex, position: 'after' });
    setTemplateDialogOpen(true);
  };

  const handleChangeTemplateClick = (pageNumber: number) => {
    setChangeTemplatePageNumber(pageNumber);
    setTemplateDialogOpen(true);
  };

  const handleTemplatesSelected = (
    leftTemplate: PageTemplate,
    rightTemplate: PageTemplate,
    keepImages?: boolean
  ) => {
    if (changeTemplatePageNumber !== null) {
      // Single-page mode: apply template directly (no confirmation dialog)
      // This avoids the Radix UI pointer-events bug that occurs when chaining dialogs
      // See: https://github.com/radix-ui/primitives/issues/1241

      // Clear any active selection first
      editor.canvas.discardActiveObject();

      // Get the workspace for this page
      const workspace = editor.canvas
        .getObjects()
        .find((obj: any) =>
          (obj.name === "clip" || obj.name?.startsWith("clip-page-")) &&
          obj.pageNumber === changeTemplatePageNumber
        );

      if (workspace) {
        // Get all frames on this page
        const allObjects = editor.canvas.getObjects();
        const wsBounds = workspace.getBoundingRect();

        const framesToRemove = allObjects.filter((obj) => {
          if (!isFrameType(obj.type)) return false;
          const frame = obj as IFrame;

          // Check if frame is on this page
          const frameBounds = frame.getBoundingRect();
          return (
            frameBounds.left >= wsBounds.left &&
            frameBounds.left < wsBounds.left + wsBounds.width &&
            frameBounds.top >= wsBounds.top &&
            frameBounds.top < wsBounds.top + wsBounds.height
          );
        });

        // Collect images to preserve if keepImages is true
        const imagesToKeep: Array<{ imageUrl: string }> = [];
        if (keepImages) {
          framesToRemove.forEach((frame) => {
            const linkedImage = (frame as IFrame).getLinkedImage(editor.canvas);
            if (linkedImage && (linkedImage as any).imageUrl) {
              imagesToKeep.push({ imageUrl: (linkedImage as any).imageUrl });
            }
          });
        }

        // Remove frames and their linked images in batch
        editor.canvas.remove(...framesToRemove.map((frame) => {
          const linkedImage = (frame as IFrame).getLinkedImage(editor.canvas);
          return linkedImage ? [linkedImage, frame] : [frame];
        }).flat());

        // Apply new template
        editor.applyTemplateToPage(changeTemplatePageNumber, leftTemplate);

        // Re-add images to new frames if keepImages is true
        if (keepImages && imagesToKeep.length > 0) {
          // Get newly created frames on this page
          const newWsBounds = workspace.getBoundingRect();
          const newFrames = editor.canvas.getObjects().filter((obj) => {
            if (!isFrameType(obj.type)) return false;
            const frameBounds = obj.getBoundingRect();
            return (
              frameBounds.left >= newWsBounds.left &&
              frameBounds.left < newWsBounds.left + newWsBounds.width &&
              frameBounds.top >= newWsBounds.top &&
              frameBounds.top < newWsBounds.top + newWsBounds.height
            );
          }) as IFrame[];

          // Match images to frames (in order, up to available frames)
          const framesToFill = Math.min(imagesToKeep.length, newFrames.length);
          for (let i = 0; i < framesToFill; i++) {
            editor.replaceFrameImage(newFrames[i], imagesToKeep[i].imageUrl);
          }
        }
      }

      editor.canvas.renderAll();

      // Reset state
      setChangeTemplatePageNumber(null);
      setTemplateDialogOpen(false);

    } else if (insertionContext) {
      // Spread mode: add spread (existing logic)
      if (insertionContext.position === 'before' && insertionContext.spreadIndex === 0) {
        editor.addSpreadAfter(0, leftTemplate, rightTemplate);
        editor.moveSpread(1, 0);
      } else {
        editor.addSpreadAfter(insertionContext.spreadIndex, leftTemplate, rightTemplate);
      }

      setTemplateDialogOpen(false);
      setInsertionContext(null);
    }
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
    setLastOverId(event.active.id);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event;

    if (!over) return;

    // Only swap if we moved to a different target than last time
    // Note: We don't check active.id === over.id because after swapping,
    // the page numbers change and we need to be able to swap back
    if (lastOverId !== over.id) {
      const currentPageNumber = parseInt(String(lastOverId).replace("page-", ""));
      const targetPageNumber = parseInt(String(over.id).replace("page-", ""));

      // Swap the pages visually
      editor.swapPagePositionsVisually(currentPageNumber, targetPageNumber);
      setLastOverId(String(over.id));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    setLastOverId(null);
    // Pages are already swapped visually, trigger a save
    editor.save();
  };

  const visiblePositions = pagePositions.filter((pos) => pos.isVisible);
  const sortableIds = visiblePositions.map((pos) => `page-${pos.pageNumber}`);

  const isDragging = activeId !== null;

  // Find the active page info for the drag overlay
  const activePage = activeId
    ? visiblePositions.find((pos) => `page-${pos.pageNumber}` === activeId)
    : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
          {visiblePositions.map((pos) => (
            <SortablePageHandle
              key={pos.pageNumber}
              id={`page-${pos.pageNumber}`}
              pageNumber={pos.pageNumber}
              screenPosition={{ left: pos.screenX, top: pos.screenY }}
              editor={editor}
              onAddSpreadBefore={() => handleAddSpreadBefore(pos.pageNumber)}
              onAddSpreadAfter={() => handleAddSpreadAfter(pos.pageNumber)}
              onChangeTemplate={handleChangeTemplateClick}
              isVisible={isDragging || pos.pageNumber === hoveredPageNumber}
            />
          ))}
        </SortableContext>

        {/* Drag overlay - shows a preview while dragging */}
        <DragOverlay>
          {activePage ? (
            <div className="flex items-center gap-1 bg-white/90 backdrop-blur-sm border border-blue-400 rounded-md shadow-lg px-1 py-0.5 z-50">
              <div className="p-1 cursor-grabbing text-blue-500">
                <GripVertical className="w-4 h-4" />
              </div>
              <span className="text-xs text-blue-600 px-1 font-medium">
                {activePage.pageNumber}
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Template picker dialog */}
      <TemplatePickerDialog
        open={templateDialogOpen}
        onOpenChange={(open) => {
          setTemplateDialogOpen(open);
          // If dialog is closed without confirming, reset change template state
          if (!open && changeTemplatePageNumber !== null) {
            setChangeTemplatePageNumber(null);
          }
        }}
        onConfirm={handleTemplatesSelected}
        mode={changeTemplatePageNumber !== null ? "single-page" : "spread"}
      />
    </>
  );
};
