import Link from "next/link";

export function BrandMark({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} className="inline-flex items-baseline gap-2 no-underline">
      <span
        className={`font-serif text-2xl tracking-[0.18em] ${inverted ? "text-paper" : "text-forest"}`}
      >
        KLARSINN
      </span>
    </Link>
  );
}
