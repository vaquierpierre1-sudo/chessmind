import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["stockfish"],
  outputFileTracingIncludes: {
    "/api/analyze": ["./node_modules/stockfish/bin/**"],
    "/api/bestmove": ["./node_modules/stockfish/bin/**"],
  },
};

export default nextConfig;
