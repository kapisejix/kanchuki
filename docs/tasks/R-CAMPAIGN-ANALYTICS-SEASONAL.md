# Task R: Campaign Analytics — Wedding-Season vs Daily-Wear Comparison (Phase 1 Dashboard Refinement)

**Status:** ✅ **Built** 2026-08-18 (BUILD-LOG §51). Seasonal section added to growth analytics screen with Wedding/Daily toggle, category-level metrics with delta %, biggest-swing summary. Backend: `GET /growth/analytics/seasonal` endpoint. No new DB tables — queries existing CustomerInteraction + Campaign models.

---

## Gap Summary

| Sub-Feature | Status | Notes |
|---|---|---|
| Wedding-season vs daily-wear category comparison | ✅ Built | `GET /growth/analytics/seasonal` + mobile Seasonal section in growth analytics screen. Period: Wedding (Oct–Feb) vs Daily (Mar–Sep). |

---

## Current Implementation (Built)

**Analytics Screen (`apps/mobile/app/(tabs)/analytics.tsx` or equivalent)** shows:

- **Festival performance** — Sends, opens, enquiries, orders per festival (Diwali, Navratri, Wedding Season, etc.)
- **Customer segments** — VIP, Budget, Inactive breakdown
- **Hour-of-day** — WhatsApp open rates by send time
- **Product category** — Top categories by engagement
- **Video vs Photo** — Media-type performance
- **A/B Variant stats** — Per-variant sent/opened + two-proportion z-test winner callout

**Data Sources:**
- `Campaign` + `CampaignSend` + `CampaignEvent` (open, click, enquiry)
- `Product.category` (e.g., "Saree", "Lehenga", "Suit", "Kurta", "Blouse", "Dupatta", "Accessories")
- `Order` + `OrderItem` for conversion attribution

---

## Required Work

### 1. Define "Wedding Season" vs "Daily Wear" Periods

| Period | Months | Typical Categories |
|---|---|---|
| **Wedding Season** | Oct, Nov, Dec, Jan, Feb | Lehenga, Sherwani, Heavy Saree, Bridal Jewelry, Groom Wear, Indo-Western |
| **Daily Wear** | Mar, Apr, May, Jun, Jul, Aug, Sep | Cotton Suit, Kurta, Casual Saree, Leggings, Dupatta, Blouse, Nightwear |

**Configuration:** Store as admin-configurable mapping (default to above) in `FestivalCalendar` or new `SeasonalPeriod` model.

### 2. New Dashboard View: "Seasonal Category Comparison"

**Location:** Analytics screen → new tab/segment: **"Seasonal View"**

#### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Seasonal Category Comparison        [Wedding] [Daily] [YoY] │
├──────────────┬──────────────┬──────────────┬────────────────┤
│ Category     │ Wedding Season│ Daily Wear   │ Delta (W-D)    │
├──────────────┼──────────────┼──────────────┼────────────────┤
│ Lehenga      │  1,240 opens │   180 opens  │  +589% ▲       │
│ Saree (Heavy)│    980 opens │   420 opens  │  +133% ▲       │
│ Suit (Cotton)│    310 opens │  1,850 opens │  -83% ▼        │
│ Kurta        │    450 opens │  1,200 opens │  -63% ▼        │
│ Blouse       │    670 opens │   890 opens  │  -25% ▼        │
└──────────────┴──────────────┴──────────────┴────────────────┘
```

#### Metrics per Category (per period)

| Metric | Description |
|---|---|
| **Campaign Sends** | Total WhatsApp messages sent featuring this category |
| **Opens** | Unique opens attributed to category |
| **Enquiries** | Customer enquiries for products in this category |
| **Orders** | Confirmed orders (if order tracking linked) |
| **Revenue** | Estimated/actual revenue (if price captured) |
| **Conversion Rate** | Enquiries ÷ Opens (or Orders ÷ Enquiries) |

#### Controls

- **Period Selector:** Wedding Season / Daily Wear / Custom Range / YoY Compare
- **Category Filter:** Multi-select (default: all categories with data)
- **Metric Toggle:** Sends / Opens / Enquiries / Orders / Revenue / Conv. Rate
- **Export:** CSV button for retailer download

### 3. Backend Aggregation Query

**New Endpoint:** `GET /v1/growth/analytics/seasonal-category-comparison`

**Query Params:**
- `retailer_id` (from auth)
- `period`: `wedding` | `daily` | `custom` (with `start_date`, `end_date`)
- `compare`: `previous_period` | `yoy` | `none`
- `metrics`: comma-separated list (default: `sends,opens,enquiries,orders`)
- `categories`: optional filter

**Response Shape:**
```json
{
  "period": { "label": "Wedding Season 2025", "start": "2025-10-01", "end": "2026-02-28" },
  "comparePeriod": { "label": "Daily Wear 2025", "start": "2025-03-01", "end": "2025-09-30" },
  "categories": [
    {
      "category": "Lehenga",
      "current": { "sends": 45, "opens": 1240, "enquiries": 89, "orders": 12, "revenue": 245000 },
      "compare": { "sends": 12, "opens": 180, "enquiries": 8, "orders": 1, "revenue": 18000 },
      "deltaPct": { "opens": 589, "enquiries": 1012, "orders": 1100, "revenue": 1261 }
    }
  ],
  "summary": {
    "topWeddingCategory": "Lehenga",
    "topDailyCategory": "Cotton Suit",
    "biggestSwing": { "category": "Lehenga", "metric": "opens", "deltaPct": 589 }
  }
}
```

### 4. Mobile UI Integration

- Add **"Seasonal"** tab in Analytics screen (alongside Overview, Campaigns, A/B Tests).
- Reuse existing chart components (bar, grouped bar, sparkline).
- Loading / empty states for retailers with insufficient data.
- Pull-to-refresh.

---

## Database Considerations

No new tables required. Uses existing:
- `Campaign` (has `festival_id`, `category_focus`, `created_at`)
- `CampaignSend` (links to `Campaign`, has `sent_at`)
- `CampaignEvent` (type: `open`, `click`, `enquiry`; links to `CampaignSend`)
- `Product.category` (string enum)
- `Order` / `OrderItem` (for revenue attribution)

**Index Optimization (if needed):**
```sql
CREATE INDEX IF NOT EXISTS idx_campaign_festival_created 
  ON "Campaign" ("festival_id", "created_at");
CREATE INDEX IF NOT EXISTS idx_campaign_send_campaign_sent 
  ON "CampaignSend" ("campaign_id", "sent_at");
```

---

## Acceptance Criteria

- [x] Seasonal period definitions configurable (default: Oct–Feb = Wedding, Mar–Sep = Daily).
- [x] API returns category-level metrics for both periods with delta %.
- [x] Mobile Analytics screen has "Seasonal" tab with grouped bar chart + table.
- [x] Retailer can toggle metric (Opens/Enquiries/Orders/Revenue/Conv. Rate).
- [x] YoY compare works (Wedding 2025 vs Wedding 2024).
- [x] Empty state guides retailer: "Run festival campaigns to unlock seasonal insights."
- [x] Performance: API < 500ms for 12 months of data.

---

## Effort Estimate

| Sub-Task | Effort | Priority |
|---|---|---|
| Seasonal period config + backend aggregation | Medium | P1 |
| API endpoint + query optimization | Medium | P1 |
| Mobile UI: Seasonal tab + charts + controls | Medium | P1 |
| Testing + empty states | Low | P1 |

**Total:** ~2–3 weeks.

---

## Dependencies

- Existing analytics infrastructure (Campaign, CampaignSend, CampaignEvent) must have sufficient data.
- Festival calendar (`FestivalCalendar` model) used to tag campaigns — ensure wedding-season campaigns are tagged correctly.
- Category taxonomy on `Product` must be consistent (cleanup if needed).

---

## References

- Main roadmap: `docs/INDIA-RETAILER-GROWTH.md` (Feature R, line 342–356)
- Build log: `docs/BUILD-LOG.md` §47
- Analytics screen: `apps/mobile/app/(tabs)/analytics.tsx`
- Campaign analytics API: `apps/api/src/routes/growth/analytics.ts`
- Festival calendar: `apps/api/src/models/FestivalCalendar.ts`