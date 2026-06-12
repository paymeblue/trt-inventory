/// <reference types="cypress" />

export type E2eRole = "pm" | "super_admin" | "logistics" | "installer";

export const E2E_PASSWORD = "E2ePassword123!";

export const E2E_ACCOUNTS: Record<E2eRole, { email: string; name: string }> = {
  pm: { email: "e2e-pm@trt.local", name: "E2E PM" },
  super_admin: { email: "e2e-admin@trt.local", name: "E2E Super Admin" },
  logistics: { email: "e2e-logistics@trt.local", name: "E2E Logistics" },
  installer: { email: "e2e-receiver@trt.local", name: "E2E Receiver" },
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Replace the current session cookie with the given role's. */
      loginAs(role: E2eRole): Chainable<void>;
    }
  }
}

Cypress.Commands.add("loginAs", (role: E2eRole) => {
  cy.request("POST", "/api/auth/logout", {});
  cy.request("POST", "/api/auth/login", {
    email: E2E_ACCOUNTS[role].email,
    password: E2E_PASSWORD,
  })
    .its("status")
    .should("eq", 200);
});

export {};
