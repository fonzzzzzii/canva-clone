"use client";

import { fabric } from "fabric";
import debounce from "lodash.debounce";
import { useCallback, useEffect, useRef, useState } from "react";

import { ResponseType } from "@/features/projects/api/use-get-project";
import { useUpdateProject } from "@/features/projects/api/use-update-project";

import { 
  ActiveTool, 
  selectionDependentTools
} from "@/features/editor/types";
import { Navbar } from "@/features/editor/components/navbar";
import { Footer } from "@/features/editor/components/footer";
import { useEditor } from "@/features/editor/hooks/use-editor";
import { Sidebar } from "@/features/editor/components/sidebar";
import { Toolbar } from "@/features/editor/components/toolbar";
import { ShapeSidebar } from "@/features/editor/components/shape-sidebar";
import { FillColorSidebar } from "@/features/editor/components/fill-color-sidebar";
import { StrokeColorSidebar } from "@/features/editor/components/stroke-color-sidebar";
import { StrokeWidthSidebar } from "@/features/editor/components/stroke-width-sidebar";
import { OpacitySidebar } from "@/features/editor/components/opacity-sidebar";
import { TextSidebar } from "@/features/editor/components/text-sidebar";
import { FontSidebar } from "@/features/editor/components/font-sidebar";
import { ImageSidebar, ImageMetadata } from "@/features/editor/components/image-sidebar";
import { ImageFrameSidebar } from "@/features/editor/components/image-frame-sidebar";
import { FilterSidebar } from "@/features/editor/components/filter-sidebar";
import { DrawSidebar } from "@/features/editor/components/draw-sidebar";
import { AiSidebar } from "@/features/editor/components/ai-sidebar";
import { TemplateSidebar } from "@/features/editor/components/template-sidebar";
import { RemoveBgSidebar } from "@/features/editor/components/remove-bg-sidebar";
import { SettingsSidebar } from "@/features/editor/components/settings-sidebar";
import { SnapLines } from "@/features/editor/components/snap-lines";
import { GridOverlay } from "@/features/editor/components/grid-overlay";
import { ContextMenu } from "@/features/editor/components/context-menu";

interface ContextMenuState {
  x: number;
  y: number;
  visible: boolean;
}

interface EditorProps {
  initialData: ResponseType["data"];
};

export const Editor = ({ initialData }: EditorProps) => {
  const { mutate } = useUpdateProject(initialData.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSave = useCallback(
    debounce(
      (values: { 
        json: string,
        height: number,
        width: number,
      }) => {
        mutate(values);
    },
    500
  ), [mutate]);

  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ x: 0, y: 0, visible: false });

  // Parse uploaded images from database (stored as JSON string of ImageMetadata[])
  const [uploadedImages, setUploadedImages] = useState<ImageMetadata[]>(() => {
    if (initialData.uploadedImages) {
      try {
        const parsed = JSON.parse(initialData.uploadedImages);
        // Handle migration from old format (string[]) to new format (ImageMetadata[])
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (typeof parsed[0] === 'string') {
            // Old format: convert URLs to ImageMetadata
            return parsed.map((url: string, index: number) => ({
              url,
              uploadedAt: new Date().toISOString(),
              originalName: `Image ${index + 1}`,
              size: 0,
              id: `${url}-${Date.now()}-${index}`,
            }));
          }
          return parsed;
        }
        return [];
      } catch {
        return [];
      }
    }
    return [];
  });

  // Handle uploaded images changes - save to database
  const onUploadedImagesChange = useCallback((images: ImageMetadata[]) => {
    setUploadedImages(images);
    mutate({ uploadedImages: JSON.stringify(images) });
  }, [mutate]);

  const onClearSelection = useCallback(() => {
    if (selectionDependentTools.includes(activeTool)) {
      setActiveTool("select");
    }
  }, [activeTool]);

  const { init, editor, snapLines, snappingOptions, container, hasClipboard } = useEditor({
    defaultState: initialData.json,
    defaultWidth: initialData.width,
    defaultHeight: initialData.height,
    defaultPageCount: initialData.pageCount || 1,
    clearSelectionCallback: onClearSelection,
    saveCallback: debouncedSave,
  });

  const onChangeActiveTool = useCallback((tool: ActiveTool) => {
    if (tool === "draw") {
      editor?.enableDrawingMode();
    }

    if (activeTool === "draw") {
      editor?.disableDrawingMode();
    }

    if (tool === activeTool) {
      return setActiveTool("select");
    }
    
    setActiveTool(tool);
  }, [activeTool, editor]);

  const canvasRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = new fabric.Canvas(canvasRef.current, {
      controlsAboveOverlay: true,
      preserveObjectStacking: true,
    });

    init({
      initialCanvas: canvas,
      initialContainer: containerRef.current!,
    });

    return () => {
      canvas.dispose();
    };
  }, [init]);

  // Handle right-click context menu
  useEffect(() => {
    if (!editor?.canvas) return;

    const canvas = editor.canvas;
    const canvasElement = (canvas as any).upperCanvasEl as HTMLCanvasElement | undefined;

    if (!canvasElement) return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Check if clicking on an object and select it
      // But skip workspace/clip objects - they should never be selected
      const target = canvas.findTarget(e, false);
      if (target && !canvas.getActiveObjects().includes(target)) {
        const isWorkspace = target.name === "clip" || target.name?.startsWith("clip-page-");
        if (!isWorkspace && target.selectable) {
          canvas.setActiveObject(target);
          canvas.requestRenderAll();
        }
      }

      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        visible: true,
      });
    };

    const handleMouseDown = (e: MouseEvent) => {
      // Close context menu on left click
      if (e.button === 0) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    canvasElement.addEventListener("contextmenu", handleContextMenu);
    canvasElement.addEventListener("mousedown", handleMouseDown);

    return () => {
      canvasElement.removeEventListener("contextmenu", handleContextMenu);
      canvasElement.removeEventListener("mousedown", handleMouseDown);
    };
  }, [editor?.canvas]);

  return (
    <div className="h-full flex flex-col">
      <Navbar
        id={initialData.id}
        editor={editor}
        activeTool={activeTool}
        onChangeActiveTool={onChangeActiveTool}
      />
      <div className="absolute h-[calc(100%-68px)] w-full top-[68px] flex">
        <Sidebar
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <ShapeSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <FillColorSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <StrokeColorSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <StrokeWidthSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <OpacitySidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <TextSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <FontSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <ImageSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
          uploadedImages={uploadedImages}
          onUploadedImagesChange={onUploadedImagesChange}
        />
        <ImageFrameSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <TemplateSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <FilterSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <AiSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <RemoveBgSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <DrawSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <SettingsSidebar
          editor={editor}
          activeTool={activeTool}
          onChangeActiveTool={onChangeActiveTool}
        />
        <main className="bg-muted flex-1 overflow-auto relative flex flex-col">
          <Toolbar
            editor={editor}
            activeTool={activeTool}
            onChangeActiveTool={onChangeActiveTool}
            key={`toolbar-${editor?.selectedObjects?.length || 0}-${editor?.selectedObjects?.[0]?.type || 'none'}`}
          />
          <div
            className="flex-1 h-[calc(100%-124px)] bg-muted relative"
            ref={containerRef}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const imageUrl = e.dataTransfer.getData("image-url");
              if (imageUrl && editor?.canvas) {
                // Convert to canvas coordinates (accounting for zoom/pan)
                const point = editor.canvas.getPointer({ clientX: e.clientX, clientY: e.clientY } as MouseEvent);
                editor.addImage(imageUrl, { left: point.x, top: point.y });
              }
            }}
          >
            <canvas ref={canvasRef} />
            {container && editor && (
              <>
                {(() => {
                  const workspace = editor.getWorkspace();
                  const workspaceBounds = workspace?.getBoundingRect();

                  return (
                    <>
                      <GridOverlay
                        show={snappingOptions.showGrid}
                        visualGridSize={snappingOptions.visualGridSize}
                        containerWidth={container.offsetWidth}
                        containerHeight={container.offsetHeight}
                        workspaceLeft={workspaceBounds?.left || 0}
                        workspaceTop={workspaceBounds?.top || 0}
                        workspaceWidth={workspace?.width as number || 0}
                        workspaceHeight={workspace?.height as number || 0}
                      />
                      <SnapLines lines={snapLines} containerRef={containerRef} />
                    </>
                  );
                })()}
              </>
            )}
          </div>
          <Footer editor={editor} />
        </main>
      </div>
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
        editor={editor}
        hasClipboard={hasClipboard?.() || false}
      />
    </div>
  );
};
