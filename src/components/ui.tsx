"use client";
import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
export function Button({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`button ${className}`} {...props} />;
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function ProgressStatus({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="notice">
      {children}
    </div>
  );
}
export function Dialog({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open) ref.current?.close();
  }, [open]);
  return (
    <dialog ref={ref} onCancel={onClose} onClose={onClose} aria-label={title}>
      <h2>{title}</h2>
      {children}
      <Button className="secondary" onClick={onClose}>
        Cancel
      </Button>
    </dialog>
  );
}
