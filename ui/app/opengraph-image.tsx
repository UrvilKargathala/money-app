import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "MoneyMind - Personal Finance Manager";

// Social share card: black theme with the blue brand mark + tagline.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 48,
          background: "#000000",
          padding: "0 96px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: 176,
            height: 176,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#2563EB",
            borderRadius: 40,
            fontSize: 104,
            fontWeight: 800,
            color: "#FFFFFF",
          }}
        >
          M
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#EAF1FF" }}>
            MoneyMind
          </div>
          <div style={{ fontSize: 36, color: "#B9C7DE" }}>
            Take control of your finances
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
