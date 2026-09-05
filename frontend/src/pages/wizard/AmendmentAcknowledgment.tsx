/**
 * @file AmendmentAcknowledgment.tsx
 * @description Per-change acknowledgment checklist shown in Step 4 (Review &
 * Submit) while the wizard is in amendment mode.
 *
 * ── Why per-change and not one "I confirm" box ─────────────────────────────
 * A single blanket checkbox is a click-through: it costs the same whether the
 * amendment changes one field or twelve, so it proves nothing about whether the
 * requester actually saw any of them. The case this exists for is lot
 * A001A6247003, whose stated reason was "wrong inspection profile" while the
 * same submission also raised two defect counts from 0 to 1 — a blanket
 * checkbox would have been ticked just as readily. One box per change means the
 * cost of confirming scales with what is being changed, and an unexpected line
 * item is something the operator has to physically look at.
 *
 * ── The list is the SERVER's diff, never a local one ───────────────────────
 * Changes come from POST /api/submissions/:id/amendment-preview, which runs the
 * same computeAmendmentChanges() the submit gate runs. Deriving the list
 * client-side would let the checklist and the gate disagree, and the direction
 * that breaks is unrecoverable: every box ticked, submit still 400s, and no UI
 * for the change that has no box.
 *
 * UI_DESIGN_SYSTEM.md: §5.3 Amber (Warning / Action Required) for the container
 * — this blocks submission, which is exactly that semantic. Rose/Emerald for the
 * old -> new value pair, matching §4.12's established diff convention so a change
 * reads the same here as in the approver's AmendmentDiffView.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { API_BASE_URL, useConfig } from '../../context/ConfigContext';
import { authHeader, useAuth } from '../../context/AuthContext';
import {
  buildAmendmentChangeDisplays,
  sortChangeDisplays,
  type AmendmentChange,
  type AmendmentChangeDisplay,
} from '../../lib/amendmentChangeLabels';

export interface AmendmentAcknowledgmentProps {
  /** Submission being amended — the diff's "before" side. */
  submissionId: string;
  /** Exactly the payload that will be submitted (buildAmendmentNewValues). */
  newValues: Record<string, unknown>;
  /** Profile the record carried before this amendment, for defect-label resolution. */
  beforeProfileId: string | null | undefined;
  /**
   * Reports the gate-relevant state upward on every change. `ready` is what the
   * submit button gates on: it is false while loading, on error, and whenever a
   * detected change is still unticked.
   */
  onChange: (state: { ready: boolean; acknowledgedPaths: string[]; totalChanges: number }) => void;
}

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; changes: AmendmentChange[] };

export function AmendmentAcknowledgment({
  submissionId,
  newValues,
  beforeProfileId,
  onChange,
}: AmendmentAcknowledgmentProps) {
  const { config } = useConfig();
  const { user } = useAuth();

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [retryTick, setRetryTick] = useState(0);

  // `submissionTimestamp` is regenerated on every build of the payload and would
  // otherwise refetch the diff on each render. It sits in the gate's exclusion
  // set, so dropping it from the signature cannot mask a real change.
  const payloadSignature = useMemo(() => {
    const { submissionTimestamp: _ignored, ...rest } = newValues as Record<string, unknown>;
    return JSON.stringify(rest);
  }, [newValues]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    fetch(`${API_BASE_URL}/api/submissions/${submissionId}/amendment-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(user) },
      body: JSON.stringify({ newValues }),
    })
      .then(async (res) => {
        if (!res.ok) {
          let errStr = res.statusText;
          try {
            const errJson = await res.json();
            errStr = errJson?.error ?? errStr;
          } catch {
            // Non-JSON error body — keep the status text we already have.
          }
          throw new Error(`Server responded ${res.status}: ${errStr}`);
        }
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const changes: AmendmentChange[] = data.changes ?? [];
        setState({ status: 'success', changes });
        // Every recomputed diff starts unticked. A payload edit can add, remove
        // or alter a change, so carrying ticks across would let a box confirmed
        // against an older value stand for a newer one.
        setChecked({});
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn('[AmendmentAcknowledgment] amendment-preview failed:', message);
        setState({ status: 'error', message });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submissionId, payloadSignature, retryTick]);

  const displays: AmendmentChangeDisplay[] = useMemo(() => {
    if (state.status !== 'success') return [];
    return sortChangeDisplays(
      buildAmendmentChangeDisplays({
        changes: state.changes,
        config,
        productCode: newValues['productCode'] as string | undefined,
        beforeProfileId,
        afterProfileId: newValues['profileId'] as string | undefined,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, config, beforeProfileId, payloadSignature]);

  const acknowledgedPaths = useMemo(
    () => displays.filter((d) => checked[d.path]).map((d) => d.path),
    [displays, checked],
  );

  const totalChanges = displays.length;
  const allChecked = state.status === 'success' && acknowledgedPaths.length === totalChanges;

  useEffect(() => {
    onChange({ ready: allChecked, acknowledgedPaths, totalChanges });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChecked, acknowledgedPaths, totalChanges]);

  // ── Loading / error ──────────────────────────────────────────────────────

  if (state.status === 'loading') {
    return (
      <div className="p-3 rounded-lg border border-l-4 border-gray-700 border-l-gray-600 bg-canvas/40 flex gap-3 items-center">
        <Loader2 className="w-5 h-5 text-muted shrink-0 animate-spin" strokeWidth={2} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted">
          Detecting changes for acknowledgment…
        </span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="p-3 rounded-lg border border-l-4 border-rose-500/30 border-l-rose-500 bg-rose-500/5 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" strokeWidth={2} />
        <div className="flex-1 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-400">
            Could not detect changes
          </p>
          <p className="text-xs text-muted">
            This amendment cannot be submitted until the change list loads — the server
            re-checks it on submit and would reject an unacknowledged change.
          </p>
          <p className="text-[10px] font-mono text-rose-400/70 break-all">{state.message}</p>
          <button
            type="button"
            onClick={() => setRetryTick((t) => t + 1)}
            className="h-8 px-3 rounded-lg bg-surface border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 font-bold text-[10px] uppercase tracking-wider flex items-center gap-2 transition-colors outline-none"
          >
            <RefreshCw className="w-3 h-3" strokeWidth={2.5} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── No changes ───────────────────────────────────────────────────────────

  if (totalChanges === 0) {
    return (
      <div className="p-3 rounded-lg border border-l-4 border-gray-700 border-l-gray-600 bg-canvas/40 flex gap-3 items-center">
        <CheckCircle2 className="w-5 h-5 text-muted shrink-0" strokeWidth={2} />
        <span className="text-xs text-muted">
          No field changes detected — this amendment would record a reason without altering the record.
        </span>
      </div>
    );
  }

  // ── The checklist ────────────────────────────────────────────────────────

  return (
    <div className="p-4 rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Confirm {totalChanges} detected change{totalChanges === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-amber-400/70 font-sans mt-1">
            Every change this amendment makes is listed below. Confirm each one — including any
            you did not expect — before submitting.
          </p>
        </div>
        <span
          className={`shrink-0 text-[10px] font-mono font-bold px-2 py-1 rounded-md border ${
            allChecked
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}
        >
          {acknowledgedPaths.length} / {totalChanges}
        </span>
      </div>

      <div className="divide-y divide-amber-500/10 border border-amber-500/20 rounded-lg overflow-hidden bg-canvas/40">
        {displays.map((d) => {
          const isChecked = Boolean(checked[d.path]);
          return (
            <label
              key={d.path}
              className="flex items-start gap-3 px-3 py-2.5 cursor-pointer select-none hover:bg-amber-500/5 transition-colors"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => setChecked((prev) => ({ ...prev, [d.path]: e.target.checked }))}
                className="w-4 h-4 mt-0.5 shrink-0 rounded border-gray-700 bg-canvas text-brand-primary focus:ring-brand-secondary focus:ring-offset-canvas"
              />
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4">
                <span
                  className={`text-[11px] font-bold uppercase tracking-wide shrink-0 sm:max-w-[50%] ${
                    isChecked ? 'text-muted' : 'text-primary'
                  }`}
                >
                  {d.label}
                </span>
                <span className="text-sm font-mono flex items-center gap-2 flex-wrap sm:justify-end min-w-0">
                  <span className="text-rose-400 opacity-60 break-all">{d.from}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted shrink-0" strokeWidth={2} />
                  <span className="text-emerald-400 font-semibold break-all">{d.to}</span>
                </span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
