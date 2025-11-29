"use client";

import { useState, useCallback } from "react";
import { ArrowLeft, Check } from "lucide-react";

import { PageTemplate, FramePosition } from "@/features/editor/types";
import {
  PAGE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  CATEGORY_LABELS,
} from "@/features/editor/page-templates";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TemplatePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (leftTemplate: PageTemplate, rightTemplate: PageTemplate) => void;
}

type Step = "left" | "right";

// A4 landscape aspect ratio (2970x2100 = 99:70 simplified)
const PAGE_ASPECT_RATIO = "aspect-[99/70]";

// Mini preview component for template thumbnails
const TemplateThumbnail = ({
  template,
  isSelected,
  onClick,
}: {
  template: PageTemplate;
  isSelected: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      className={cn(
        "relative w-full bg-white border-2 rounded-lg overflow-hidden transition-all hover:scale-105",
        PAGE_ASPECT_RATIO,
        isSelected
          ? "border-blue-500 ring-2 ring-blue-200"
          : "border-gray-200 hover:border-gray-300"
      )}
      onClick={onClick}
    >
      {/* Render frame rectangles */}
      <div className="absolute inset-0 p-1">
        {template.frames.length === 0 ? (
          // Blank template - show dotted border
          <div className="w-full h-full border-2 border-dashed border-gray-300 rounded flex items-center justify-center">
            <span className="text-[8px] text-gray-400">Blank</span>
          </div>
        ) : (
          template.frames.map((frame, idx) => (
            <div
              key={idx}
              className="absolute bg-blue-100 border border-blue-300 rounded-sm"
              style={{
                left: `${frame.x}%`,
                top: `${frame.y}%`,
                width: `${frame.width}%`,
                height: `${frame.height}%`,
              }}
            />
          ))
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      {/* Template name */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-1">
        <span className="text-[8px] text-white font-medium truncate block">
          {template.name}
        </span>
      </div>
    </button>
  );
};

export const TemplatePickerDialog = ({
  open,
  onOpenChange,
  onConfirm,
}: TemplatePickerDialogProps) => {
  const [step, setStep] = useState<Step>("left");
  const [leftTemplate, setLeftTemplate] = useState<PageTemplate | null>(null);
  const [rightTemplate, setRightTemplate] = useState<PageTemplate | null>(null);
  const [activeCategory, setActiveCategory] = useState("blank");

  const handleTemplateSelect = useCallback(
    (template: PageTemplate) => {
      if (step === "left") {
        setLeftTemplate(template);
      } else {
        setRightTemplate(template);
      }
    },
    [step]
  );

  const handleNext = useCallback(() => {
    if (step === "left" && leftTemplate) {
      setStep("right");
    }
  }, [step, leftTemplate]);

  const handleBack = useCallback(() => {
    if (step === "right") {
      setStep("left");
      setRightTemplate(null);
    }
  }, [step]);

  const handleConfirm = useCallback(() => {
    if (leftTemplate && rightTemplate) {
      onConfirm(leftTemplate, rightTemplate);
      // Reset state
      setStep("left");
      setLeftTemplate(null);
      setRightTemplate(null);
      setActiveCategory("blank");
    }
  }, [leftTemplate, rightTemplate, onConfirm]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // Reset state when dialog closes
        setStep("left");
        setLeftTemplate(null);
        setRightTemplate(null);
        setActiveCategory("blank");
      }
      onOpenChange(open);
    },
    [onOpenChange]
  );

  const categories = Object.keys(TEMPLATE_CATEGORIES) as Array<
    keyof typeof TEMPLATE_CATEGORIES
  >;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <div className="flex items-center gap-3">
            {step === "right" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={handleBack}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <DialogTitle className="text-lg">
                {step === "left"
                  ? "Step 1: Select template for LEFT page"
                  : "Step 2: Select template for RIGHT page"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {step === "left"
                  ? "Choose a layout for the left page of the new spread"
                  : "Choose a layout for the right page of the new spread"}
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="flex items-center gap-2 mt-4">
            <div
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                step === "left" ? "bg-blue-500" : "bg-blue-500"
              )}
            />
            <div
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                step === "right" ? "bg-blue-500" : "bg-gray-200"
              )}
            />
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <Tabs
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="h-full flex flex-col"
          >
            <TabsList className="mx-6 mt-4 flex-wrap h-auto gap-1">
              {categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="text-xs px-2 py-1"
                >
                  {CATEGORY_LABELS[category]}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="flex-1 px-6 py-4">
              {categories.map((category) => (
                <TabsContent
                  key={category}
                  value={category}
                  className="mt-0 h-full"
                >
                  <div className="grid grid-cols-5 gap-3">
                    {TEMPLATE_CATEGORIES[category].map((template) => (
                      <TemplateThumbnail
                        key={template.id}
                        template={template}
                        isSelected={
                          step === "left"
                            ? leftTemplate?.id === template.id
                            : rightTemplate?.id === template.id
                        }
                        onClick={() => handleTemplateSelect(template)}
                      />
                    ))}
                  </div>
                </TabsContent>
              ))}
            </ScrollArea>
          </Tabs>
        </div>

        {/* Footer with selected templates preview */}
        <div className="border-t px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Selected:</span>
              <div className="flex items-center gap-2">
                {/* Left page preview */}
                <div
                  className={cn(
                    "w-16 aspect-[99/70] border rounded flex items-center justify-center text-xs",
                    leftTemplate
                      ? "bg-blue-50 border-blue-300"
                      : "bg-gray-50 border-gray-200 text-gray-400"
                  )}
                >
                  {leftTemplate ? (
                    <div className="w-full h-full p-0.5 relative">
                      {leftTemplate.frames.length === 0 ? (
                        <div className="w-full h-full border border-dashed border-gray-300" />
                      ) : (
                        leftTemplate.frames.map((frame, idx) => (
                          <div
                            key={idx}
                            className="absolute bg-blue-200"
                            style={{
                              left: `${frame.x}%`,
                              top: `${frame.y}%`,
                              width: `${frame.width}%`,
                              height: `${frame.height}%`,
                            }}
                          />
                        ))
                      )}
                    </div>
                  ) : (
                    "L"
                  )}
                </div>
                {/* Right page preview */}
                <div
                  className={cn(
                    "w-16 aspect-[99/70] border rounded flex items-center justify-center text-xs",
                    rightTemplate
                      ? "bg-blue-50 border-blue-300"
                      : "bg-gray-50 border-gray-200 text-gray-400"
                  )}
                >
                  {rightTemplate ? (
                    <div className="w-full h-full p-0.5 relative">
                      {rightTemplate.frames.length === 0 ? (
                        <div className="w-full h-full border border-dashed border-gray-300" />
                      ) : (
                        rightTemplate.frames.map((frame, idx) => (
                          <div
                            key={idx}
                            className="absolute bg-blue-200"
                            style={{
                              left: `${frame.x}%`,
                              top: `${frame.y}%`,
                              width: `${frame.width}%`,
                              height: `${frame.height}%`,
                            }}
                          />
                        ))
                      )}
                    </div>
                  ) : (
                    "R"
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              {step === "left" ? (
                <Button
                  onClick={handleNext}
                  disabled={!leftTemplate}
                >
                  Next
                </Button>
              ) : (
                <Button
                  onClick={handleConfirm}
                  disabled={!rightTemplate}
                >
                  Add Spread
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
