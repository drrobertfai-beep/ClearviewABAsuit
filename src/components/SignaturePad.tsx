// ClearView ABA Suite — Canvas-based Signature Pad
// Captures mouse/touch signatures and exports as base64 PNG.
import { useRef, useEffect, useState, useCallback } from "react";

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  width?: number;
  height?: number;
  preview?: string | null;
}

export function SignaturePad({
  onSave,
  width = 500,
  height = 200,
  preview,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [savedDataUrl, setSavedDataUrl] = useState<string | null>(preview ?? null);

  // Refs to track drawing state without re-renders
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas context
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e3a5f";
    ctxRef.current = ctx;

    // If we have a preview, draw it
    if (preview && !savedDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setHasContent(true);
        setSavedDataUrl(preview);
      };
      img.src = preview;
    }
  }, [width, height, preview]);

  const getPos = useCallback(
    (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const scaleX = width / rect.width;
      const scaleY = height / rect.height;

      if ("touches" in e) {
        const touch = e.touches[0];
        return {
          x: (touch.clientX - rect.left) * scaleX,
          y: (touch.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [width, height],
  );

  const startDrawing = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const ctx = ctxRef.current;
      if (!ctx) return;

      const pos = getPos(e);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      lastPosRef.current = pos;
      setIsDrawing(true);
      setHasContent(true);
      setSavedDataUrl(null);
    },
    [getPos],
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      if (!isDrawing) return;

      const ctx = ctxRef.current;
      if (!ctx) return;

      // For smoother lines, use interpolation
      const pos = getPos(e);
      const last = lastPosRef.current;
      if (last) {
        const midX = (last.x + pos.x) / 2;
        const midY = (last.y + pos.y) / 2;
        ctx.quadraticCurveTo(last.x, last.y, midX, midY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX, midY);
      } else {
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
      }
      lastPosRef.current = pos;
    },
    [isDrawing, getPos],
  );

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.closePath();
    }
    setIsDrawing(false);
    lastPosRef.current = null;
  }, [isDrawing]);

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctxRef.current = ctx;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e3a5f";
    setHasContent(false);
    setSavedDataUrl(null);
  }, []);

  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return;
    const dataUrl = canvas.toDataURL("image/png");
    setSavedDataUrl(dataUrl);
    onSave(dataUrl);
  }, [hasContent, onSave]);

  return (
    <div className="space-y-3">
      {/* Canvas area */}
      <div className="relative rounded-lg border-2 border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          className="touch-none block w-full cursor-crosshair rounded-lg"
          style={{ maxWidth: "100%", height: "auto" }}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
        {!hasContent && !savedDataUrl && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400 select-none">
            Draw your signature here
          </div>
        )}
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasContent && !savedDataUrl}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!hasContent}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Confirm Signature
        </button>
      </div>

      {/* Preview */}
      {savedDataUrl && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-xs font-medium text-green-700 mb-2">✓ Signature captured</p>
          <img
            src={savedDataUrl}
            alt="Captured signature"
            className="max-h-16 rounded border border-gray-200 bg-white"
          />
        </div>
      )}
    </div>
  );
}
