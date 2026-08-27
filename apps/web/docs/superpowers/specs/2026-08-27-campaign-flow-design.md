# Campaign Flow Improvements Design

## Goal

Enhance the campaign detail page with action buttons (publish, activate/pause), inline editing, performance insights, and ad copy preview. Fix Turkey appearing in the country selector.

## Architecture

Builds on existing campaign infrastructure. Campaign detail page becomes the primary interaction surface — read-only view upgraded to actionable. All APIs already exist except Meta status toggle which uses the existing `updateCampaignStatus` function.

## Tech Stack

- Existing: Drizzle ORM, Meta Marketing API, Next.js server/client components
- Existing: `updateCampaignStatus`, `updateCampaign` in `lib/meta/campaigns.ts`
- Existing: PATCH `/api/meta/campaigns/[id]`, POST `/api/meta/campaigns/[id]/publish`

## Global Constraints

- Turkey (TR) must ALWAYS be excluded from ad targeting
- All DB queries scoped to user's `orgId`
- Meta API rate limit: 200 calls/hour/account
- Only admin/manager roles can publish campaigns

---

## 1. Fix: Remove Turkey from Country Selector

In `campaigns/new/page.tsx`, remove "Turkey" from `ALL_COUNTRIES` array. It's currently at line 30 in the list. The `EK53_COUNTRIES` list correctly does not include Turkey.

## 2. Campaign Detail — Action Buttons

Add a client component `campaign-actions.tsx` with:

- **Publish to Meta** button — visible when `approvalStatus === "draft"` and `metaAdAccountId` exists. Calls `POST /api/meta/campaigns/[id]/publish`. After success, revalidate page.
- **Activate** button — visible when `metaStatus === "PAUSED"`. Calls new API endpoint.
- **Pause** button — visible when `metaStatus === "ACTIVE"`. Calls new API endpoint.

Button visibility rules:
| State | Buttons |
|-------|---------|
| draft, no ad account | "Link an ad account first" message |
| draft, has ad account | Publish |
| published, PAUSED | Activate |
| published, ACTIVE | Pause |

## 3. API: Meta Status Toggle

Add to `PATCH /api/meta/campaigns/[id]/route.ts`:
- When `body.metaStatus` is "ACTIVE" or "PAUSED":
  1. Check campaign has `metaCampaignId` (published to Meta)
  2. Check user is admin/manager
  3. Call `updateCampaignStatus(metaCampaignId, status, accountId)` on Meta API
  4. Update local DB `metaStatus` field

## 4. Campaign Detail — Performance Insights

Add a `campaign-insights.tsx` server component. Query `campaignInsights` table for last 7 days for this campaign. Show a summary row: total impressions, clicks, CTR, leads, CPL, spend. If no data, show "Henüz performans verisi yok."

## 5. Campaign Detail — Ad Copy Preview

In overview tab, add a card showing:
- **Headline**: `campaign.headline` or "—"
- **Description**: `campaign.description` or "—"
- **Ad Copy**: `campaign.adCopy` or "—"

Simple read-only display. These fields are already in the campaigns table.

## 6. Campaign Detail — Inline Edit

Add a client component `campaign-edit-form.tsx`:
- Edit button opens an edit mode (in-page, not modal)
- Editable fields: name, dailyBudget, targetCountries, headline, description, adCopy
- Turkey excluded from country selector
- Save calls `PATCH /api/meta/campaigns/[id]`
- Cancel reverts to read-only

## File Plan

| File | Action | Description |
|------|--------|-------------|
| `campaigns/new/page.tsx` | Modify | Remove Turkey from ALL_COUNTRIES |
| `campaigns/[id]/page.tsx` | Modify | Add insights, ad copy preview, wire action/edit components |
| `campaigns/[id]/components/campaign-actions.tsx` | Create | Publish/Activate/Pause buttons (client component) |
| `campaigns/[id]/components/campaign-edit-form.tsx` | Create | Inline edit form (client component) |
| `campaigns/[id]/components/campaign-insights-summary.tsx` | Create | Performance summary row (server component) |
| `api/meta/campaigns/[id]/route.ts` | Modify | Add Meta status toggle to PATCH |

## Non-Goals

- Approval workflow (user confirmed not needed)
- Ad set / ad creation from detail page
- Campaign duplication
- Bulk actions
