 "use client";

 import { createContext, useCallback, useContext, useMemo, useState } from "react";

 type ToastType = "success" | "error" | "info" | "warning";

 type Toast = {
   id: string;
   type: ToastType;
   title: string;
   message?: string;
 };

 type ToastContextValue = {
   pushToast: (toast: Omit<Toast, "id">) => void;
 };

 const ToastContext = createContext<ToastContextValue | null>(null);

 const typeStyles: Record<ToastType, string> = {
   success: "border-[color:var(--success)] text-[var(--success)]",
   error: "border-[color:var(--danger)] text-[var(--danger)]",
   warning: "border-[color:var(--warning)] text-[var(--warning)]",
   info: "border-[color:var(--primary)] text-[var(--primary)]",
 };

 export function ToastProvider({ children }: { children: React.ReactNode }) {
   const [toasts, setToasts] = useState<Toast[]>([]);

   const pushToast = useCallback((toast: Omit<Toast, "id">) => {
     const id = crypto.randomUUID();
     setToasts((prev) => [...prev, { ...toast, id }]);
     setTimeout(() => {
       setToasts((prev) => prev.filter((item) => item.id !== id));
     }, 3500);
   }, []);

   const value = useMemo(() => ({ pushToast }), [pushToast]);

   return (
     <ToastContext.Provider value={value}>
       {children}
       <div className="fixed right-4 top-4 z-50 flex w-[min(360px,90vw)] flex-col gap-3">
         {toasts.map((toast) => (
           <div key={toast.id} className={`psp-toast ${typeStyles[toast.type]}`}>
             <div className="flex-1">
               <p className="text-sm font-semibold text-[var(--ink)]">
                 {toast.title}
               </p>
               {toast.message ? (
                 <p className="text-xs text-[var(--muted-foreground)]">
                   {toast.message}
                 </p>
               ) : null}
             </div>
             <span className="text-xs font-semibold">{toast.type.toUpperCase()}</span>
           </div>
         ))}
       </div>
     </ToastContext.Provider>
   );
 }

 export function useToast() {
   const ctx = useContext(ToastContext);
   if (!ctx) {
     throw new Error("useToast must be used within ToastProvider");
   }
   return ctx;
 }
