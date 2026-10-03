import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// ImageResponse cannot read Tailwind classes or CSS variables, so the brand
// hex values (see globals.css) are repeated here.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#13804F",
          borderRadius: 8,
          color: "#ffffff",
          fontSize: 22,
          fontWeight: 900,
        }}
      >
        g<span style={{ color: "#FF7A6B" }}>!</span>
      </div>
    ),
    { ...size },
  );
}
