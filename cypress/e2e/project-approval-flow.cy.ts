/// <reference types="cypress" />

/**
 * The critical lifecycle, end to end, across all four roles:
 *
 *   PM submits project
 *     → super-admin approves
 *     → PM is forced through the print-barcodes gate
 *     → logistics warehouse-verifies every box (no sticker UI) and
 *       approves the project for the PM
 *     → receiver still sees nothing until the PM creates an order
 *     → PM creates the delivery order
 *     → receiver verifies every box on site and the order fulfills
 *
 * Plus a super-admin override pass proving the admin can drive the
 * warehouse verification + activation steps alone.
 *
 * Prerequisites:
 *   1. npm run seed:e2e        (creates the four e2e role accounts)
 *   2. npm run dev             (app on http://localhost:3000)
 *   3. npm run e2e             (or e2e:open)
 */

const stamp = Date.now();
const projectName = `E2E Flow ${stamp}`;
const overrideProjectName = `E2E Override ${stamp}`;
const scanInputSelector =
  'input[placeholder="Scan or enter a barcode (e.g. TRT-ABC123DEF456)"]';

describe("project approval → print → verify → order → receive", () => {
  let projectId: string;
  let orderId: string;

  it("PM submits a new project and it waits on super-admin", () => {
    cy.loginAs("pm");
    cy.request("POST", "/api/projects", {
      name: projectName,
      description: "Created by the Cypress flow spec",
      items: [
        { sku: `E2E-A-${stamp}`, name: "E2E Box A", stockQuantity: 1 },
        { sku: `E2E-B-${stamp}`, name: "E2E Box B", stockQuantity: 1 },
      ],
    }).then((res) => {
      expect(res.status).to.eq(201);
      projectId = res.body.project.id;
      expect(res.body.project.approvalStatus).to.eq("pending_super_admin");
    });

    cy.visit("/projects");
    cy.contains(projectName).should("be.visible");
    cy.contains(projectName)
      .closest("li")
      .within(() => {
        cy.contains("Please contact Super admin for approval");
      });
  });

  it("projects list is sorted newest → oldest", () => {
    cy.loginAs("pm");
    cy.request("GET", "/api/projects").then((res) => {
      const dates = (res.body.projects as { createdAt: string }[]).map((p) =>
        new Date(p.createdAt).getTime(),
      );
      const sorted = [...dates].sort((a, b) => b - a);
      expect(dates).to.deep.eq(sorted);
      // The project we just created must be first.
      expect(res.body.projects[0].name).to.eq(projectName);
    });
  });

  it("super-admin approves the project for logistics", () => {
    cy.loginAs("super_admin");
    cy.visit("/approvals/super-admin");
    cy.contains("li", projectName).within(() => {
      cy.contains("button", "Approve → logistics").click();
    });
    cy.contains("Approve for logistics?").should("be.visible");
    cy.contains("button", "Yes, approve").click();

    cy.contains("Approve for logistics?").should("not.exist");
    cy.request(`/api/projects/${projectId}`)
      .its("body.project.approvalStatus")
      .should("eq", "pending_logistics");
  });

  it("PM is forced through the print-barcodes gate", () => {
    cy.loginAs("pm");
    cy.visit("/projects");

    // The large post-approval modal must block the PM until they go print.
    cy.contains(`“${projectName}” has been approved!`).should("be.visible");
    cy.contains("must print the barcodes").should("be.visible");
    cy.contains("a", "Print barcodes now").click();

    cy.url().should("include", `/projects/${projectId}/print-barcodes`);
    cy.contains(`Print barcodes — ${projectName}`).should("be.visible");
    cy.contains("E2E Box A").should("exist");
    cy.contains("E2E Box B").should("exist");

    // PM selects exactly which barcodes to print; the remaining count
    // decrements once the labels are recorded as printed.
    cy.contains("2 of 2 labels left to print").should("be.visible");
    cy.get('input[type="checkbox"]').should("have.length", 2);
    cy.get('input[type="checkbox"]').first().uncheck();
    cy.contains("button", "Print selected (1)").should("be.enabled");

    cy.window().then((win) => {
      cy.stub(win, "print").as("print");
    });
    cy.contains("button", "Print selected (1)").click();
    cy.get("@print").should("have.been.called");
    cy.window().then((win) =>
      win.dispatchEvent(new win.Event("afterprint")),
    );

    cy.contains("1 of 2 labels left to print").should("be.visible");
    cy.contains(/^Printed /).should("exist");
    cy.contains("button", "Print selected (1)").should("be.enabled");
  });

  it("receiver cannot see the project before any delivery order exists", () => {
    cy.loginAs("installer");
    cy.visit("/projects");
    cy.contains("Projects").should("be.visible");
    cy.contains(projectName).should("not.exist");
  });

  it("logistics verifies every box without any sticker UI, then approves", () => {
    cy.loginAs("logistics");

    cy.request(`/api/projects/${projectId}/logistics-gate`).then((res) => {
      const items = res.body.items as {
        barcode: string;
        printedScanToken?: string;
      }[];
      expect(items).to.have.length(2);
      // Logistics must never receive sticker tokens.
      for (const item of items) {
        expect(item.printedScanToken, "sticker token hidden from logistics").to
          .be.undefined;
      }

      cy.visit(`/projects/${projectId}/logistics-scan`);
      cy.contains(`Warehouse scan — ${projectName}`).should("be.visible");

      // Sticker UI must be gone from the logistics view.
      cy.contains("Packing stickers").should("not.exist");
      cy.contains("Open sticker URL").should("not.exist");
      cy.contains("Scan this box").should("not.exist");
      cy.contains("Print labels (1.5×1 in)").should("not.exist");
      cy.contains("Boxes to verify").should("be.visible");

      for (const item of items) {
        cy.get(scanInputSelector).clear().type(item.barcode);
        cy.contains("button", "Verify").click();
        cy.contains("Warehouse line verified").should("be.visible");
      }

      cy.contains("2/2").should("be.visible");
      cy.contains("Approve for PM to create order").should("be.visible");
      cy.contains("button", "Approve project").should("be.enabled").click();

      cy.url().should("include", "/approvals/logistics");
      cy.request(`/api/projects/${projectId}`)
        .its("body.project.approvalStatus")
        .should("eq", "active");
    });
  });

  it("receiver still cannot see the project until the PM creates an order", () => {
    cy.loginAs("installer");
    cy.visit("/projects");
    cy.contains("Projects").should("be.visible");
    cy.contains(projectName).should("not.exist");

    cy.request({
      url: `/api/projects/${projectId}`,
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });

  it("PM creates the delivery order on the activated project", () => {
    cy.loginAs("pm");
    cy.request("POST", "/api/orders", { projectId }).then((res) => {
      expect(res.status).to.eq(201);
      orderId = res.body.order.id;
    });
  });

  it("receiver now sees the project and fulfills the order, sticker-free", () => {
    cy.loginAs("installer");
    cy.visit("/projects");
    cy.contains(projectName).should("be.visible");

    cy.request(`/api/orders/${orderId}`).then((res) => {
      const items = res.body.items as {
        barcode: string;
        printedScanToken?: string;
      }[];
      expect(items).to.have.length(2);
      for (const item of items) {
        expect(item.printedScanToken, "sticker token hidden from receivers").to
          .be.undefined;
      }

      cy.visit(`/orders/${orderId}`);
      cy.contains("Print labels (1.5×1 in)").should("not.exist");

      for (const item of items) {
        cy.get(scanInputSelector).clear().type(item.barcode);
        cy.contains("button", "Verify").click();
        cy.contains(item.barcode)
          .closest("li")
          .contains("✓ Scanned")
          .should("be.visible");
      }

      cy.request(`/api/orders/${orderId}`)
        .its("body.order.status")
        .should("eq", "fulfilled");
    });
  });

  it("super-admin can override the whole warehouse step alone", () => {
    let overrideId: string;

    cy.loginAs("pm");
    cy.request("POST", "/api/projects", {
      name: overrideProjectName,
      items: [{ sku: `E2E-OVR-${stamp}`, name: "Override Box", stockQuantity: 1 }],
    }).then((res) => {
      overrideId = res.body.project.id;
    });

    cy.loginAs("super_admin").then(() => {
      cy.request("POST", `/api/projects/${overrideId}/approval`, {
        action: "super_admin_approve",
      });

      // Super-admin still sees sticker tokens (they may print).
      cy.request(`/api/projects/${overrideId}/logistics-gate`).then((gate) => {
        const items = gate.body.items as {
          barcode: string;
          printedScanToken?: string;
        }[];
        expect(items).to.have.length(1);
        expect(items[0].printedScanToken).to.be.a("string");

        // Override: super-admin performs the warehouse scans…
        for (const item of items) {
          cy.request(
            "POST",
            `/api/projects/${overrideId}/logistics-gate/scan`,
            { barcode: item.barcode },
          )
            .its("status")
            .should("eq", 200);
        }
        // …and the activation that normally belongs to logistics.
        cy.request("POST", `/api/projects/${overrideId}/approval`, {
          action: "logistics_fulfill",
        })
          .its("status")
          .should("eq", 200);

        cy.request(`/api/projects/${overrideId}`)
          .its("body.project.approvalStatus")
          .should("eq", "active");
      });
    });
  });

  it("logistics cannot fulfill a delivery order (receiver-only)", () => {
    cy.loginAs("logistics");
    cy.request({
      method: "POST",
      url: `/api/orders/${orderId}/scan`,
      body: { barcode: "TRT-ANYTHING" },
      failOnStatusCode: false,
    })
      .its("status")
      .should("eq", 403);
  });
});
