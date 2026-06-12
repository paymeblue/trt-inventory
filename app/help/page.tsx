"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuthedUser } from "@/components/session-context";

type RoleTab = "pm" | "installer" | "logistics" | "super_admin";

const ROLE_TABS: { value: RoleTab; label: string }[] = [
  { value: "pm", label: "Project Manager" },
  { value: "installer", label: "Installer / Receiver" },
  { value: "logistics", label: "Logistics" },
  { value: "super_admin", label: "Super Admin" },
];

export default function HelpPage() {
  const user = useAuthedUser();
  const defaultTab: RoleTab =
    user?.role === "installer"
      ? "installer"
      : user?.role === "logistics"
        ? "logistics"
        : user?.role === "super_admin"
          ? "super_admin"
          : "pm";
  const [tab, setTab] = useState<RoleTab>(defaultTab);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">How it works</h1>
        <p className="text-sm text-[color:var(--text-muted)]">
          Step-by-step guide for every role. Pick yours below. For enforced API
          and inventory rules, see{" "}
          <Link
            href="/help/constraints"
            className="font-semibold text-[color:var(--primary)] hover:underline"
          >
            Rules &amp; constraints
          </Link>
          .
        </p>
      </div>

      {/* Full flow overview */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
          The full flow — at a glance
        </h2>
        <ol className="relative ml-3 space-y-3 border-l border-[color:var(--border)] pl-5 text-sm">
          {[
            { who: "PM", text: "Creates a project and adds items (SKUs)." },
            { who: "Super Admin", text: "Reviews and approves the project." },
            { who: "Logistics", text: "Warehouse-scans packing QRs then activates the project." },
            {
              who: "PM",
              text: "Gets a notification when the project is activated. Opens Orders → Create Order to dispatch.",
            },
            {
              who: "Installer",
              text: "Gets a notification and sees the new delivery. Opens it on-site to verify each item.",
            },
            {
              who: "PM",
              text: "Gets a fulfilled notification with the installer name and item count the moment the last item is scanned.",
            },
          ].map((s, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-8 flex h-5 w-5 items-center justify-center rounded-full bg-[color:var(--primary)] text-[10px] font-bold text-[color:var(--primary-foreground)]">
                {i + 1}
              </span>
              <span className="font-semibold text-[color:var(--text)]">{s.who}: </span>
              <span className="text-[color:var(--text-muted)]">{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Role tabs */}
      <div
        className="flex flex-wrap gap-1 rounded-full border border-[color:var(--border)] bg-[color:var(--surface-muted)] p-1"
        role="tablist"
      >
        {ROLE_TABS.map((r) => (
          <button
            key={r.value}
            role="tab"
            aria-selected={tab === r.value}
            onClick={() => setTab(r.value)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              tab === r.value
                ? "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {tab === "pm" && <PmGuide />}
      {tab === "installer" && <InstallerGuide />}
      {tab === "logistics" && <LogisticsGuide />}
      {tab === "super_admin" && <SuperAdminGuide />}

      <section className="card p-6">
        <h2 className="text-base font-semibold">Quick reference</h2>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Def term="Project">
            The top-level container. Every item and every order belongs to one
            project; items cannot be shared across projects.
          </Def>
          <Def term="Item / SKU">
            A product line scoped to a project. Each unit gets its own scan code
            on shipment. Use Categories to add many units at once.
          </Def>
          <Def term="Order">
            A collection of items from one project, dispatched as a delivery to
            be verified on-site.
          </Def>
          <Def term="Active order">
            Ready to be verified on-site by the installer.
          </Def>
          <Def term="Fulfilled order">
            Every item in the order has been verified. Project stock was
            decremented accordingly.
          </Def>
          <Def term="Anomaly">
            The order received an unexpected barcode — still verifiable but
            flagged for review.
          </Def>
          <Def term="Dispute">
            A formal escalation raised by any role when something goes wrong —
            wrong item, damaged goods, shortage, etc. Attach a photo as evidence.
          </Def>
          <Def term="Notification bell">
            The bell icon in the top bar alerts you to important events — project
            activated, new delivery, order fulfilled — with a pop-up modal for
            action-required items.
          </Def>
          <Def term="Reports">
            The Reports page (sidebar) lists every fulfilled order with installer
            name, item count, and a CSV download for records.
          </Def>
        </dl>
      </section>
    </div>
  );
}

function PmGuide() {
  const steps: Step[] = [
    {
      title: "Create a project and add items",
      body: (
        <>
          Go to{" "}
          <Link href="/projects" className="text-[color:var(--primary)] underline">
            Projects
          </Link>
          , hit <b>+ New project</b>, give it a name, and add the items (SKUs).
          Items belong to this project alone and cannot be reused by another project.
        </>
      ),
    },
    {
      title: "Invite your installer / receiver",
      body: (
        <>
          On the{" "}
          <Link href="/team" className="text-[color:var(--primary)] underline">
            Team
          </Link>{" "}
          page, create an account for each installer and assign them to the project.
          Share the email and temporary password privately.
        </>
      ),
    },
    {
      title: "Wait for super-admin and logistics approval",
      body: (
        <>
          The project goes through two approval stages before it is active.
          Your notification bell will alert you the moment logistics activates it —
          you&apos;ll also see a pop-up modal prompting you to create an order.
        </>
      ),
    },
    {
      title: "Create an order",
      body: (
        <>
          Open the <b>Orders</b> dropdown in the sidebar and click{" "}
          <b>Create Order</b>. Pick the now-active project. All its SKUs are
          added automatically with printable barcodes.
        </>
      ),
    },
    {
      title: "Print the barcodes and hand off",
      body: (
        <>
          Use <b>Print barcodes</b> on the order page. Stick each label on the
          matching physical item before shipping. The installer will scan them on-site.
        </>
      ),
    },
    {
      title: "Watch it fulfil — get notified instantly",
      body: (
        <>
          As items are verified, the progress bar updates in real time. When the
          last item is scanned you get a notification (bell + pop-up) showing the
          order name, item count, and the installer who completed it.
          The order then appears in{" "}
          <Link href="/orders?filter=fulfilled" className="text-[color:var(--primary)] underline">
            Fulfilled Orders
          </Link>{" "}
          and in{" "}
          <Link href="/reports" className="text-[color:var(--primary)] underline">
            Reports
          </Link>
          .
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
      body: "From the login page, enter the email and password your project manager created for you.",
    },
    {
      title: "Watch for a delivery notification",
      body: (
        <>
          When the PM creates an order for your project you will see a modal pop-up
          and a badge on the notification bell. Click <b>View delivery</b> to go
          straight to it. You can also find it under{" "}
          <Link href="/orders" className="text-[color:var(--primary)] underline">
            Orders
          </Link>{" "}
          or{" "}
          <Link href="/scan" className="text-[color:var(--primary)] underline">
            Verify deliveries
          </Link>
          .
        </>
      ),
    },
    {
      title: "Verify each item as it arrives",
      body: (
        <>
          Point your phone camera at the QR code on the label — the native camera
          app opens the URL and the item is verified immediately. You can also use
          the in-app scanner, a USB barcode gun, or type the code manually. Valid
          reads turn green; duplicates and unknown codes are rejected with a clear
          message.
        </>
      ),
    },
    {
      title: "Keep going until the bar hits 100 %",
      body: "The progress bar shows how close the delivery is to complete. Project stock decrements on every valid scan.",
    },
    {
      title: "Done — verified and recorded",
      body: (
        <>
          Once every item is verified the order flips to <b>Fulfilled</b>. The PM
          is notified automatically. No paperwork, no phone calls.
        </>
      ),
    },
    {
      title: "Raise a dispute if something is wrong",
      body: (
        <>
          Go to{" "}
          <Link href="/disputes/new" className="text-[color:var(--primary)] underline">
            New dispute
          </Link>{" "}
          and attach a photo of the damaged or missing item. Link the order so the
          PM and super-admin have full context.
        </>
      ),
    },
  ];

  return <Steps steps={steps} />;
}

function LogisticsGuide() {
  const steps: Step[] = [
    {
      title: "Check the logistics queue",
      body: (
        <>
          Go to{" "}
          <Link href="/approvals/logistics" className="text-[color:var(--primary)] underline">
            Awaiting logistics
          </Link>
          . Projects that have passed super-admin review are listed here.
        </>
      ),
    },
    {
      title: "Scan every packing QR in the warehouse",
      body: "Click Approve Project and use the logistics scan flow to scan every packing sticker on the items. This is the critical gate — do not skip items.",
    },
    {
      title: "Activate the project",
      body: "Once all packing QRs are scanned, confirm activation. The project becomes live and the PM is notified instantly so they can create a dispatch order.",
    },
    {
      title: "Apply or reject PM update requests",
      body: "If the PM requested metadata changes (name, address, installer reassignment), they appear in the lower section of the queue. Review and confirm or reject each one.",
    },
  ];

  return <Steps steps={steps} />;
}

function SuperAdminGuide() {
  const steps: Step[] = [
    {
      title: "Review new projects",
      body: (
        <>
          Go to{" "}
          <Link
            href="/approvals/super-admin"
            className="text-[color:var(--primary)] underline"
          >
            Pending approval
          </Link>
          . New projects created by PMs arrive here first.
        </>
      ),
    },
    {
      title: "Approve or reject with a reason",
      body: "Click Approve to forward the project to logistics, or Reject and provide a clear reason. The PM sees your rejection reason on the project page and can update and resubmit.",
    },
    {
      title: "Handle dispute escalations",
      body: (
        <>
          Open any dispute from the{" "}
          <Link href="/disputes" className="text-[color:var(--primary)] underline">
            Disputes
          </Link>{" "}
          page. Assign it, comment, and resolve or close it once settled. The badge
          on the sidebar shows unresolved disputes needing triage.
        </>
      ),
    },
    {
      title: "Download reports",
      body: (
        <>
          The{" "}
          <Link href="/reports" className="text-[color:var(--primary)] underline">
            Reports
          </Link>{" "}
          page shows every fulfilled order with installer, PM, and item details.
          Use Download CSV for audits or records.
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
            <div className="mt-1 text-sm text-[color:var(--text-muted)]">{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold">{term}</dt>
      <dd className="text-[color:var(--text-muted)]">{children}</dd>
    </div>
  );
}
