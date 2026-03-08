 "use client";

 import { useEffect, useState } from "react";
 import { Button } from "@/components/ui/button";

 type ConfirmButtonProps = {
   label: string;
   confirmLabel?: string;
   onConfirm: () => void;
   className?: string;
   confirmClassName?: string;
   disabled?: boolean;
   variant?: React.ComponentProps<typeof Button>["variant"];
   style?: React.CSSProperties;
 };

 export function ConfirmButton({
   label,
   confirmLabel = "CONFIRM?",
   onConfirm,
   className,
   confirmClassName,
   disabled,
   variant = "default",
   style,
 }: ConfirmButtonProps) {
   const [armed, setArmed] = useState(false);

   useEffect(() => {
     if (!armed) return;
     const timer = setTimeout(() => setArmed(false), 2500);
     return () => clearTimeout(timer);
   }, [armed]);

   const handleClick = () => {
     if (disabled) return;
     if (!armed) {
       setArmed(true);
       return;
     }
     setArmed(false);
     onConfirm();
   };

   const baseClass = className ?? "";
   const classWhenArmed = baseClass.replace(/\bpsp-button-lodge\b/g, "").trim();

   /* Estado inicial "Lodge Record": botón nativo azul para clic fiable y texto blanco */
   if (!armed) {
     return (
       <button
         type="button"
         onClick={handleClick}
         disabled={disabled}
         className="psp-lodge-record-wrap psp-button-lodge flex min-h-11 w-full cursor-pointer items-center justify-center rounded-full border-0 !bg-[#556F87] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
         style={{
           backgroundColor: "#556F87",
           color: "#ffffff",
           WebkitTextFillColor: "#ffffff",
         }}
       >
         {label}
       </button>
     );
   }

   /* CONFIRM? / otros estados: botón normal con confirmClassName (amarillo, etc.) */
   return (
     <Button
       type="button"
       variant={variant}
       onClick={handleClick}
       disabled={disabled}
       className={`${classWhenArmed} ${confirmClassName ?? ""}`.trim()}
     >
       {confirmLabel}
     </Button>
   );
 }
