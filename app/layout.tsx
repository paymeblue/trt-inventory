import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth-guard";
import { getSessionUser } from "@/lib/session-user";
import { themeBootstrapScript } from "@/lib/theme";
import { SessionProvider } from "@/components/session-context";
import { ThemeProvider } from "@/components/theme-context";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Order Management & Verification System",
  description:
    "Barcode-driven order creation, fulfillment, and verification for PMs and Installers.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const actor = await getCurrentUser();
  const user = actor ? await getSessionUser(actor) : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Inline theme bootstrap — runs before first paint so the page
         * never flashes the wrong palette on refresh. */}
        <script
          dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
        />
      </head>
      <body className="min-h-full" suppressHydrationWarning>
        <ThemeProvider>
          <SessionProvider initialUser={user}>
            {user ? (
              <div className="flex min-h-screen">
                <Sidebar />
                <div className="flex flex-1 flex-col">
                  <Topbar />
                  <main className="flex-1 px-6 py-6 md:px-10 md:py-8">
                    {children}
                  </main>
                </div>
              </div>
            ) : (
              children
            )}
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
