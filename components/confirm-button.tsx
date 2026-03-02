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
 };

 export function ConfirmButton({
   label,
   confirmLabel = "CONFIRM?",
   onConfirm,
   className,
  confirmClassName,
   disabled,
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

   return (
     <Button
       type="button"
       onClick={handleClick}
       disabled={disabled}
       className={`${className ?? ""} ${armed ? confirmClassName ?? "" : ""}`}
     >
       {armed ? confirmLabel : label}
     </Button>
   );
 }
