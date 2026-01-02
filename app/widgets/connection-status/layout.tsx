// app/widgets/connection-status/layout.tsx
import { Suspense } from "react";

export const metadata = {
  title: "Connection Status - Meeting Intelligence",
};

export default function ConnectionStatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "transparent" }}>
        <Suspense fallback={
          <div style={{ 
            padding: "40px", 
            textAlign: "center", 
            color: "#888",
            fontFamily: "system-ui, sans-serif"
          }}>
            Loading...
          </div>
        }>
          {children}
        </Suspense>
      </body>
    </html>
  );
}

