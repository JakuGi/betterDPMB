import { GET } from "./pwa-icon/[size]/route";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return GET(new Request("http://x/pwa-icon/180"), { params: Promise.resolve({ size: "180" }) });
}
