"use client";

import { useEffect, useRef, useState } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage } from "react-konva";
import type { PxRect, SheetPlacement } from "@/lib/exporter/types";
import { DPI } from "@/lib/packing/rectPacker";

interface WorkspaceCanvasProps {
  /** Inches. */
  sheetWidth: number;
  sheetHeight: number;
  /** Distance from the sheet edge to the artwork safe area, in inches. */
  safeMargin: number;
  /** Registration marks, in 300 DPI sheet px. */
  marks: readonly PxRect[];
  placements: readonly SheetPlacement[];
  /** Shown in the size badge, e.g. "Sheet 2". */
  label?: string;
}

/** Screen pixels of breathing room around the sheet. */
const VIEW_PADDING = 32;

export default function WorkspaceCanvas({ sheetWidth, sheetHeight, safeMargin, marks, placements, label }: WorkspaceCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Everything inside the sheet group is drawn in 300 DPI sheet pixels, then scaled to fit the view.
  const sheetW = sheetWidth * DPI;
  const sheetH = sheetHeight * DPI;
  const safePx = safeMargin * DPI;
  const scale = Math.max(
    0,
    Math.min((size.width - VIEW_PADDING * 2) / sheetW, (size.height - VIEW_PADDING * 2) / sheetH),
  );
  const offsetX = (size.width - sheetW * scale) / 2;
  const offsetY = (size.height - sheetH * scale) / 2;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden">
      {size.width > 0 && size.height > 0 && (
        <Stage width={size.width} height={size.height}>
          <Layer listening={false}>
            <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
              <Rect
                width={sheetW}
                height={sheetH}
                fill="#ffffff"
                shadowColor="#000000"
                shadowOpacity={0.18}
                shadowBlur={24 / Math.max(scale, 1e-3)}
                shadowOffsetY={4 / Math.max(scale, 1e-3)}
              />
              <Rect
                x={safePx}
                y={safePx}
                width={sheetW - safePx * 2}
                height={sheetH - safePx * 2}
                stroke="#60a5fa"
                strokeWidth={1}
                dash={[6, 4]}
                strokeScaleEnabled={false}
              />
              {marks.map((m, i) => (
                <Rect key={i} x={m.x} y={m.y} width={m.width} height={m.height} fill="#000000" />
              ))}
              {placements.map((p) => (
                <Group key={p.key}>
                  <KonvaImage
                    image={p.image}
                    // Konva rotates clockwise about (x, y); shift right by the placed width
                    // so a 90° rotated image lands inside its packed rectangle.
                    x={p.rotated ? p.x + p.width : p.x}
                    y={p.y}
                    width={p.rotated ? p.height : p.width}
                    height={p.rotated ? p.width : p.height}
                    rotation={p.rotated ? 90 : 0}
                  />
                  <Rect
                    x={p.x}
                    y={p.y}
                    width={p.width}
                    height={p.height}
                    stroke="#f43f5e"
                    strokeWidth={0.75}
                    opacity={0.6}
                    strokeScaleEnabled={false}
                  />
                </Group>
              ))}
            </Group>
          </Layer>
        </Stage>
      )}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white/80 px-3 py-1 text-xs text-zinc-600 shadow-sm ring-1 ring-zinc-200">
        {label && `${label} · `}
        {sheetWidth} × {sheetHeight} in · Silhouette marks
      </div>
    </div>
  );
}
