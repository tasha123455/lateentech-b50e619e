/* An HTML tooltip for the money charts.
 *
 * Chart.js draws its tooltip onto the canvas, and a canvas label has one font
 * size for the whole string — so an amount and its currency symbol come out
 * the same size, which makes the chart the one place in the app where they do.
 * Everywhere else the symbol is set smaller and lighter than the figure it
 * belongs to.
 *
 * Handing the tooltip to the DOM is what allows that: the same `.cur-sym` rule
 * that styles every other amount applies here too, so the chart stops being
 * the exception.
 *
 * The axis is a separate question and stays as it is — five labels stacked
 * down the side, each repeating the same currency, is noise at any size. */

type TooltipModel = {
  opacity: number;
  caretX: number;
  caretY: number;
  dataPoints?: Array<{ dataIndex: number; raw: number }>;
};

const CLASS = "chart-html-tip";

/** Builds the `external` handler Chart.js calls whenever the tooltip changes.
 *
 *  `render` returns the inner HTML for the hovered point; it gets the raw
 *  value and the index, so it can reach labels and sub-labels of its own. */
export function htmlTooltip(render: (raw: number, index: number) => string) {
  return (ctx: { chart: { canvas: HTMLCanvasElement }; tooltip: TooltipModel }) => {
    const { chart, tooltip } = ctx;
    const parent = chart.canvas.parentElement;
    if (!parent) return;

    let el = parent.querySelector<HTMLDivElement>("." + CLASS);
    if (!el) {
      el = document.createElement("div");
      el.className = CLASS;
      parent.appendChild(el);
    }

    const point = tooltip.dataPoints && tooltip.dataPoints[0];
    if (!tooltip.opacity || !point) {
      el.style.opacity = "0";
      return;
    }

    el.innerHTML = render(point.raw, point.dataIndex);
    el.style.opacity = "1";

    /* Positioned after the content is in, because how much room it needs
       depends on what it says. Clamped to the chart, so a point near either
       edge does not push the tooltip outside the card. */
    const w = el.offsetWidth;
    const left = Math.max(4, Math.min(tooltip.caretX - w / 2, parent.clientWidth - w - 4));
    el.style.left = left + "px";
    el.style.top = Math.max(4, tooltip.caretY - el.offsetHeight - 10) + "px";
  };
}

/** Escapes a label on its way into the tooltip's markup.
 *
 *  Dates and counts are ours, but this is innerHTML and the same helper serves
 *  charts whose labels come from people. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** An amount with its symbol in a `.cur-sym` span, in the given order.
 *
 *  Primitives rather than one of the two `moneyParts` shapes, which differ
 *  between the dashboards — this way neither call site has to be reshaped to
 *  match the other, and the ordering stays each dashboard's own decision. */
export function moneyHtml(
  amount: string,
  symbol: string,
  symbolFirst: boolean,
  spaced = false,
): string {
  const sym = `<span class="cur-sym">${esc(symbol)}</span>`;
  const gap = spaced ? " " : "";
  return symbolFirst ? sym + gap + esc(amount) : esc(amount) + gap + sym;
}
