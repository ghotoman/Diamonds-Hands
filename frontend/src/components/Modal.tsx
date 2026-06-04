import type { ReactNode } from "react";

/// Bottom sheet modal (mobile).
export function Modal({
  open,
  onClose,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  dismissable?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 animate-[fade_.18s_ease-out]"
        onClick={dismissable ? onClose : undefined}
      />
      <div className="relative w-full bg-white rounded-t-[24px] shadow-modal px-5 pt-3 pb-7 animate-[sheet_.24s_cubic-bezier(.2,.8,.2,1)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {children}
      </div>
    </div>
  );
}
