 "use client";

 import { useEffect, useMemo, useRef, useState } from "react";
 import { Button } from "@/components/ui/button";

 export type SignatureStrokes = {
   version: 1;
   canvas: { w: number; h: number };
   strokes: Array<Array<{ x: number; y: number; t: number }>>;
 };

 type SignaturePadProps = {
   width?: number;
   height?: number;
   onSave: (payload: SignatureStrokes) => void;
   onCancel: () => void;
 };

 export function SignaturePad({
   width = 480,
   height = 180,
   onSave,
   onCancel,
 }: SignaturePadProps) {
   const canvasRef = useRef<HTMLCanvasElement | null>(null);
   const [strokes, setStrokes] = useState<SignatureStrokes["strokes"]>([]);
   const [isDrawing, setIsDrawing] = useState(false);

   const size = useMemo(() => ({ w: width, h: height }), [height, width]);

   useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext("2d");
     if (!ctx) return;
     ctx.clearRect(0, 0, canvas.width, canvas.height);
     ctx.lineWidth = 2.2;
     ctx.lineCap = "round";
     ctx.strokeStyle = "#111827";
     strokes.forEach((stroke) => {
       if (!stroke.length) return;
       ctx.beginPath();
       stroke.forEach((point, idx) => {
         const x = point.x * canvas.width;
         const y = point.y * canvas.height;
         if (idx === 0) ctx.moveTo(x, y);
         else ctx.lineTo(x, y);
       });
       ctx.stroke();
     });
   }, [strokes]);

   const getPoint = (event: PointerEvent | React.PointerEvent) => {
     const canvas = canvasRef.current;
     if (!canvas) return null;
     const rect = canvas.getBoundingClientRect();
     const x = (event.clientX - rect.left) / rect.width;
     const y = (event.clientY - rect.top) / rect.height;
     return {
       x: Math.max(0, Math.min(1, x)),
       y: Math.max(0, Math.min(1, y)),
       t: Date.now(),
     };
   };

   const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
     event.preventDefault();
     const point = getPoint(event);
     if (!point) return;
     setIsDrawing(true);
     setStrokes((prev) => [...prev, [point]]);
   };

   const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
     if (!isDrawing) return;
     const point = getPoint(event);
     if (!point) return;
     setStrokes((prev) => {
       const updated = [...prev];
       updated[updated.length - 1] = [...updated[updated.length - 1], point];
       return updated;
     });
   };

   const handlePointerUp = () => {
     setIsDrawing(false);
   };

   const handleClear = () => {
     setStrokes([]);
   };

   const handleSave = () => {
     onSave({
       version: 1,
       canvas: size,
       strokes,
     });
   };

   return (
     <div className="space-y-3">
       <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-2">
         <canvas
           ref={canvasRef}
           width={size.w}
           height={size.h}
           className="h-[180px] w-full touch-none rounded-[10px] bg-white"
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerLeave={handlePointerUp}
         />
       </div>
       <div className="flex flex-wrap gap-2">
         <Button
           type="button"
           variant="ghost"
           size="sm"
           className="psp-button psp-button-ghost h-10 px-4 text-xs"
           onClick={handleClear}
         >
           Clear
         </Button>
         <Button
           type="button"
           size="sm"
           className="psp-button psp-button-primary h-10 px-4 text-xs"
           onClick={handleSave}
           disabled={strokes.length === 0}
         >
           Save
         </Button>
         <Button
           type="button"
           variant="ghost"
           size="sm"
           className="psp-button psp-button-ghost h-10 px-4 text-xs"
           onClick={onCancel}
         >
           Cancel
         </Button>
       </div>
     </div>
   );
 }

 export function SignaturePreview({
   strokes,
   height = 80,
 }: {
   strokes: SignatureStrokes | null;
   height?: number;
 }) {
   const canvasRef = useRef<HTMLCanvasElement | null>(null);

   useEffect(() => {
     const canvas = canvasRef.current;
     if (!canvas) return;
     const ctx = canvas.getContext("2d");
     if (!ctx) return;
     ctx.clearRect(0, 0, canvas.width, canvas.height);
     if (!strokes) return;
     ctx.lineWidth = 2;
     ctx.lineCap = "round";
     ctx.strokeStyle = "#111827";
     strokes.strokes.forEach((stroke) => {
       if (!stroke.length) return;
       ctx.beginPath();
       stroke.forEach((point, idx) => {
         const x = point.x * canvas.width;
         const y = point.y * canvas.height;
         if (idx === 0) ctx.moveTo(x, y);
         else ctx.lineTo(x, y);
       });
       ctx.stroke();
     });
   }, [strokes]);

   return (
     <canvas
       ref={canvasRef}
       width={420}
       height={height}
       className="h-[80px] w-full rounded-[10px] border border-[var(--border)] bg-white"
     />
   );
 }
