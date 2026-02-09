import { loadConfig } from "../src/config/io.js";
import { collectConfigEnvVars } from "../src/config/env-vars.js";

/**
 * Escapes a string for use in a shell 'single-quoted' string.
 * This handles internal single quotes by closing the quote, 
 * adding an escaped single quote, and reopening the quote.
 */
function shellEscape(s: string) {
  //return "'" + s.replace(/'/g, "'\\''") + "'";
  return s.replace(/'/g, "'\\''");
}

try {
  // Load the configuration using the gateway's standard loader
  const config = loadConfig();
  
  // Extract environment variables defined in the configuration
  const envVars = collectConfigEnvVars(config);

  // Print each variable as an export command
  for (const [key, value] of Object.entries(envVars)) {
    process.stdout.write(`${key}=${shellEscape(value)}\n`);
  }
} catch (error) {
  console.error("Failed to load config for environment export:", error);
  process.exit(1);
}
