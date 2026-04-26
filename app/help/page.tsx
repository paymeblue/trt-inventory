"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuthedUser } from "@/components/session-context";

type RoleTab = "pm" | "installer";

export default function HelpPage() {
  const user = useAuthedUser();
  const [tab, setTab] = useState<RoleTab>(user?.role ?? "pm");

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">How it works</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Stupid-simple walk-throughs for project managers and installers.
          Pick your role and follow the steps. For enforced API and inventory
          rules, see{" "}
          <Link
            href="/help/constraints"
            className="font-semibold text-[color:var(--primary)] hover:underline"
          >
            Rules & constraints
          </Link>
          .
        </p>
      </div>

      <div
        className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-1 text-xs font-semibold"
        role="tablist"
      >
        {(["pm", "installer"] as RoleTab[]).map((r) => (
          <button
            key={r}
            role="tab"
            aria-selected={tab === r}
            onClick={() => setTab(r)}
            className={`rounded-full px-4 py-1.5 transition-colors ${
              tab === r
                ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                : "text-[color:var(--text-muted)]"
            }`}
          >
            {r === "pm" ? "Project Manager" : "Installer"}
          </button>
        ))}
      </div>

      {tab === "pm" ? <PmGuide /> : <InstallerGuide />}

      <section className="card p-6">
        <h2 className="text-base font-semibold">Quick reference</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Def term="Barcode">
            A unique CODE128 label generated per order item (e.g.
            <span className="font-mono"> TRT-AB12CD34EF56</span>).
          </Def>
          <Def term="Project">
            The top-level container. Every item and every order belongs to
            one project; items cannot be shared across projects.
          </Def>
          <Def term="Item / SKU">
            A product identifier scoped to a project. Manage them from the
            project&apos;s detail page under{" "}
            <Link
              href="/projects"
              className="text-[color:var(--primary)] underline"
            >
              Projects
            </Link>
            .
          </Def>
          <Def term="Order">
            A collection of items from one project, shipped out as a
            delivery to be verified on-site.
          </Def>
          <Def term="Active">
            An order that is ready to be verified on-site.
          </Def>
          <Def term="Fulfilled">
            Every item in the order has been verified. The project&apos;s
            item stock was decremented accordingly.
          </Def>
          <Def term="Anomaly">
            The order received an unexpected barcode. Still verifiable, but
            flagged for review.
          </Def>
        </dl>
      </section>
    </div>
  );
}

function PmGuide() {
  const steps: Step[] = [
    {
      title: "Create a project",
      body: (
        <>
          Go to{" "}
          <Link
            href="/projects"
            className="text-[color:var(--primary)] underline"
          >
            Projects
          </Link>
          , hit <b>+ New project</b>, give it a name, and add the items
          (SKUs) it will track. Items belong to this project alone — they
          can never be reused by another project.
        </>
      ),
    },
    {
      title: "Invite your installers",
      body: (
        <>
          On the{" "}
          <Link href="/team" className="text-[color:var(--primary)] underline">
            Team
          </Link>{" "}
          page, create an account for each installer. Share their email and
          temporary password privately.
        </>
      ),
    },
    {
      title: "Create an order under the project",
      body: (
        <>
          Hit <b>+ New Order</b>, pick the project, and open it. Add one
          SKU at a time from the project&apos;s items — each one gets its
          own printable barcode and QR code. You can add or remove items
          freely until the first item is verified.
        </>
      ),
    },
    {
      title: "Print the barcodes",
      body: (
        <>
          Use the <b>Print barcodes</b> button on the order page. Stick
          each printed label on the matching physical item before shipping.
        </>
      ),
    },
    {
      title: "Hand it off and watch it fulfill",
      body: (
        <>
          The installer verifies each label on-site. You&apos;ll see the
          progress bar move in real time and the project&apos;s item stock
          auto-decrement.
          When every item is verified, the order flips to{" "}
          <b>Fulfilled</b>.
        </>
      ),
    },
  ];

  return <Steps steps={steps} />;
}

function InstallerGuide() {
  const steps: Step[] = [
    {
      title: "Log in with the credentials your PM gave you",
      body: <>From the login page, enter the email and password your project manager created for you.</>,
    },
    {
      title: "Open a delivery awaiting verification",
      body: (
        <>
          Go to{" "}
          <Link
            href="/scan"
            className="text-[color:var(--primary)] underline"
          >
            Verify deliveries
          </Link>{" "}
          and pick the order whose goods you&apos;re receiving. You&apos;ll
          see every item with its barcode and QR code.
        </>
      ),
    },
    {
      title: "Verify each item as it comes off the truck",
      body: (
        <>
          Point your phone camera at the QR code on the label — the native
          camera app opens the URL and the item is verified immediately. No
          login prompt, no typing. You can also use the in-app camera tab,
          a handheld USB scanner, or type the barcode manually. Valid reads
          turn the item green; duplicates and unknown codes are rejected
          with a clear message.
        </>
      ),
    },
    {
      title: "Keep going until the bar hits 100%",
      body: (
        <>
          The progress bar at the top shows how close the order is to done.
          The project&apos;s item stock is automatically decremented on every
          valid verification.
        </>
      ),
    },
    {
      title: "Done — verified and recorded",
      body: (
        <>
          Once every item is verified the order status flips to{" "}
          <b>Fulfilled</b>. No paperwork, no phone calls.
        </>
      ),
    },
  ];

  return <Steps steps={steps} />;
}

interface Step {
  title: string;
  body: React.ReactNode;
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="card divide-y divide-[color:var(--border)] p-0">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-4 p-6">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)] text-sm font-bold text-[color:var(--primary-foreground)]">
            {i + 1}
          </div>
          <div>
            <div className="text-sm font-semibold">{s.title}</div>
            <div className="mt-1 text-sm text-[color:var(--text-muted)]">
              {s.body}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Def({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-semibold">{term}</dt>
      <dd className="text-[color:var(--text-muted)]">{children}</dd>
    </div>
  );
}
