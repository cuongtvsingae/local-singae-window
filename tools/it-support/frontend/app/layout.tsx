import "./globals.css";
import type { ReactNode } from "react";
import AuthGate from "./_components/AuthGate";

export const metadata = {
  title: "PHÒNG IT - SINGAE",
  description: "IT task management and AI assistant",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthGate />
        {children}
      </body>
    </html>
  );
}

