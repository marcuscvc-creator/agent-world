import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/app/components/Sidebar";

export const metadata: Metadata = {
  title: "Agent World",
  description: "A real-world autonomous AI business simulator with human approval gates."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="flex h-screen w-full overflow-hidden bg-[#0d0f1a] text-[#f7f1dc]">
        <Sidebar />
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
