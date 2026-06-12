import "./commands";

/**
 * Cypress proxies the app and injects its own <script> into <head>,
 * which shifts the inline theme script and trips React's hydration
 * comparison. The app recovers by regenerating the tree client-side and
 * shows no such error in a plain browser (verified with Playwright), so
 * only hydration mismatches are ignored — every other application error
 * still fails the test.
 */
Cypress.on("uncaught:exception", (err) => {
  if (
    /hydration/i.test(err.message) ||
    /Minified React error #(418|423|425)/.test(err.message)
  ) {
    return false;
  }
  return undefined;
});
