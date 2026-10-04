import { ImageResponse } from "next/og";

export const alt = "Gbam: take orders and get paid on WhatsApp";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ImageResponse cannot read Tailwind classes or CSS variables, so the brand hex values
// (see globals.css) are repeated here.
export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: "#13804F",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", fontSize: 120, fontWeight: 900 }}>
        gbam<span style={{ color: "#FF7A6B" }}>!</span>
      </div>
      <div style={{ display: "flex", fontSize: 64, fontWeight: 700, marginTop: 24 }}>
        Take orders and get paid on WhatsApp.
      </div>
      <div style={{ display: "flex", fontSize: 32, marginTop: 32, color: "#DCEFE5" }}>gbam.app</div>
    </div>,
    { ...size },
  );
}
