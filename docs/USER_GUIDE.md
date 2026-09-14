# User Guide

## Sign up / Sign in

1. Open the app URL.
2. Click **Create an account**, enter email + password (6–72 chars), click **Create Account**.
3. Next time just enter your credentials and click **Sign In**.

You stay signed in for **7 days** without re-entering your password. After 7 days of inactivity you'll be prompted to log in again.

---

## Tabs overview

| Tab | What it does |
|-----|-------------|
| 📊 **Overview** | Category breakdown + monthly trend + CSV export |
| ➕ **New Expense** | Log a single expense |
| 🏷️ **Categories** | Create / rename / bulk-delete categories |
| 📋 **My Expenses** | Filter, inline-edit, bulk-delete expenses |
| 🔁 **Recurring** | Monthly templates → dump to expenses |
| 🔍 **Spending** | Compare categories: monthly bars + all-time totals |

---

## Categories

> Create at least one category before adding expenses.

- **Add** — type a name, click **Add**.
- **Rename** — click the edit icon, update, press **Save**.
- **Delete** — tick checkboxes, click **Delete (N)**. Can't delete a category that still has expenses — remove those expenses first.

---

## Adding an expense

Go to **New Expense**, fill in **Amount**, **Category**, and optional **Description**, click **Save Entry**.

---

## My Expenses

- Filter by **month** or **category** using the dropdowns.
- **Edit** a row with the pencil icon.
- **Bulk delete** — tick rows (header checkbox = select all visible), click **Delete Selected (N)**.

---

## Overview dashboard

- **Year / Month dropdowns** — filter both charts. Month is disabled when Year = All.
- **Category Breakdown** — horizontal bars showing share per category.
- **Monthly Trend** — vertical bar chart per month; peak month is highlighted.
- **Export CSV** — set From / To dates, click **Download CSV**.

---

## Recurring expenses

1. **Add a template** — Amount + Category + Description, click **Add**.
2. **Dump to expenses** — tick templates, choose a date, click **Add to Expenses**.
   - A warning appears if any template was already added this calendar month (expenses are still created).
3. The **summary bar** at the bottom shows the server-computed total monthly commitment.

---

## Spending tab

1. Click one or more **category chips** to select them. Use **Select all** / **Clear** shortcuts.
2. Pick a **date range** preset: All time · This month · This year · Last 3 months · Last month · Custom.
3. Each selected category shows a card with:
   - **All-time total** — grand total regardless of date range.
   - **Monthly bar chart** — one bar per month, scaled across all selected categories so you can compare them directly.
4. When 2+ categories have data, a **Combined total** bar shows the sum across all of them.

**Saved groups** — save a selection for one-click reuse across devices:
- Select categories → type a name → press Enter or click **Save group**.
- Click a green group chip to restore that selection instantly.
- Click **×** on a chip to delete the group.

---

## Sign out

Click **Sign Out** top-right. Your session is immediately invalidated on the server.

---

## FAQ

**Can I use the app on multiple devices?**  
Yes. Each device has its own session. Signing out on one doesn't affect others.

**I forgot my password.**  
Password reset isn't in the UI yet. Ask your administrator to update it directly in the database.

**Why can't I delete a category?**  
It still has expenses attached. Go to **My Expenses**, filter by that category, delete them, then retry.

**The Spending tab shows an all-time total different from my date range.**  
That's intentional — the all-time total covers your full history; the bars are scoped to the selected date range.
