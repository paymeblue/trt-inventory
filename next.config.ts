import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** pdfkit reads font metrics from disk — must not be webpack-bundled. */
  serverExternalPackages: ["pdfkit"],
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ??
      process.env.GOOGLE_MAPS_API_KEY ??
      "",
  },
};

export default nextConfig;
