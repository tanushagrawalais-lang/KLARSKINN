import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm text-ink">
      <span className="font-medium tracking-wide">{label}</span>
      {children}
      {hint ? <span className="text-xs text-ink-soft">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 rounded-sm border border-ink/15 bg-paper-3 px-3 text-base text-ink outline-none transition focus:border-gold ${props.className ?? ""}`}
    />
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center rounded-sm bg-forest px-5 text-sm font-semibold tracking-wide text-paper transition hover:bg-forest-deep disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex h-11 items-center justify-center rounded-sm border border-ink/15 bg-transparent px-4 text-sm font-medium text-ink transition hover:border-gold hover:bg-paper-3 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <p role="alert" className="rounded-sm border border-clay/30 bg-clay/10 px-3 py-2 text-sm text-clay">
      {message}
    </p>
  );
}

export function AuthCard({
  kicker,
  title,
  children,
  footer,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md rounded-sm border border-ink/10 bg-paper-3/90 p-8 shadow-lift">
      <p className="text-xs uppercase tracking-[0.28em] text-gold">{kicker}</p>
      <h1 className="mt-3 font-serif text-3xl text-forest">{title}</h1>
      <div className="mt-8 flex flex-col gap-5">{children}</div>
      {footer ? <div className="mt-6 text-sm text-ink-soft">{footer}</div> : null}
    </div>
  );
}
