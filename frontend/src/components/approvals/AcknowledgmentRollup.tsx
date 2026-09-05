/**
 * @file AcknowledgmentRollup.tsx
 * @description One-line provenance banner at the top of the amendment review
 * modal, answering a question the diff itself cannot: did the requester actually
 * see what they were changing?
 *
 * ── Why an approver needs this ─────────────────────────────────────────────
 * Post-gate, every amendment carries an explicit acknowledgment for every change
 * the server detected, so the normal case is reassuring and the banner is a
 * one-glance confirmation. The case worth surfacing is the OTHER one: drafts
 * created before the gate shipped carry `acknowledgedChanges: null` and were
 * never checked against anything. Lot A001A6247003 is exactly that — its stated
 * reason was "wrong inspection profile" while the payload also raised two defect
 * counts from 0 to 1. Without this banner an approver has no way to tell those
 * apart from a fully-acknowledged amendment, because nothing else in the modal
 * distinguishes them.
 *
 * ── Reads the stored record, never recomputes ──────────────────────────────
 * The acknowledgment set is a historical fact about what the requester confirmed
 * at draft time, so this renders what was stored. Re-deriving a count from
 * today's diff would answer a different question ("what would this change now")
 * and could drift as config changes underneath a pending amendment.
 *
 * UI_DESIGN_SYSTEM.md §5.3: Emerald/Success for the acknowledged case, Amber for
 * Warning / Action Required on an untracked one — the approver has to do the
 * per-field review manually there, which is precisely "action required".
 */

import { CheckCircle2, AlertTriangle } from 'lucide-react';

export interface AcknowledgmentRollupProps {
  /**
   * `AmendmentLog.acknowledgedChanges` as stored — a JSON `string[]`, or null.
   *
   * NULL IS NOT AN EMPTY SET. Null means the draft predates the gate (or came
   * from a client that never ran it) and nothing was verified; `'[]'` means a
   * gate-aware client ran the diff and legitimately found nothing to
   * acknowledge. Collapsing the two would label an unverified amendment as
   * verified, which is the one mistake this banner exists to prevent.
   */
  acknowledgedChanges: string | null | undefined;
}

/** Parses the stored JSON array, tolerating malformed rows by treating them as untracked. */
function parseAcknowledged(raw: string | null | undefined): string[] | null {
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : null;
  } catch {
    return null;
  }
}

export function AcknowledgmentRollup({ acknowledgedChanges }: AcknowledgmentRollupProps) {
  const acknowledged = parseAcknowledged(acknowledgedChanges);

  if (acknowledged === null) {
    return (
      <div className="p-3 rounded-lg border border-l-4 border-amber-500/30 border-l-amber-500 bg-amber-500/5 flex gap-3 items-start">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Submitted before change-acknowledgment tracking
          </p>
          <p className="text-xs text-amber-400/70 font-sans mt-0.5">
            The requester was never shown a list of what this amendment changes — review every
            field below manually, including any the stated reason does not mention.
          </p>
        </div>
      </div>
    );
  }

  const count = acknowledged.length;

  return (
    <div className="p-3 rounded-lg border border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/5 flex gap-3 items-center">
      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2} />
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-400">
        {count === 0
          ? 'No changes detected — acknowledged by requester'
          : `${count} change${count === 1 ? '' : 's'} detected, all acknowledged by requester`}
      </p>
    </div>
  );
}
