import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Review Forge — App Store 评测 → PRD → 测试用例",
  description:
    "Vibe-coding demo: collect App Store reviews, run model-driven semantic analysis, draft a PRD and traceable test cases — all in one workflow.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
