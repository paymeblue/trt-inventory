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
          Pick your role and follow the steps.
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
          <Def term="SKU">
            A warehouse product identifier you manage on the{" "}
            <Link
              href="/warehouse"
              className="text-[color:var(--primary)] underline"
            >
              Warehouse
            </Link>{" "}
            page.
          </Def>
          <Def term="Order">
            A collection of items (one per SKU) shipped to a project site.
          </Def>
          <Def term="Active">
            An order that is ready to be scanned on-site.
          </Def>
          <Def term="Fulfilled">
            Every item in the order has been scanned. Warehouse stock was
            decremented accordingly.
          </Def>
          <Def term="Anomaly">
            The order received an invalid scan. Still scannable, but flagged
            for review.
          </Def>
        </dl>
      </section>
    </div>
  );
}

function PmGuide() {
  const steps: Step[] = [
    {
      title: "Stock your warehouse",
      body: (
        <>
          Go to{" "}
          <Link
            href="/warehouse"
            className="text-[color:var(--primary)] underline"
          >
            Warehouse
          </Link>{" "}
          and add every SKU you ship with an initial stock quantity. You
          can always add more later.
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
      title: "Create an order",
      body: (
        <>
          Hit <b>+ New Order</b>, give it a project name, and open it. Add
          one SKU at a time — each one gets its own printable barcode. You
          can add or remove items freely until the first scan happens.
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
          The installer scans the labels on-site. You&apos;ll see the
          progress bar move in real time and warehouse stock auto-decrement.
          When every item is scanned, the order flips to{" "}
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
      title: "Open a scannable order",
      body: (
        <>
          Go to{" "}
          <Link
            href="/scan"
            className="text-[color:var(--primary)] underline"
          >
            Scan
          </Link>{" "}
          and pick the order whose goods you&apos;re receiving. You&apos;ll
          see every item and its barcode.
        </>
      ),
    },
    {
      title: "Scan each barcode as items come off the truck",
      body: (
        <>
          Use the camera (phone or laptop) or a handheld scanner. You can
          also type the barcode manually. Valid scans turn the item green
          and flash <b>Just scanned</b>. Duplicates and unknown codes are
          rejected.
        </>
      ),
    },
    {
      title: "Keep going until the bar hits 100%",
      body: (
        <>
          The progress bar at the top shows how close the order is to done.
          Warehouse stock is automatically decremented on every valid scan.
        </>
      ),
    },
    {
      title: "Done — verified and recorded",
      body: (
        <>
          Once every item is scanned the order status flips to{" "}
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
