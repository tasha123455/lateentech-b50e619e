/** Header for the pages reached from the menu. They are full pages rather
 *  than sheets, so they need their own way back to wherever you came from. */
export function PageHeader({
  title, onBack, count = 0,
}: {
  title: string;
  onBack: () => void;
  /** Items on the page waiting to be acted on. Badged next to the title, and
   *  the same number the menu entry carries. */
  count?: number;
}) {
  return (
    <div className="adm-page-head">
      <button className="adm-back-btn" onClick={onBack} aria-label="Back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <div className="adm-h1" style={{ marginBottom: 0 }}>{title}</div>
      {count > 0 && <span className="adm-page-count" data-no-i18n>{count}</span>}
    </div>
  );
}
