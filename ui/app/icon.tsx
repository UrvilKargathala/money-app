import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Brand mark: blue rounded square with a white "M", matching the topbar logo.
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
          background: "#2563EB",
          borderRadius: "22%",
          fontSize: 300,
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
