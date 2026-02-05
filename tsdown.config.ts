import { defineConfig } from "tsdown";

const env = {
  NODE_ENV: "production",
};

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/entry.ts",
    "src/plugin-sdk/index.ts",
    "src/extensionAPI.ts",
  ],
  outDir: "dist",
  clean: true,
  dts: true,
  env,
  fixedExtension: false,
  platform: "node",
  external: [/^@reflink/],
});
