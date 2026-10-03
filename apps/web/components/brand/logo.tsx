type LogoProps = {
  size?: "sm" | "md" | "lg";
  // "on-dark" is for green or ink backgrounds, where the word must be white.
  variant?: "default" | "on-dark";
};

const textSizes = {
  sm: "text-xl",
  md: "text-3xl",
  lg: "text-5xl",
};

// The "gbam!" wordmark: Fraunces black, with a coral exclamation mark.
export function Logo({ size = "md", variant = "default" }: LogoProps) {
  let wordColor = "text-ink";
  if (variant === "on-dark") {
    wordColor = "text-white";
  }

  return (
    <span
      aria-label="Gbam"
      role="img"
      className={`font-display inline-block font-black leading-none ${textSizes[size]}`}
    >
      <span data-word className={wordColor} aria-hidden="true">
        gbam
      </span>
      <span data-bang className="text-coral" aria-hidden="true">
        !
      </span>
    </span>
  );
}

// The "g!" app tile: white "g" and coral "!" on a green rounded square.
export function LogoIcon({ size }: { size: number }) {
  return (
    <span
      aria-label="Gbam"
      role="img"
      className="font-display bg-brand inline-flex items-center justify-center font-black leading-none text-white"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        fontSize: size * 0.6,
      }}
    >
      <span aria-hidden="true">g</span>
      <span className="text-coral" aria-hidden="true">
        !
      </span>
    </span>
  );
}
