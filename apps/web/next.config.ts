import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The design-tokens workspace package ships TypeScript source.
  transpilePackages: ["@statesync/design-tokens"],
};

export default config;
