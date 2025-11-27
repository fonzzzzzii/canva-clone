import { useEffect, useMemo, useState } from "react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { ColorPicker } from "@/features/editor/components/color-picker";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";

interface SettingsSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
};

export const SettingsSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: SettingsSidebarProps) => {
  const workspace = editor?.getWorkspace();

  const initialWidth = useMemo(() => `${workspace?.width ?? 0}`, [workspace]);
  const initialHeight = useMemo(() => `${workspace?.height ?? 0}`, [workspace]);
  const initialBackground = useMemo(() => workspace?.fill ?? "#ffffff", [workspace]);

  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  const [background, setBackground] = useState(initialBackground);

  useEffect(() => {
    setWidth(initialWidth);
    setHeight(initialHeight);
    setBackground(initialBackground);
  }, 
  [
    initialWidth,
    initialHeight,
    initialBackground
  ]);

  const changeWidth = (value: string) => setWidth(value);
  const changeHeight = (value: string) => setHeight(value);
  const changeBackground = (value: string) => {
    setBackground(value);
    editor?.changeBackground(value);
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    editor?.changeSize({
      width: parseInt(width, 10),
      height: parseInt(height, 10),
    });
  }

  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "settings" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="Settings"
        description="Change the look of your workspace"
      />
      <ScrollArea>
        <form className="space-y-4 p-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label>
              Height
            </Label>
            <Input
              placeholder="Height"
              value={height}
              type="number"
              onChange={(e) => changeHeight(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Width
            </Label>
            <Input
              placeholder="Width"
              value={width}
              type="number"
              onChange={(e) => changeWidth(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Resize
          </Button>
        </form>
        <div className="p-4">
          <ColorPicker
            value={background as string} // We dont support gradients or patterns
            onChange={changeBackground}
          />
        </div>

        <Separator className="my-4" />

        <div className="p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold mb-3">Snapping & Grid</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="snap-grid" className="text-sm font-normal">
                  Snap to Grid
                </Label>
                <Switch
                  id="snap-grid"
                  checked={editor?.getSnappingOptions().snapToGrid ?? true}
                  onCheckedChange={editor?.toggleSnapToGrid}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="snap-objects" className="text-sm font-normal">
                  Snap to Objects
                </Label>
                <Switch
                  id="snap-objects"
                  checked={editor?.getSnappingOptions().snapToObjects ?? true}
                  onCheckedChange={editor?.toggleSnapToObjects}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="snap-canvas" className="text-sm font-normal">
                  Snap to Canvas
                </Label>
                <Switch
                  id="snap-canvas"
                  checked={editor?.getSnappingOptions().snapToCanvas ?? true}
                  onCheckedChange={editor?.toggleSnapToCanvas}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="snap-rotation" className="text-sm font-normal">
                  Snap Rotation
                </Label>
                <Switch
                  id="snap-rotation"
                  checked={editor?.getSnappingOptions().snapRotation ?? true}
                  onCheckedChange={editor?.toggleSnapRotation}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="show-grid" className="text-sm font-normal">
                  Show Grid
                </Label>
                <Switch
                  id="show-grid"
                  checked={editor?.getSnappingOptions().showGrid ?? false}
                  onCheckedChange={editor?.toggleGrid}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snap-grid-size" className="text-sm font-normal">
                    Snap Grid
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {editor?.getSnappingOptions().snapGridSize ?? 10}px
                  </span>
                </div>
                <Slider
                  id="snap-grid-size"
                  min={1}
                  max={50}
                  step={1}
                  value={[editor?.getSnappingOptions().snapGridSize ?? 10]}
                  onValueChange={(value) => editor?.setSnapGridSize(value[0])}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="visual-grid-size" className="text-sm font-normal">
                    Visual Grid
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {editor?.getSnappingOptions().visualGridSize ?? 20}px
                  </span>
                </div>
                <Slider
                  id="visual-grid-size"
                  min={10}
                  max={100}
                  step={5}
                  value={[editor?.getSnappingOptions().visualGridSize ?? 20]}
                  onValueChange={(value) => editor?.setVisualGridSize(value[0])}
                  className="w-full"
                  disabled={!editor?.getSnappingOptions().showGrid}
                />
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
