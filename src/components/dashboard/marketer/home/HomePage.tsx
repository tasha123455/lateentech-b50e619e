import { useState } from "react";

import { useMarketerData } from "../MarketerDataProvider";
import { isAr, rawSym } from "../lib/format";
import type { Metric, Period } from "../lib/types";
import { Avatar } from "../ui/Avatar";
import { Money } from "../ui/Money";
import { AnalyticsBreakdown } from "./AnalyticsBreakdown";
import { MainChart } from "./MainChart";
import { RingChart } from "./RingChart";
import { marketSymbol } from "@/lib/markets/symbol";

export function HomePage({
  onOpenNotifications, onOpenProfile, onOpenSupport, onOpenWithdraw, unreadCount,
}: {
  onOpenNotifications: () => void;
  onOpenProfile: () => void;
  onOpenSupport: () => void;
  onOpenWithdraw: () => void;
  unreadCount: number;
}) {
  const { profile, avatarUrl, analytics, walletCur, setWalletCur, walletBalance, payout, orders, frozen } =
    useMarketerData();
  const [metric, setMetric] = useState<Metric>("earnings");
  const [period, setPeriod] = useState<Period>("D");
  const [curListOpen, setCurListOpen] = useState(false);

  const name = profile?.full_name || "";
  const first = name ? name.split(/\s+/)[0] : "there";
  const greet = (isAr() ? "هلا، " : "Hey, ") + first;

  const codes = Object.keys(analytics.earnByCur);
  const curData = analytics.earnByCur[walletCur] || { sym: marketSymbol(walletCur), amount: 0 };
  const selSym = curData.sym || "د.ل";

  const ring = analytics.ring[period];
  const frozenTxt = isAr() ? "تم تجميد الحساب مؤقتاً" : "Account temporarily frozen";
  const withdrawEnabled = payout.canWithdraw && !frozen;

  return (
    <>
      <div className="topbar">
        <div className="topbar-left">
          <Avatar
            className="avatar"
            url={avatarUrl}
            name={name}
            style={{ cursor: "pointer" }}
            onClick={onOpenProfile}
          />
          <div>
            <div className="greet" data-no-i18n>{greet}</div>
            <div className="greet-sub">Marketer</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={onOpenSupport}
            aria-label="Support"
            style={{
              height: 36, padding: "0 14px", borderRadius: 10, border: "0.5px solid rgba(224,112,112,0.35)",
              background: "rgba(58,26,26,0.9)", color: "#f0eeeb", fontSize: 13, fontWeight: 600,
              cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)",
            }}
          >
            <span data-i18n="Support">Support</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e07070" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </svg>
          </button>
          <div className="notif-btn" onClick={onOpenNotifications}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-primary)" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
            </svg>
            {unreadCount > 0 && <div className="notif-dot">{unreadCount > 99 ? "99+" : String(unreadCount)}</div>}
          </div>
        </div>
      </div>

      <div className="wallet-card">
        {/* The big number is what they can actually withdraw. Commission on
            orders still in progress sits on the line below rather than being
            added in: a wallet that shows money the Withdraw button will not
            release is a wallet that has lied to them. */}
        <div className="wallet-label">{payout.onTheWay > 0 ? "AVAILABLE TO WITHDRAW" : "WALLET BALANCE"}</div>
        <div className="wallet-amount"><Money n={walletBalance} sym={selSym} code={walletCur} /></div>
        {payout.onTheWay > 0 ? (
          <div className="wallet-pending" data-no-i18n>
            {isAr() ? "في الطريق: " : "On the way: "}
            <Money n={payout.onTheWay} sym={selSym} code={walletCur} />
            {isAr() ? " — تصبح متاحة عند التسليم" : " — available once delivered"}
          </div>
        ) : (
          <div className="wallet-pending" />
        )}
        {frozen && (
          <div
            style={{
              margin: "8px 0 12px", padding: "10px 12px", borderRadius: 10,
              background: "rgba(234,179,8,0.10)", border: "0.5px solid rgba(234,179,8,0.35)",
              color: "#eab308", fontSize: 12, fontWeight: 600, textAlign: "center",
            }}
          >
            {frozenTxt}
          </div>
        )}
        {codes.length > 1 && (
          <div
            style={{
              margin: "-4px 0 14px 0", padding: "10px 12px", borderRadius: 12, background: "#141414",
              border: "0.5px solid #232323", fontSize: 11, color: "rgba(255,255,255,0.7)", lineHeight: 1.6,
            }}
          >
            <button
              data-no-i18n
              onClick={() => setCurListOpen((v) => !v)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                padding: "9px 12px", borderRadius: 10, border: "0.5px solid #232323", background: "#141414",
                color: "#fff", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ opacity: 0.55, letterSpacing: "0.04em" }}>
                  {isAr() ? "الأرباح حسب العملة" : "EARNINGS BY CURRENCY"}
                </span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ opacity: 0.85 }}>{codes.length} currencies</span>
              </span>
              <span style={{ display: "inline-block", transition: "transform .15s", opacity: 0.7, transform: curListOpen ? "rotate(180deg)" : undefined }}>
                ▾
              </span>
            </button>
            {curListOpen && (
              <div style={{ marginTop: 8 }}>
                {codes.map((c) => {
                  const active = c === walletCur;
                  const amount = active ? walletBalance : analytics.earnByCur[c].amount;
                  return (
                    <button
                      key={c}
                      data-no-i18n
                      onClick={() => setWalletCur(c)}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                        width: "100%", margin: "0 0 6px 0", padding: "10px 12px", borderRadius: 10,
                        border: "0.5px solid " + (active ? "#7f77dd" : "#232323"),
                        background: active ? "#1a1830" : "#0f0f0f", color: "#fff", fontSize: 12,
                        cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span style={{ opacity: 0.7 }}>{rawSym(analytics.earnByCur[c].sym, c)}</span>
                        <span>{c}</span>
                      </span>
                      <span style={{ fontWeight: 500 }}>
                        <Money n={amount} sym={analytics.earnByCur[c].sym} code={c} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="wallet-row">
          <div className="wallet-meta" style={frozen ? { color: "#eab308" } : undefined}>
            {payout.pending ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                ⏳ <span>{payout.statusText}</span>
              </span>
            ) : (
              payout.statusText
            )}
          </div>
          <button
            className={"withdraw-btn" + (withdrawEnabled ? "" : " disabled")}
            onClick={onOpenWithdraw}
            disabled={!withdrawEnabled}
            style={{
              opacity: withdrawEnabled ? 1 : 0.45,
              cursor: withdrawEnabled ? "pointer" : "not-allowed",
            }}
          >
            {isAr() ? "سحب" : "Withdraw"}
          </button>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-top">
          <div className="chart-toggle">
            <button className={"ctoggle" + (metric === "earnings" ? " active" : "")} onClick={() => setMetric("earnings")}>
              Earnings
            </button>
            <button className={"ctoggle" + (metric === "pieces" ? " active" : "")} onClick={() => setMetric("pieces")}>
              Pieces sold
            </button>
          </div>
          <div className="period-tabs">
            {(["D", "M", "Y"] as Period[]).map((p) => (
              <button key={p} className={"ptab" + (period === p ? " active" : "")} onClick={() => setPeriod(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <MainChart
          series={analytics.chartData[metric][period]}
          metric={metric}
          period={period}
          selSym={selSym}
          walletCur={walletCur}
        />
        <div className="analytics-row">
          <RingChart ok={ring.ok} fail={ring.fail} />
          <div className="analytics-legend">
            <div className="leg-row">
              <div className="leg-left">
                <div className="leg-dot" style={{ background: "#35c98f" }} />
                Delivered
              </div>
              <div className="leg-val" style={{ color: "#35c98f" }}>{ring.ok.toLocaleString()}</div>
            </div>
            <div className="leg-row">
              <div className="leg-left">
                <div className="leg-dot" style={{ background: "#e2685f" }} />
                Failed (COD)
              </div>
              <div className="leg-val" style={{ color: "#e2685f" }}>{ring.fail.toLocaleString()}</div>
            </div>
          </div>
        </div>
      </div>

      <AnalyticsBreakdown orders={orders} walletCur={walletCur} selSym={selSym} />
    </>
  );
}
