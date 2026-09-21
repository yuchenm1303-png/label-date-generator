import type { CSSProperties } from "react";

type Props = {
  src: string;
  size?: number;
  className?: string;
  alt?: string;
  decorative?: boolean;
};

export function MediaIcon({
  src,
  size = 48,
  className = "",
  alt = "",
  decorative = true,
}: Props) {
  return (
    <span
      className={`media-icon ${className}`.trim()}
      style={{ "--media-icon-size": `${size}px` } as CSSProperties}
      aria-hidden={decorative ? true : undefined}
    >
      <img
        className="media-icon-image"
        src={src}
        alt={decorative ? "" : alt}
        draggable={false}
      />
    </span>
  );
}
