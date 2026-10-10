import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon: same brand mark, no rounded mask (iOS applies its own).
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#2563EB",
          fontSize: 108,
          fontWeight: 800,
          color: "#FFFFFF",
          fontFamily: "Arial, sans-serif",
        }}
      >
        M
      </div>
    ),
    { ...size }
  );
}
