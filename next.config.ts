import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const isDesktopBuild = process.env.NEXT_OUTPUT === "export";
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

export default function createNextConfig(phase: string): NextConfig {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
    ...(isDesktopBuild
      ? {
          assetPrefix:
            process.env.NODE_ENV === "production"
              ? undefined
              : `http://${internalHost}:3000`,
          images: {
            unoptimized: true,
          },
          output: "export" as const,
          typescript: {
            tsconfigPath: "tsconfig.desktop.json",
          },
        }
      : {}),
  };
}
