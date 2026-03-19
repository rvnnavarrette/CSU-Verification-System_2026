# Realtime Status Updates — Implementation Notes

## Status Values (verification_requests.status)
Four valid values after migration (add-under-review-status.sql):
  pending | under_review | verified | not_verified

## Key Rule: pending stat card = pending + under_review
Both pending and under_review = "not yet decided". All count functions
(updateCounts in admin, loadRequests in user, handleRealtimeStatusChange)
use: r.status === "pending" || r.status === "under_review"

## Admin Side — markUnderReview()
- Called at top of openDetail() (admin modal open)
- Guard: only fires if req.status === "pending" — no-op otherwise
- Non-blocking: errors logged but modal still opens
- After migration: opens review modal → instantly updates user's tracker

## User Side — subscribeToMyRequests()
- Called in initDashboard() after loadRequests()
- Channel: "user-my-requests", event: UPDATE, filter: user_id=eq.<uid>
- Requires REPLICA IDENTITY FULL on verification_requests (done in migration)
- Requires Supabase Realtime toggled ON for verification_requests table in Dashboard

## handleRealtimeStatusChange(updatedRow)
- Updates allUserRequests cache
- Calls: filterRequests(), recentBody.innerHTML, renderStatusTracker(), stat counts
- Falls back to loadRequests() if row not in cache
- Calls showStatusChangeToast(newStatus) when status changes

## showStatusChangeToast(newStatus)
- Appended to #alertContainer
- under_review → blue left border, 9s auto-dismiss
- verified → green, not_verified → red
- No toast for pending (would be redundant on initial load)

## isUnderReview in renderStatusTracker
- Uses real DB value first: req.status === "under_review" || ...verified/not_verified
- Legacy fallback: non-empty document_assessment (for rows reviewed before migration)

## CSS badge — .badge-under-review
- Defined in TWO places in styles.css (both must stay in sync):
  1. Base block (~line 1654): background-color: var(--color-info, #3b82f6); color: #fff
  2. Section 31f pill block: background: rgba(59,130,246,0.12); color: #1d4ed8; border: 1px solid rgba(59,130,246,0.3)

## Supabase Dashboard Prerequisite
Supabase → Database → Replication → verification_requests must be toggled ON
for Realtime to broadcast changes from this table.

## Filter tab "Pending" in admin
renderRequests() pending filter: r.status === "pending" || r.status === "under_review"
Under_review rows appear in the Pending tab, not their own tab.
