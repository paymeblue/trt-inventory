import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL ?? "http://localhost:3000",
    supportFile: "cypress/support/e2e.ts",
    specPattern: "cypress/e2e/**/*.cy.ts",
    video: false,
    // The flow spec walks one project through four roles in order, so
    // retries must re-run the whole spec, not a single hook.
    testIsolation: false,
    defaultCommandTimeout: 10000,
  },
});
