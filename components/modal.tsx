 "use client";

 type ModalProps = {
   open: boolean;
   title: string;
   children: React.ReactNode;
   onClose: () => void;
 };

 export function Modal({ open, title, children, onClose }: ModalProps) {
   if (!open) return null;

   return (
     <div className="fixed inset-0 z-50 flex items-center justify-center">
       <div
         className="absolute inset-0 bg-black/40"
         onClick={onClose}
         aria-hidden="true"
       />
       <div className="relative z-10 w-[min(520px,92vw)] rounded-[16px] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
         <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
           <h3 className="text-base font-semibold">{title}</h3>
           <button
             type="button"
             className="psp-button psp-button-ghost h-8 px-3 text-xs"
             onClick={onClose}
           >
             Close
           </button>
         </div>
         <div className="pt-3">{children}</div>
       </div>
     </div>
   );
 }
