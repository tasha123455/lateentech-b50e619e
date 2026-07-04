<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Order card v2.5 — all states</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #141414;
    --card: #1a1a1a;
    --card-border: #262624;
    --text: #f0eeeb;
    --text-dim: #8f8c88;
    --text-faint: #5e5c58;
    --accent: #8b83e8;
    --accent-dim: #2d2b4e;
    --ok: #2dbd8f;
    --ok-bg: #0d2a1f;
    --ok-border: #1D9E75;
    --pending: #c9923a;
    --pending-bg: #2a2110;
    --err: #e07070;
    --err-bg: #2a1414;
    --err-border: #5a2a2a;
    --font: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  body { background: var(--bg); font-family: var(--font); min-height: 100vh; padding: 28px 14px 80px; display: flex; justify-content: center; }
  .screen { width: 100%; max-width: 430px; }
  .screen-label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--text-faint); margin-bottom: 14px; padding: 0 2px; }
  .list { display: flex; flex-direction: column; gap: 10px; }

  .order { background: var(--card); border: 0.5px solid var(--card-border); border-radius: 16px; overflow: hidden; transition: border-color .2s, background .2s; }
  .order.open { border-color: #38352e; }
  .order.approved { background: #0f2019; border-color: var(--ok-border); }
  .order.approved .row-name { color: #eafff5; }
  .order.approved .avatar { background: #1a4033; }
  .order.approved .body { border-top-color: #1c4a3a; }
  .order.approved .contact-chip { background: #12281f; border-color: #1c4a3a; }
  .order.approved .addr-block { background: #12281f; }
  .order.approved .photo-slide { background: linear-gradient(135deg,#124534,#0f2019) !important; }
  .order.approved .variant-chip { background: #163829; border-color: #1c4a3a; }
  .order.approved .variant-chip .variant-check { color: #bdeed6; }
  .order.approved .summary-card { background: #0f2a20; border-color: var(--ok-border); }
  .order.approved .summary-divider { background: #1c4a3a; }
  .order.approved .divider { background: #1c4a3a; }
  .order.approved .icon-btn { background: #12281f; border-color: #1c4a3a; }
  .order.approved .code-chip { background: #12281f; }

  .row { display: flex; align-items: center; gap: 11px; padding: 13px 14px; cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .avatar { width: 40px; height: 40px; border-radius: 10px; background: #232320; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; overflow: hidden; }
  .row-main { flex: 1; min-width: 0; }
  .row-name { font-size: 14.5px; font-weight: 600; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-sub-wrap { display: flex; flex-direction: column; gap: 3px; margin-top: 3px; }
  .code-chip { display: inline-flex; align-items: center; background: #232320; border-radius: 14px; padding: 1.5px 6px; font-size: 9.5px; color: var(--text-faint); white-space: nowrap; width: fit-content; }
  .code-chip strong { color: var(--text-dim); font-weight: 700; letter-spacing: .01em; margin-left: 2px; }
  .row-date { font-size: 10.5px; color: var(--text-faint); padding-left: 2px; }

  .row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .status-pill { font-size: 10.5px; font-weight: 600; padding: 4px 9px; border-radius: 20px; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
  .status-pill.pending { background: var(--pending-bg); color: var(--pending); }
  .status-pill.ok { background: var(--ok-bg); color: var(--ok); }
  .status-pill.draft { background: #242422; color: var(--text-dim); border: 0.5px solid var(--card-border); }
  .status-pill.err { background: var(--err-bg); color: var(--err); }
  .commission-tag { font-size: 11px; font-weight: 700; color: var(--ok); }
  .stale-tag { font-size: 10px; color: var(--pending); display: flex; align-items: center; gap: 3px; }

  .chev-wrap { display: flex; align-items: center; }
  .chev { color: var(--text-faint); flex-shrink: 0; transition: transform .25s; display: flex; margin-left: 4px; }
  .order.open .chev { transform: rotate(180deg); color: var(--text-dim); }

  .body-wrap { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .28s ease; }
  .order.open .body-wrap { grid-template-rows: 1fr; }
  .body-inner { overflow: hidden; }
  .body { padding: 0 14px 15px; border-top: 0.5px solid var(--card-border); margin-top: 2px; padding-top: 13px; }

  .contact-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .contact-chip { flex: 1; display: flex; align-items: center; gap: 7px; background: #201f1c; border: 0.5px solid var(--card-border); border-radius: 10px; padding: 8px 10px; font-size: 12.5px; color: var(--text); }
  .contact-chip svg { flex-shrink: 0; opacity: .7; }
  .contact-chip.wa svg { color: #25D366; opacity: 1; }

  .addr-block { display: flex; gap: 9px; margin-bottom: 12px; padding: 10px 11px; background: #201f1c; border-radius: 10px; }
  .addr-block svg { flex-shrink: 0; margin-top: 2px; opacity: .6; }
  .addr-rows { display: flex; flex-direction: column; gap: 4px; }
  .addr-row { font-size: 12.5px; color: var(--text); line-height: 1.3; }
  .addr-label { color: var(--text-dim); font-weight: 600; margin-right: 3px; }

  .product-block { margin-bottom: 14px; }
  .photo-gallery { position: relative; margin-bottom: 10px; }
  .photo-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; border-radius: 14px; -webkit-overflow-scrolling: touch; }
  .photo-track::-webkit-scrollbar { display: none; }
  .photo-slide { min-width: 100%; height: 200px; scroll-snap-align: start; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 72px; }
  .photo-dots { position: absolute; bottom: 10px; right: 12px; display: flex; gap: 5px; align-items: center; }
  .photo-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.45); transition: all .2s; cursor: pointer; }
  .photo-dot.active { width: 18px; border-radius: 5px; background: #fff; }

  .product-name { font-size: 14.5px; font-weight: 600; color: var(--text); margin-bottom: 8px; }

  .variant-row { display: flex; gap: 12px; flex-wrap: wrap; }
  .variant-item { display: flex; flex-direction: column; gap: 6px; }
  .variant-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 5px 9px 5px 7px; border-radius: 8px; background: var(--accent-dim); border: 1px solid var(--accent); color: var(--text); width: fit-content; }
  .variant-chip .variant-check { display: flex; color: var(--accent); flex-shrink: 0; }
  .variant-chip .variant-label { color: var(--text-dim); font-weight: 500; }
  .variant-chip .variant-value { font-weight: 600; }
  .variant-swatch { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--card-border); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; position: relative; }

  .summary-card { background: #1d1c1a; border: 0.5px solid var(--card-border); border-radius: 14px; padding: 14px 15px; margin-bottom: 12px; }
  .summary-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .summary-title { font-size: 14.5px; font-weight: 700; color: var(--text); }
  .summary-icon { width: 30px; height: 30px; border-radius: 9px; background: var(--accent-dim); color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .summary-row { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; }
  .summary-label { font-size: 12.5px; color: var(--text-dim); }
  .summary-value { font-size: 13px; color: var(--text); font-weight: 600; }
  .summary-divider { height: 0.5px; background: var(--card-border); margin: 6px 0; }
  .summary-total-row { display: flex; align-items: center; justify-content: space-between; padding-top: 8px; }
  .summary-total-label { font-size: 14.5px; font-weight: 700; color: var(--text); }
  .summary-total-value { font-size: 19px; font-weight: 800; color: var(--accent); }

  .commission-block { margin-top: 2px; padding: 10px 11px; border-radius: 10px; background: var(--ok-bg); border: 0.5px solid var(--ok-border); display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .commission-block.muted { background: #1c1b19; border-color: var(--card-border); }
  .commission-label { font-size: 11px; color: var(--text-dim); display: flex; align-items: center; gap: 5px; }
  .commission-hint { font-size: 10px; color: var(--text-faint); font-weight: 500; }
  .commission-value { font-size: 17px; font-weight: 700; color: var(--ok); }
  .commission-value.muted { font-size: 13px; font-weight: 600; color: var(--text-dim); }

  .meta-line { font-size: 10.5px; color: var(--text-faint); margin-top: 10px; line-height: 1.6; }

  .admin-note { margin-top: 10px; padding: 9px 11px; border-radius: 10px; background: var(--err-bg); border: 0.5px solid var(--err-border); font-size: 12px; color: #f0b0b0; display: flex; gap: 7px; }
  .admin-note svg { flex-shrink: 0; margin-top: 1px; }

  .divider { height: 0.5px; background: var(--card-border); margin: 13px 0 12px; }

  .footer-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .footer-row.solo { justify-content: stretch; }
  .icon-btns { display: flex; gap: 6px; }
  .icon-btns-row { display: flex; gap: 6px; justify-content: flex-end; margin-top: 10px; }
  .icon-btn { width: 32px; height: 32px; border-radius: 9px; border: 0.5px solid var(--card-border); background: #201f1c; display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .icon-btn.disabled { opacity: .3; cursor: not-allowed; }
  .icon-btn.danger svg { color: var(--err); }

  .action-btn { font-size: 12.5px; font-weight: 600; padding: 9px 15px; border-radius: 10px; border: none; cursor: pointer; font-family: var(--font); }
  .action-btn.neutral { background: #232320; color: var(--text); border: 0.5px solid var(--card-border); }
  .action-btn.primary { background: var(--accent); color: #fff; }
  .action-btn.urgent { background: var(--err); color: #fff; }

  .receipt-block { margin-top: 10px; display: flex; flex-direction: column; align-items: center; gap: 7px; }
  .receipt-btn { width: 100%; padding: 10px; border-radius: 10px; border: 0.5px solid var(--card-border); background: #201f1c; color: var(--text); font-size: 12.5px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; font-family: var(--font); }
  .receipt-btn svg { flex-shrink: 0; opacity: .8; }
  .order.approved .receipt-btn { background: #12281f; border-color: #1c4a3a; }
  .howto-link { font-size: 11px; color: var(--accent); text-decoration: underline; cursor: pointer; background: none; border: none; font-family: var(--font); padding: 2px; }

  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: none; align-items: center; justify-content: center; z-index: 100; padding: 24px; }
  .modal-overlay.show { display: flex; }
  .modal-card { background: var(--card); border: 0.5px solid var(--card-border); border-radius: 16px; width: 100%; max-width: 380px; max-height: 82vh; overflow-y: auto; padding: 16px; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .modal-title { font-size: 14.5px; font-weight: 700; color: var(--text); }
  .modal-close { width: 28px; height: 28px; border-radius: 8px; background: #232320; display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-dim); flex-shrink: 0; }
  .modal-body { font-size: 13px; color: var(--text-dim); line-height: 1.6; }
  .modal-body p { font-size: 12.5px; color: var(--text-dim); line-height: 1.55; }
  .receipt-photo { width: 100%; height: 260px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 64px; margin-bottom: 10px; }
  .receipt-meta { font-size: 11px; color: var(--text-faint); }

  .step-label { display: flex; align-items: center; gap: 8px; font-size: 12.5px; font-weight: 700; color: var(--text); margin: 0 0 6px; }
  .step-label.step-2 { margin-top: 16px; }
  .step-num { width: 20px; height: 20px; border-radius: 50%; background: var(--accent); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

  .pd-box { display: flex; flex-direction: column; gap: 8px; margin: 10px 0 4px; }
  .pd-row { background: #201f1c; border: 0.5px solid var(--card-border); border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .pd-info { min-width: 0; }
  .pd-label { font-size: 10.5px; color: var(--text-faint); margin-bottom: 3px; }
  .pd-value { font-size: 13.5px; font-weight: 700; color: var(--text); word-break: break-word; }
  .pd-copy { font-size: 11px; font-weight: 600; padding: 6px 11px; border-radius: 8px; background: #2a2926; color: var(--text-dim); border: 0.5px solid var(--card-border); cursor: pointer; flex-shrink: 0; font-family: var(--font); }

  .upload-box { border: 1.5px dashed var(--card-border); border-radius: 12px; padding: 22px 14px; text-align: center; margin: 10px 0 4px; }
  .upload-box svg { margin: 0 auto 8px; color: var(--accent); display: block; }
  .upload-box span { font-size: 12.5px; color: var(--text-dim); }

  .fee-box { background: #201f1c; border: 0.5px solid var(--card-border); border-radius: 10px; padding: 10px 12px; margin: 14px 0 6px; display: flex; flex-direction: column; gap: 7px; }
  .fee-row { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-dim); }
  .fee-row span:last-child { color: var(--text); font-weight: 600; }
  .fee-row.total { border-top: 0.5px solid var(--card-border); padding-top: 7px; margin-top: 2px; font-size: 13px; color: var(--text); font-weight: 700; }
  .fee-row.total span:last-child { color: var(--accent); }

  .notes-subtitle { font-size: 12px; color: var(--text-dim); margin-bottom: 10px; }
  .notes-card { background: #1d1c1a; border: 0.5px solid var(--card-border); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 14px; margin-bottom: 14px; }
  .notes-item { display: flex; gap: 10px; align-items: flex-start; }
  .notes-icon { flex-shrink: 0; margin-top: 2px; display: flex; }
  .notes-item p { font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }

  svg { display: block; }
</style>
</head>
<body>
<div class="screen">
  <div class="screen-label">Orders — redesigned card, all 4 states</div>
  <div class="list" id="list"></div>
</div>

<div class="modal-overlay" id="modalOverlay" onclick="closeModal(event)">
  <div class="modal-card" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title" id="modalTitle"></div>
      <div class="modal-close" onclick="closeModal()"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
    </div>
    <div class="modal-body" id="modalBody"></div>
  </div>
</div>

<script>
const icons = {
  phone: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  wa: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.1 1.6 5.9L0 24l6.3-1.6A11.9 11.9 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5z"/></svg>`,
  pin: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  chev: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
  clock: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  check: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  checkSmall: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  draft: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  x: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  warn: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  trash: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>`,
  doc: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  receipt: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
  camera: `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`,
  upload: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  uploadBig: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  dollar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  truck: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="15" height="10" rx="1"/><path d="M16 10h3l3 3v4h-6"/><circle cx="6" cy="19" r="2"/><circle cx="17.5" cy="19" r="2"/></svg>`,
  shield: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  shieldCheck: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 12 15 16 10"/></svg>`,
  box: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><line x1="12" y1="13" x2="12" y2="21"/></svg>`,
};

const paymentDetails = {
  accountName: "2478999",
  accountNumber: "2468900",
  bank: "مصرف ليبيا المركزي - بنغازي",
};

const colorMap = {
  green: "#2f7d4f", red: "#c0392b", blue: "#2d6cdf", black: "#1c1c1c",
  white: "#eee6d8", yellow: "#d9b93c", orange: "#d97a3c", purple: "#6b4fa0",
  pink: "#d97aa0", grey: "#888888", gray: "#888888", brown: "#7a5230",
  beige: "#c9b896", navy: "#1f3a5c", gold: "#c9a13b", silver: "#b8b8b8",
};

const orders = [
  {
    initials: "G", name: "G", code: "ORD-18F610", date: "2/7/2026",
    status: "pending", statusLabel: "Pending review", stale: "Uploaded 2 days ago",
    phone: "+218 092 662 3568", wa: null,
    city: "Al Kuwayfiyah", country: "Libya", addr: "Fytrr",
    product: "Product", thumb: "📦", variants: ["Size: Tree", "Colour: Green", "Qty: 1"],
    photos: ["📦","📦","📦"],
    unitPrice: 200, qty: 1, shipping: 2, delivery: 20,
    commission: null, commissionState: "muted",
    uploaded: "Receipt uploaded 7/2/2026, 12:19:56 PM", reviewed: null, adminNote: null,
    canEdit: false, action: null,
    open: true,
  },
  {
    initials: "G", name: "G", code: "ORD-5A3CA3", date: "2/7/2026",
    status: "ok", statusLabel: "Approved", stale: null,
    phone: "+218 091 235 6987", wa: "+218 092 132 5809",
    city: "Al Kuwayfiyah", country: "Libya", addr: "Fhgf",
    product: "Product", thumb: "📦", variants: ["Size: Tree", "Colour: Blue", "Qty: 2"],
    photos: ["📦","📦","📦"],
    unitPrice: 200, qty: 2, shipping: 20, delivery: 2,
    commission: "40.00 LYD", commissionState: "ok",
    uploaded: "Receipt uploaded 7/2/2026, 12:21:01 PM", reviewed: "Reviewed 7/2/2026, 12:21:37 PM", adminNote: null,
    canEdit: false, action: null,
    open: false,
  },
  {
    initials: "NK", name: "Nahed Khreit", code: "ORD-22WJBH", date: "3/7/2026",
    status: "draft", statusLabel: "Draft · not sent", stale: null,
    phone: "+218 092 135 5545", wa: null,
    city: "Zueitina", country: "Libya", addr: "Aloeoba Street",
    product: "Tree", thumb: "🌴", variants: ["Size: 44", "Colour: Brown", "Qty: 1"],
    photos: ["🌴","🌴"],
    unitPrice: 200, qty: 1, shipping: 20, delivery: 10,
    commission: null, commissionState: "muted",
    uploaded: null, reviewed: null, adminNote: null,
    canEdit: true, action: { label: "Add receipt & send", type: "primary" },
    open: false,
  },
  {
    initials: "NK", name: "Nahed Khreit", code: "ORD-6378F5", date: "3/7/2026",
    status: "err", statusLabel: "Receipt rejected", stale: null,
    phone: "+218 092 123 4567", wa: null,
    city: "Zueitina", country: "Libya", addr: "Aloeoba Street",
    product: "Tree", thumb: "🌴", variants: ["Size: 44", "Colour: Green", "Qty: 1"],
    photos: ["🌴","🌴"],
    unitPrice: 200, qty: 1, shipping: 20, delivery: 10,
    commission: null, commissionState: "muted",
    uploaded: "Receipt uploaded 7/3/2026, 7:56:28 PM", reviewed: "Reviewed 7/3/2026, 7:57:05 PM",
    adminNote: "The receipt image is unreadable — please re-upload a clearer photo.",
    canEdit: true, action: { label: "Re-upload receipt", type: "urgent" },
    open: false,
  },
];

function statusIcon(s) {
  if (s === "pending") return icons.clock;
  if (s === "ok") return icons.check;
  if (s === "draft") return icons.draft;
  return icons.x;
}

function fmt(n) {
  return n.toFixed(2) + " LYD";
}

const photoBgs = [
  'linear-gradient(135deg,#2d2b4e,#1a1a1a)',
  'linear-gradient(135deg,#1e2d4e,#1a1a1a)',
  'linear-gradient(135deg,#2b4e30,#1a1a1a)',
  'linear-gradient(135deg,#4e2b2b,#1a1a1a)',
];

// Builds the swipeable photo gallery: a horizontally-scrollable track of
// full-size photos with pill/dot pagination indicators overlaid bottom-right,
// matching the reference screenshot.
function buildGallery(o, i) {
  const slides = o.photos.map((ph, j) => {
    const bg = photoBgs[j % photoBgs.length];
    return `<div class="photo-slide" style="background:${bg}">${ph}</div>`;
  }).join('');

  const dots = o.photos.length > 1
    ? `<div class="photo-dots">${o.photos.map((_, j) => `<div class="photo-dot ${j === 0 ? 'active' : ''}" onclick="event.stopPropagation();scrollToPhoto('track-${i}', ${j})"></div>`).join('')}</div>`
    : '';

  return `<div class="photo-gallery">
    <div class="photo-track" id="track-${i}">${slides}</div>
    ${dots}
  </div>`;
}

// Builds the "chosen" variant chips. Any variant labeled Colour/Color gets a
// small attached swatch photo underneath (photo variant); every other
// variant (e.g. Size) is shown as a plain chosen chip with no photo.
function buildVariants(o) {
  return o.variants.filter(v => !/^qty/i.test(v.trim())).map(v => {
    const idx = v.indexOf(':');
    const label = idx > -1 ? v.slice(0, idx).trim() : v.trim();
    const value = idx > -1 ? v.slice(idx + 1).trim() : '';
    const isColor = /colou?r/i.test(label);

    let swatchHtml = '';
    if (isColor) {
      const hex = colorMap[value.toLowerCase()];
      const inner = hex ? '' : o.thumb;
      const bg = hex || photoBgs[0];
      swatchHtml = `<div class="variant-swatch" style="background:${bg}">${inner}</div>`;
    }

    return `<div class="variant-item">
      <div class="variant-chip"><span class="variant-check">${icons.checkSmall}</span><span class="variant-label">${label}:</span><span class="variant-value">${value}</span></div>
      ${swatchHtml}
    </div>`;
  }).join('');
}

function render() {
  const list = document.getElementById('list');
  list.innerHTML = orders.map((o, i) => {
    const qtyTotal = o.unitPrice * o.qty;
    const total = qtyTotal + o.shipping + o.delivery;
    const isApproved = o.status === 'ok';
    const canEditActual = o.canEdit && !isApproved;
    const commissionHint = !isApproved ? `<span class="commission-hint">40.00 LYD</span>` : '';
    const commissionDisplay = isApproved ? `+${o.commission}` : 'Pending review';
    return `
    <div class="order ${o.open ? 'open' : ''} ${isApproved ? 'approved' : ''}" id="order-${i}">
      <div class="row" onclick="toggle(${i})">
        <div class="avatar">${o.thumb}</div>
        <div class="row-main">
          <div class="row-name">${o.name}</div>
          <div class="row-sub-wrap">
            <span class="code-chip">Order code:<strong>${o.code}</strong></span>
            <span class="row-date">${o.date}</span>
          </div>
        </div>
        <div class="row-right">
          <div class="status-pill ${o.status}">${statusIcon(o.status)}${o.statusLabel}</div>
          ${o.commission ? `<div class="commission-tag">+${o.commission}</div>` : ''}
          ${o.stale ? `<div class="stale-tag">${o.stale}</div>` : ''}
        </div>
        <div class="chev">${icons.chev}</div>
      </div>
      <div class="body-wrap">
        <div class="body-inner">
          <div class="body">
            <div class="product-block">
              ${buildGallery(o, i)}
              <div class="product-name">${o.product}</div>
              <div class="variant-row">${buildVariants(o)}</div>
            </div>

            <div class="contact-row">
              <div class="contact-chip">${icons.phone}${o.phone}</div>
              ${o.wa ? `<div class="contact-chip wa">${icons.wa}${o.wa}</div>` : ''}
            </div>

            <div class="addr-block">
              ${icons.pin}
              <div class="addr-rows">
                <div class="addr-row"><span class="addr-label">Country:</span>${o.country}</div>
                <div class="addr-row"><span class="addr-label">City:</span>${o.city}</div>
                <div class="addr-row"><span class="addr-label">Address:</span>${o.addr}</div>
              </div>
            </div>

            <div class="summary-card">
              <div class="summary-header">
                <div class="summary-title">Order summary</div>
                <div class="summary-icon">${icons.doc}</div>
              </div>
              <div class="summary-row"><span class="summary-label">Product price</span><span class="summary-value">${fmt(o.unitPrice)}</span></div>
              <div class="summary-row"><span class="summary-label">Quantity (${o.qty})</span><span class="summary-value">${fmt(qtyTotal)}</span></div>
              <div class="summary-row"><span class="summary-label">Shipping</span><span class="summary-value">${fmt(o.shipping)}</span></div>
              <div class="summary-row"><span class="summary-label">Delivery fee</span><span class="summary-value">${fmt(o.delivery)}</span></div>
              <div class="summary-divider"></div>
              <div class="summary-total-row">
                <span class="summary-total-label">Total</span>
                <span class="summary-total-value">${fmt(total)}</span>
              </div>
            </div>

            <div class="commission-block ${o.commissionState}">
              <span class="commission-label">Your commission${commissionHint}</span>
              <span class="commission-value ${o.commissionState}">${commissionDisplay}</span>
            </div>

            ${(o.uploaded || o.reviewed) ? `<div class="meta-line">${o.uploaded || ''}${o.uploaded && o.reviewed ? '<br>' : ''}${o.reviewed || ''}</div>` : ''}

            ${o.adminNote ? `<div class="admin-note">${icons.warn}<span><b>Admin:</b> ${o.adminNote}</span></div>` : ''}

            <div class="divider"></div>
            ${o.action ? `<div class="footer-row solo"><button class="action-btn ${o.action.type}" style="width:100%;">${o.action.label}</button></div>` : ''}

            <div class="receipt-block">
              ${o.uploaded ? `<button class="receipt-btn" onclick="event.stopPropagation();viewReceipt(${i})">${icons.receipt}View uploaded receipt</button>` : ''}
              <div class="howto-link" onclick="event.stopPropagation();showHowTo()">How to collect fee</div>
            </div>

            <div class="icon-btns-row">
              <div class="icon-btn ${canEditActual ? '' : 'disabled'}">${icons.edit}</div>
              <div class="icon-btn danger ${canEditActual ? '' : 'disabled'}">${icons.trash}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  }).join('');

  attachGalleryScrollHandlers();
}

function toggle(i) {
  orders[i].open = !orders[i].open;
  render();
}

// Opens a modal showing the receipt photo that was uploaded for this order.
function viewReceipt(i) {
  const o = orders[i];
  document.getElementById('modalTitle').textContent = 'Uploaded receipt';
  document.getElementById('modalBody').innerHTML = `
    <div class="receipt-photo" style="background:${photoBgs[i % photoBgs.length]}">🧾</div>
    <div class="receipt-meta">${o.uploaded || ''}</div>
    ${o.reviewed ? `<div class="receipt-meta">${o.reviewed}</div>` : ''}
  `;
  document.getElementById('modalOverlay').classList.add('show');
}

// Opens a modal explaining how commission collection works: request a
// deposit (step 1), collect the receipt (step 2), then the fee breakdown
// and a link through to the full important-notes list.
function showHowTo() {
  document.getElementById('modalTitle').textContent = 'How to collect fee';
  document.getElementById('modalBody').innerHTML = `
    <div class="step-label"><span class="step-num">1</span>Request a deposit from the customer</div>
    <p>Ask the customer to deposit <b style="color:var(--text);">50.00 LYD</b> into this account.</p>
    <div class="pd-box">
      <div class="pd-row">
        <div class="pd-info"><div class="pd-label">Account name</div><div class="pd-value">${paymentDetails.accountName}</div></div>
        <button class="pd-copy" onclick="copyValue('${paymentDetails.accountName}', this)">Copy</button>
      </div>
      <div class="pd-row">
        <div class="pd-info"><div class="pd-label">Account number</div><div class="pd-value">${paymentDetails.accountNumber}</div></div>
        <button class="pd-copy" onclick="copyValue('${paymentDetails.accountNumber}', this)">Copy</button>
      </div>
      <div class="pd-row">
        <div class="pd-info"><div class="pd-label">Bank</div><div class="pd-value">${paymentDetails.bank}</div></div>
        <button class="pd-copy" onclick="copyValue('${paymentDetails.bank}', this)">Copy</button>
      </div>
    </div>

    <div class="step-label step-2"><span class="step-num">2</span>Send the payment receipt</div>
    <p>Once the deposit is made, upload a photo of the receipt so it can be reviewed.</p>
    <div class="upload-box">
      ${icons.uploadBig}
      <span>Tap to upload receipt</span>
    </div>

    <p style="margin-top:14px;">The company will verify the deposit, then credit your funds to your wallet for withdrawal.</p>

    <div class="fee-box">
      <div class="fee-row"><span>Your fee (20%)</span><span>40.00 LYD</span></div>
      <div class="fee-row"><span>Platform fee (5%)</span><span>10.00 LYD</span></div>
      <div class="fee-row total"><span>Total deposit required</span><span>50.00 LYD</span></div>
    </div>

    <button class="action-btn urgent" style="width:100%;margin-top:6px;" onclick="showImportantNotes()">Important notes</button>
  `;
  document.getElementById('modalOverlay').classList.add('show');
}

// Shows the full important-notes list (mirrors the reference screenshot),
// with the last two notes moved to the front.
function showImportantNotes() {
  document.getElementById('modalTitle').textContent = 'Important notes';
  document.getElementById('modalBody').innerHTML = `
    <div class="notes-subtitle">About the upfront deposit</div>
    <div class="notes-card">
      <div class="notes-item"><span class="notes-icon" style="color:var(--ok);">${icons.dollar}</span><p>The fee is deducted from the product price, and is not an additional charge.</p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--ok);">${icons.truck}</span><p>Amount customer pays on delivery: <b style="color:var(--text);">170.00 LYD</b></p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--accent);">${icons.doc}</span><p>Your order will not be sent to the business owner until you upload proof of the upfront payment.</p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--ok);">${icons.shieldCheck}</span><p>Once your payment is reviewed and approved, the amount will appear in your Wallet as secured funds.</p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--accent);">${icons.shield}</span><p>This system protects the rights and responsibilities of both marketers and business owners.</p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--err);">${icons.warn}</span><p>Payments made outside the platform are not protected, and the platform accepts no responsibility for any off-platform transactions.</p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--accent);">${icons.box}</span><p>The amount shown is calculated per unit. If you increase the quantity, the required upfront payment increases accordingly.</p></div>
      <div class="notes-item"><span class="notes-icon" style="color:var(--accent);">${icons.upload}</span><p>After completing the payment, upload your payment receipt to continue.</p></div>
    </div>
    <button class="action-btn neutral" style="width:100%;" onclick="closeModal()">Close</button>
  `;
}

// Copies a payment-details value to the clipboard and briefly confirms it.
function copyValue(text, btn) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  if (btn) {
    const old = btn.textContent;
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = old; }, 1200);
  }
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('modalOverlay').classList.remove('show');
}

// Scrolls a gallery track to a given photo index (used by dot taps).
function scrollToPhoto(trackId, idx) {
  const track = document.getElementById(trackId);
  if (track) track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
}

// Keeps the pagination dots in sync while the user swipes/scrolls the gallery.
function attachGalleryScrollHandlers() {
  document.querySelectorAll('.photo-track').forEach(track => {
    track.addEventListener('scroll', () => {
      const idx = Math.round(track.scrollLeft / track.clientWidth);
      const dotsWrap = track.parentElement.querySelector('.photo-dots');
      if (!dotsWrap) return;
      [...dotsWrap.children].forEach((d, k) => d.classList.toggle('active', k === idx));
    }, { passive: true });
  });
}

render();
</script>
</body>
</html>
