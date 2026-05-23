/** Adds a root class so print CSS can hide the app shell and print labels only. */
export function printPackingLabels(): void {
  const root = document.documentElement;
  root.classList.add("packing-label-print");

  const cleanup = () => {
    root.classList.remove("packing-label-print");
  };

  window.addEventListener("afterprint", cleanup, { once: true });

  // Let the print-root portal and packing-label-print styles apply before dialog opens.
  requestAnimationFrame(() => {
    window.print();
  });
}
