"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, children, close, wide = false, closeDisabled = false }: {
  title: string;
  children: ReactNode | ((dismiss: () => void) => ReactNode);
  close: () => void;
  wide?: boolean;
  closeDisabled?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);

  function dismiss() {
    const dialog = ref.current;
    if (closeDisabled || !dialog?.open || dialog.hasAttribute("data-closing")) return;
    dialog.setAttribute("data-closing", "");
    if (content.current) content.current.inert = true;

    const finish = () => {
      if (ref.current !== dialog) return;
      dialog.close();
      close();
    };

    const animations = dialog.getAnimations?.() ?? [];
    if (animations.length) {
      void Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
    } else {
      finish();
    }
  }

  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClick={(event) => { if (event.currentTarget === event.target) dismiss(); }}
    >
      <div className="modal-content" ref={content}>
        <header className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label="关闭" onClick={dismiss} disabled={closeDisabled}><X size={19} /></button>
        </header>
        {typeof children === "function" ? children(dismiss) : children}
      </div>
    </dialog>
  );
}
