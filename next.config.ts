import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    const fileLoaderRule = config.module.rules.find(
      (rule: { test?: RegExp; issuer?: RegExp }) =>
        rule?.test instanceof RegExp && rule.test.test(".svg")
    );

    if (fileLoaderRule && "exclude" in fileLoaderRule) {
      const currentExclude = fileLoaderRule.exclude;
      fileLoaderRule.exclude = Array.isArray(currentExclude)
        ? [...currentExclude, /\.svg$/i]
        : currentExclude
          ? [currentExclude, /\.svg$/i]
          : /\.svg$/i;
    }

    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: ["@svgr/webpack"],
    });
    return config;
  },
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
