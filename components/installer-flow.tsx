"use client";

import Link from "next/link";
import {
  resolveInstallerFlow,
  type InstallerOrderSnapshot,
  type InstallerStep,
} from "@/lib/installer-flow";

interface InstallerFlowProps {
  orders: InstallerOrderSnapshot[];
  loading?: boolean;
}

/**
 * Visual installer journey at the top of the dashboard. Mirrors the
 * "userflow" reference: each step is a tile connected by a soft line,
 * the active step glows, future steps are subdued, and tapping a tile
 * jumps the installer back into the work they had open.
 */
export function InstallerFlow({ orders, loading }: InstallerFlowProps) {
  const flow = resolveInstallerFlow(orders);
  const { steps, currentOrder } = flow;

  const currentStep = steps[flow.currentStepIndex];
  const continueHref = currentStep?.href ?? "/orders";
  const continueLabel =
    currentStep?.id === "verify-items" && currentOrder
      ? `Continue verifying ${currentOrder.projectName}`
      : currentStep?.id === "pick-order"
        ? "Pick an order to start"
        : currentStep?.id === "resolve-order"
          ? "Open the resolved order"
          : "Continue";

  return (
    <section
      className="card relative overflow-hidden p-6"
      data-tour="installer-flow"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            Your flow today
          </div>
          <h2 className="mt-1 text-base font-semibold">
            {currentOrder
              ? `Step ${flow.currentStepIndex + 1} of ${steps.length} · ${currentOrder.projectName}`
              : `Step ${flow.currentStepIndex + 1} of ${steps.length}`}
          </h2>
          <p className="text-xs text-[color:var(--text-muted)]">
            {loading
              ? "Loading your active orders…"
              : currentOrder
                ? `${currentOrder.scanned}/${currentOrder.total} items verified · status ${currentOrder.status}`
                : "Ask your PM for an active order, or browse the orders list."}
          </p>
        </div>

        {currentStep && currentStep.status !== "locked" && continueHref && (
          <Link href={continueHref} className="btn btn-primary text-sm">
            {continueLabel} →
          </Link>
        )}
      </div>

      <ol className="relative mt-6 grid gap-4 md:grid-cols-4">
        {steps.map((step, idx) => (
          <StepTile
            key={step.id}
            step={step}
            index={idx}
            isLast={idx === steps.length - 1}
          />
        ))}
      </ol>
    </section>
  );
}

function StepTile({
  step,
  index,
  isLast,
}: {
  step: InstallerStep;
  index: number;
  isLast: boolean;
}) {
  const palette = (() => {
    switch (step.status) {
      case "done":
        return {
          ring: "ring-[color:var(--success)]/40",
          chip: "bg-[color:var(--success)] text-white",
          icon: "✓",
          tone: "border-[color:var(--success)]/45 bg-[color:var(--surface)]",
          label: "Complete",
          labelClass: "text-[color:var(--success)]",
        };
      case "current":
        return {
          ring: "ring-[color:var(--primary)]/45",
          chip: "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
          icon: String(index + 1),
          tone: "border-[color:var(--primary)] bg-[color:var(--surface)] shadow-[0_0_0_4px_var(--input-focus-ring)]",
          label: "Current step",
          labelClass: "text-[color:var(--primary)]",
        };
      default:
        return {
          ring: "ring-[color:var(--border)]",
          chip: "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]",
          icon: String(index + 1),
          tone: "border-dashed border-[color:var(--border)] bg-[color:var(--surface-muted)]/30",
          label: "Up next",
          labelClass: "text-[color:var(--text-muted)]",
        };
    }
  })();

  const interactive = step.status !== "locked" && !!step.href;
  const Tag: React.ElementType = interactive ? Link : "div";
  const interactiveProps = interactive ? { href: step.href as string } : {};

  return (
    <li className="relative">
      {/* Connector line on md+ except after the last step. */}
      {!isLast && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 top-9 hidden h-px w-4 translate-x-full bg-gradient-to-r from-[color:var(--border)] to-transparent md:block"
        />
      )}

      <Tag
        {...interactiveProps}
        className={`flex h-full flex-col gap-3 rounded-xl border p-4 transition-all ${palette.tone} ${
          interactive
            ? "cursor-pointer hover:-translate-y-0.5 hover:border-[color:var(--primary)]"
            : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${palette.chip}`}
          >
            {palette.icon}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${palette.labelClass}`}
          >
            {palette.label}
          </span>
        </div>

        <div>
          <div className="text-sm font-semibold text-[color:var(--text)]">
            {step.title}
          </div>
          <p className="mt-1 text-xs leading-snug text-[color:var(--text-muted)]">
            {step.description}
          </p>
        </div>

        {step.meta && (
          <div className="mt-auto flex items-center justify-between text-[11px] font-semibold">
            <span className={palette.labelClass}>{step.meta}</span>
            {interactive && (
              <span className="text-[color:var(--primary)]">Open →</span>
            )}
          </div>
        )}

        {!step.meta && interactive && (
          <div className="mt-auto text-[11px] font-semibold text-[color:var(--primary)]">
            Open →
          </div>
        )}
      </Tag>
    </li>
  );
}
