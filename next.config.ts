import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Nonaktifkan optimizer agar foto dari Supabase Storage selalu tampil di
    // Vercel (menghindari kegagalan /_next/image untuk host publik).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
