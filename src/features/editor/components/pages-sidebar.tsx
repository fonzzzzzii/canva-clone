"use client";

import { useState, useMemo, useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";

import { ActiveTool, Editor, PageInfo, PageTemplate } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";
import { TemplatePickerDialog } from "@/features/editor/components/template-picker-dialog";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface PagesSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

interface SpreadInfo {
  spreadIndex: number;
  leftPage: PageInfo | undefined;
  rightPage: PageInfo | undefined;
}

export const PagesSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: PagesSidebarProps) => {
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [spreadToDelete, setSpreadToDelete] = useState<number | null>(null);

  // Get pages and organize into spreads
  const pages = useMemo(() => {
    if (!editor) return [];
    return editor.getPages();
  }, [editor, editor?.canvas]);

  const spreads = useMemo((): SpreadInfo[] => {
    if (pages.length === 0) return [];

    const spreadMap = new Map<number, SpreadInfo>();

    pages.forEach((page) => {
      if (!spreadMap.has(page.spreadIndex)) {
        spreadMap.set(page.spreadIndex, {
          spreadIndex: page.spreadIndex,
          leftPage: undefined,
          rightPage: undefined,
        });
      }

      const spread = spreadMap.get(page.spreadIndex)!;
      if (page.isLeftPage) {
        spread.leftPage = page;
      } else {
        spread.rightPage = page;
      }
    });

    return Array.from(spreadMap.values()).sort(
      (a, b) => a.spreadIndex - b.spreadIndex
    );
  }, [pages]);

  const currentSpreadIndex = useMemo(() => {
    if (!editor) return 0;
    return editor.getCurrentSpreadIndex();
  }, [editor, editor?.canvas]);

  const totalSpreads = spreads.length;
  const canDelete = totalSpreads > 1;

  const handleAddSpread = useCallback(() => {
    setShowTemplatePicker(true);
  }, []);

  const handleTemplatesSelected = useCallback(
    (leftTemplate: PageTemplate, rightTemplate: PageTemplate) => {
      if (!editor) return;
      editor.addSpreadAfter(currentSpreadIndex, leftTemplate, rightTemplate);
      setShowTemplatePicker(false);
    },
    [editor, currentSpreadIndex]
  );

  const handleDeleteSpread = useCallback((spreadIndex: number) => {
    setSpreadToDelete(spreadIndex);
  }, []);

  const confirmDeleteSpread = useCallback(() => {
    if (spreadToDelete !== null && editor) {
      editor.deleteSpread(spreadToDelete);
    }
    setSpreadToDelete(null);
  }, [spreadToDelete, editor]);

  const handlePageClick = useCallback(
    (pageNumber: number) => {
      if (!editor) return;
      editor.goToPage(pageNumber);
    },
    [editor]
  );

  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <>
      <aside
        className={cn(
          "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
          activeTool === "pages" ? "visible" : "hidden"
        )}
      >
        <ToolSidebarHeader
          title="Pages"
          description="Manage your album pages"
        />
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Add Spread Button */}
            <Button
              onClick={handleAddSpread}
              className="w-full"
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Spread
            </Button>

            {/* Spreads List */}
            <div className="space-y-3">
              {spreads.map((spread) => (
                <div
                  key={spread.spreadIndex}
                  className={cn(
                    "border rounded-lg p-3 transition-colors",
                    spread.spreadIndex === currentSpreadIndex
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  {/* Spread Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">
                      Spread {spread.spreadIndex + 1}
                    </span>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => handleDeleteSpread(spread.spreadIndex)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {/* Page Thumbnails - A4 landscape aspect ratio (99:70) */}
                  <div className="flex gap-2">
                    {/* Left Page */}
                    {spread.leftPage && (
                      <button
                        className={cn(
                          "flex-1 aspect-[99/70] bg-white border rounded shadow-sm flex items-center justify-center text-xs text-gray-500 hover:border-blue-400 transition-colors",
                          spread.spreadIndex === currentSpreadIndex
                            ? "border-blue-300"
                            : "border-gray-200"
                        )}
                        onClick={() =>
                          handlePageClick(spread.leftPage!.pageNumber)
                        }
                      >
                        {spread.leftPage.pageNumber}
                      </button>
                    )}
                    {/* Right Page */}
                    {spread.rightPage && (
                      <button
                        className={cn(
                          "flex-1 aspect-[99/70] bg-white border rounded shadow-sm flex items-center justify-center text-xs text-gray-500 hover:border-blue-400 transition-colors",
                          spread.spreadIndex === currentSpreadIndex
                            ? "border-blue-300"
                            : "border-gray-200"
                        )}
                        onClick={() =>
                          handlePageClick(spread.rightPage!.pageNumber)
                        }
                      >
                        {spread.rightPage.pageNumber}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Page Count Info */}
            <div className="text-xs text-gray-500 text-center pt-2 border-t">
              {pages.length} pages ({totalSpreads} spreads)
            </div>
          </div>
        </ScrollArea>
        <ToolSidebarClose onClick={onClose} />
      </aside>

      {/* Template Picker Dialog */}
      <TemplatePickerDialog
        open={showTemplatePicker}
        onOpenChange={setShowTemplatePicker}
        onConfirm={handleTemplatesSelected}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={spreadToDelete !== null}
        onOpenChange={(open: boolean) => !open && setSpreadToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Spread?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete both pages in Spread{" "}
              {spreadToDelete !== null ? spreadToDelete + 1 : ""} and all
              objects on them. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteSpread}
              className="bg-red-500 hover:bg-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
