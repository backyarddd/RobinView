import { useEffect, useMemo, useState } from "react";
import { useStore } from "../../store/useStore";
import { api } from "../../lib/api";
import type { OrderRequest, OrderReview, OrderResult, OrderType, OrderSide } from "@shared/types";
import { price as fmtPrice, money, shares as fmtShares } from "../../lib/format";

const TYPES: { key: OrderType; label: string }[] = [
  { key: "market", label: "Market" },
  { key: "limit", label: "Limit" },
  { key: "stop_market", label: "Stop" },
  { key: "stop_limit", label: "Stop Limit" },
];

type Phase = "edit" | "reviewing" | "review" | "placing" | "done";

export function TradeTicket() {
  const ticket = useStore((s) => s.ticket);
  const close = useStore((s) => s.closeTicket);
  if (!ticket) return null;
  // Remount per ticket so all local field state resets cleanly.
  return <Ticket key={`${ticket.symbol}-${ticket.side}-${ticket.qty ?? ""}`} onClose={close} />;
}

function Ticket({ onClose }: { onClose: () => void }) {
  const ticket = useStore((s) => s.ticket)!;
  const mode = useStore((s) => s.mode);
  const account = useStore((s) => s.account);
  const accounts = useStore((s) => s.accounts);
  const quote = useStore((s) => s.quotes[ticket.symbol]);
  const position = useStore((s) => s.positions.find((p) => p.symbol === ticket.symbol));
  const portfolio = useStore((s) => s.portfolio);
  const refreshAccount = useStore((s) => s.refreshAccount);

  const [side, setSide] = useState<OrderSide>(ticket.side);
  const [type, setType] = useState<OrderType>("market");
  const [amountMode, setAmountMode] = useState<"shares" | "dollars">("shares");
  const [qtyStr, setQtyStr] = useState(ticket.qty != null ? String(ticket.qty) : "");
  const [dollarStr, setDollarStr] = useState("");
  const [limitStr, setLimitStr] = useState("");
  const [stopStr, setStopStr] = useState("");
  const [tif, setTif] = useState<"gfd" | "gtc">("gfd");
  const [hours, setHours] = useState<"regular_hours" | "extended_hours">("regular_hours");

  const [phase, setPhase] = useState<Phase>("edit");
  const [review, setReview] = useState<OrderReview | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acct = accounts.find((a) => a.accountNumber === account);
  const canTrade = mode === "demo" || !!acct?.agenticAllowed;
  const held = position?.quantity ?? 0;
  const usesLimit = type === "limit" || type === "stop_limit";
  const usesStop = type === "stop_market" || type === "stop_limit";
  const allowDollars = type === "market";

  // Live cost estimate as the user types (before they hit Review).
  const refPrice = usesLimit ? Number(limitStr) || quote?.price || 0 : quote?.price || 0;
  const estQty =
    allowDollars && amountMode === "dollars" ? (refPrice ? Number(dollarStr) / refPrice : 0) : Number(qtyStr) || 0;
  const estCost = refPrice * estQty;

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const req = useMemo((): OrderRequest | null => {
    const base = { symbol: ticket.symbol, side, type, timeInForce: tif, marketHours: hours };
    const qty = Number(qtyStr);
    const dollars = Number(dollarStr);
    const limit = Number(limitStr);
    const stop = Number(stopStr);
    if (type === "market" && amountMode === "dollars") {
      return dollars > 0 ? { ...base, dollarAmount: dollars } : null;
    }
    if (!(qty > 0)) return null;
    if (type === "market") return { ...base, quantity: qty };
    if (type === "limit") return limit > 0 ? { ...base, quantity: qty, limitPrice: limit } : null;
    if (type === "stop_market") return stop > 0 ? { ...base, quantity: qty, stopPrice: stop } : null;
    return limit > 0 && stop > 0 ? { ...base, quantity: qty, limitPrice: limit, stopPrice: stop } : null;
  }, [ticket.symbol, side, type, amountMode, qtyStr, dollarStr, limitStr, stopStr, tif, hours]);

  const setQtyPct = (pct: number) => {
    setAmountMode("shares");
    const q = held * pct;
    setQtyStr(String(Number.isInteger(q) ? q : Number(q.toFixed(6))));
  };

  async function doReview() {
    if (!req) return;
    setError(null);
    setPhase("reviewing");
    try {
      const r = await api.reviewOrder(account, req);
      setReview(r);
      setPhase("review");
    } catch (e: any) {
      setError(String(e?.message || e));
      setPhase("edit"); // surface the error back in the form
    }
  }

  async function doPlace() {
    if (!req) return;
    setError(null);
    setPhase("placing");
    try {
      const r = await api.placeOrder(account, req);
      setResult(r);
      setPhase("done");
      refreshAccount();
      setTimeout(onClose, 1800);
    } catch (e: any) {
      setError(String(e?.message || e));
      setPhase("review"); // keep the confirmation context, show the error
    }
  }

  const buy = side === "buy";
  const accentVar = buy ? "var(--up)" : "var(--down)";
  const busy = phase === "reviewing" || phase === "placing";

  return (
    <div className="tt-overlay" onClick={onClose}>
      <div className="tt" onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="tt-head">
          <div>
            <div className="tt-side" style={{ color: accentVar }}>
              {buy ? "Buy" : "Sell"} {ticket.symbol}
            </div>
            <div className="dim" style={{ fontSize: 12 }}>
              {quote ? `${fmtPrice(quote.price)} · ${quote.name ?? ""}` : "—"}
            </div>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Close" style={{ fontSize: 18 }}>
            ✕
          </button>
        </div>

        {!canTrade && (
          <div className="tt-warn">
            {acct
              ? "This account isn't enabled for agentic trading, so RobinView can't place orders on it."
              : "Connect Robinhood to place live orders."}
          </div>
        )}

        {/* body - edit */}
        {(phase === "edit" || phase === "reviewing") && (
          <div className="tt-body">
            {/* side */}
            <div className="seg tt-seg">
              <button className={buy ? "on" : ""} onClick={() => setSide("buy")}>
                Buy
              </button>
              <button className={!buy ? "on" : ""} onClick={() => setSide("sell")}>
                Sell
              </button>
            </div>

            {/* order type */}
            <label className="tt-label">Order type</label>
            <div className="seg tt-seg">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  className={type === t.key ? "on" : ""}
                  onClick={() => {
                    setType(t.key);
                    if (t.key !== "market" && amountMode === "dollars") setAmountMode("shares");
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* amount */}
            <div className="tt-row">
              <label className="tt-label" style={{ margin: 0 }}>
                Amount
              </label>
              {allowDollars && (
                <div className="seg tt-seg sm" style={{ marginLeft: "auto" }}>
                  <button className={amountMode === "shares" ? "on" : ""} onClick={() => setAmountMode("shares")}>
                    Shares
                  </button>
                  <button className={amountMode === "dollars" ? "on" : ""} onClick={() => setAmountMode("dollars")}>
                    Dollars
                  </button>
                </div>
              )}
            </div>
            {amountMode === "dollars" && allowDollars ? (
              <div className="tt-input">
                <span className="tt-prefix">$</span>
                <input
                  inputMode="decimal"
                  placeholder="0.00"
                  value={dollarStr}
                  onChange={(e) => setDollarStr(e.target.value)}
                  autoFocus
                />
              </div>
            ) : (
              <div className="tt-input">
                <input
                  inputMode="decimal"
                  placeholder="0"
                  value={qtyStr}
                  onChange={(e) => setQtyStr(e.target.value)}
                  autoFocus
                />
                <span className="tt-suffix">shares</span>
              </div>
            )}

            {/* sell quick-fills from holding */}
            {!buy && held > 0 && amountMode === "shares" && (
              <div className="tt-quick">
                <span className="dim" style={{ fontSize: 11 }}>
                  Hold {fmtShares(held)}:
                </span>
                {[0.25, 0.5, 1].map((p) => (
                  <button key={p} className="btn sm ghost" onClick={() => setQtyPct(p)}>
                    {p === 1 ? "All" : `${p * 100}%`}
                  </button>
                ))}
              </div>
            )}

            {/* conditional price fields */}
            {(usesLimit || usesStop) && (
              <div className="tt-grid2">
                {usesStop && (
                  <div>
                    <label className="tt-label">Stop price</label>
                    <div className="tt-input">
                      <span className="tt-prefix">$</span>
                      <input inputMode="decimal" placeholder="0.00" value={stopStr} onChange={(e) => setStopStr(e.target.value)} />
                    </div>
                  </div>
                )}
                {usesLimit && (
                  <div>
                    <label className="tt-label">Limit price</label>
                    <div className="tt-input">
                      <span className="tt-prefix">$</span>
                      <input inputMode="decimal" placeholder="0.00" value={limitStr} onChange={(e) => setLimitStr(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TIF + hours */}
            <div className="tt-grid2">
              <div>
                <label className="tt-label">Time in force</label>
                <select className="tt-select" value={tif} onChange={(e) => setTif(e.target.value as any)}>
                  <option value="gfd">Good for day</option>
                  <option value="gtc">Good till cancelled</option>
                </select>
              </div>
              <div>
                <label className="tt-label">Session</label>
                <select className="tt-select" value={hours} onChange={(e) => setHours(e.target.value as any)}>
                  <option value="regular_hours">Regular hours</option>
                  <option value="extended_hours">Extended hours</option>
                </select>
              </div>
            </div>

            {/* live estimate */}
            <div className="tt-est">
              <span className="k">Est. {buy ? "cost" : "credit"}</span>
              <span className="v mono">{estCost > 0 ? money(estCost) : "—"}</span>
            </div>
            {portfolio && (
              <div className="tt-est sub">
                <span className="k">Buying power</span>
                <span className="v mono">{money(portfolio.buyingPower)}</span>
              </div>
            )}

            {error && <div className="tt-error">{error}</div>}

            <button
              className="btn tt-cta"
              style={{ background: accentVar }}
              disabled={!req || !canTrade || busy}
              onClick={doReview}
            >
              {phase === "reviewing" ? "Reviewing…" : "Review order"}
            </button>
            <div className="dim" style={{ fontSize: 10.5, textAlign: "center", marginTop: 8 }}>
              {mode === "demo"
                ? "Demo mode - orders are simulated, no real money."
                : "Routed through the Robinhood agentic API. You confirm after review."}
            </div>
          </div>
        )}

        {/* review confirmation (stays mounted while placing) */}
        {(phase === "review" || phase === "placing") && review && (
          <div className="tt-body">
            <div className="tt-confirm-title" style={{ color: accentVar }}>
              {buy ? "Buy" : "Sell"} {review.quantity ? fmtShares(review.quantity) : ""} {review.symbol}
            </div>
            <div className="tt-summary">
              <Row k="Type" v={TYPES.find((t) => t.key === review.type)?.label ?? review.type} />
              {review.estimatedPrice != null && <Row k="Est. price" v={fmtPrice(review.estimatedPrice)} />}
              {review.estimatedCost != null && (
                <Row k={`Est. ${buy ? "cost" : "credit"}`} v={money(review.estimatedCost)} strong />
              )}
              {review.buyingPower != null && <Row k="Buying power" v={money(review.buyingPower)} />}
              <Row k="Time in force" v={tif === "gfd" ? "Good for day" : "Good till cancelled"} />
            </div>

            {review.alerts.length > 0 && (
              <div className="tt-alerts">
                {review.alerts.map((a, i) => (
                  <div key={i} className="tt-alert">
                    ⚠ {a}
                  </div>
                ))}
              </div>
            )}

            {error && <div className="tt-error">{error}</div>}

            <div className="tt-actions">
              <button className="btn ghost" onClick={() => setPhase("edit")} disabled={busy}>
                Back
              </button>
              <button
                className="btn tt-cta"
                style={{ background: accentVar, flex: 1 }}
                onClick={doPlace}
                disabled={busy}
              >
                {phase === "placing" ? "Placing…" : `Place ${buy ? "buy" : "sell"} order`}
              </button>
            </div>
          </div>
        )}

        {/* done */}
        {phase === "done" && (
          <div className="tt-done">
            <div className="tt-check" style={{ background: accentVar }}>
              ✓
            </div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{result?.message ?? "Order placed"}</div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
              {buy ? "Bought" : "Sold"} {review?.quantity ? fmtShares(review.quantity) : ""} {review?.symbol ?? ""}
              {result?.state ? ` · ${result.state}` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="tt-est" style={strong ? { fontWeight: 600 } : undefined}>
      <span className="k">{k}</span>
      <span className="v mono">{v}</span>
    </div>
  );
}
