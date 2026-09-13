# User Guide

> **Everything you need to go from sign-up to tracking your spending.**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Creating Your Account](#creating-your-account)
3. [Logging In](#logging-in)
4. [Navigating the App](#navigating-the-app)
5. [Setting Up Categories](#setting-up-categories)
6. [Adding Expenses](#adding-expenses)
7. [Viewing, Editing & Filtering Expenses](#viewing-editing--filtering-expenses)
8. [Overview Dashboard — Spending Analysis](#overview-dashboard--spending-analysis)
9. [Recurring Expenses](#recurring-expenses)
10. [Signing Out](#signing-out)
11. [Returning Users — Session Restore](#returning-users--session-restore)
12. [FAQ](#faq)

---

## Getting Started

Open your browser and navigate to your Finance Tracker URL:

- **Local installation:** `https://localhost`
- **Production:** `https://yourdomain.com`

> **First time on localhost?** Your browser will show a security warning because the local certificate is self-signed by Caddy. Click **Advanced → Proceed to localhost** (Chrome) or **Accept the Risk and Continue** (Firefox). This is expected and your connection is still encrypted.

---

## Creating Your Account

1. Click **Create an account** below the login form.
2. Enter your **email address**.
3. Choose a **password** — minimum 6 characters, maximum 72.
4. Click **Create Account**.

On success you are signed in immediately and taken to the Overview tab. No email confirmation is required.

**Security details:**
- Each email address can only be registered once.
- Passwords are hashed with bcrypt before storage — the server never stores your plain-text password.
- Your data is completely isolated from all other users; every query is filtered by your account.

---

## Logging In

1. Enter your **email** and **password**.
2. Click **Sign In**.

Use the eye icon next to the password field to show or hide what you're typing.

**Staying signed in:** Your session is stored in the browser. Closing and reopening the tab — or closing the browser entirely — keeps you signed in for up to **7 days** without re-entering your password.

---

## Navigating the App

After signing in you will see five tabs across the top of the screen:

| Tab | What it does |
|-----|-------------|
| 📊 **Overview** | Dashboard with year/month filter, category breakdown, monthly trend chart, and CSV export |
| ➕ **New Expense** | Form to log a new expense |
| 🏷️ **Categories** | Create, rename, and delete expense categories |
| 📋 **My Expenses** | Filterable table of all your expenses, with inline editing and bulk delete |
| 🔁 **Recurring** | Store recurring expense templates (rent, subscriptions, etc.) and dump them into expenses |

---

## Setting Up Categories

> **Create at least one category before adding expenses.** Every expense must belong to a category.

Navigate to the **Categories** tab.

### Add a category

1. Type a category name in the input field.
2. Click **Add**.

Category names are unique per account — you cannot have two categories with the same name.

**Suggested starting categories:**

| Category | Examples |
|----------|---------|
| Food & Dining | Groceries, restaurants, coffee |
| Transport | Gas, transit, parking, ride-share |
| Housing | Rent, utilities, maintenance |
| Health | Prescriptions, gym, medical |
| Entertainment | Streaming, events, hobbies |
| Shopping | Clothing, household items |
| Other | Anything that doesn't fit elsewhere |

### Rename a category

Click the **Edit** button next to a category name, update the text, and press **Save** (or press Enter).

### Select and delete categories in bulk

1. Click the **checkbox** in the toolbar header to select all categories at once, or tick individual checkboxes next to any categories you want to remove.
   - The header checkbox shows a **dash (−)** when some — but not all — categories are selected (indeterminate state).
   - Clicking it when any are selected deselects all; clicking it when none are selected selects all.
2. A **Delete (N)** button appears once at least one category is selected.
3. Click **Delete (N)** to remove the selected categories.

> ⚠️ **You cannot delete a category that has expenses attached to it.** The app will show an error. Go to the **My Expenses** tab and delete those expenses first.

The select-all checkbox is disabled while a category is open for editing or a delete is in progress.

---

## Adding Expenses

Navigate to the **New Expense** tab.

| Field | Required | Description | Example |
|-------|----------|-------------|---------|
| **Amount ($)** | Yes | The cost — must be greater than $0. Decimals accepted. | `12.50` |
| **Category** | Yes | Which category this expense belongs to. | `Food & Dining` |
| **Description** | No | A short note about the expense. | `Lunch at Chipotle` |

Click **Save Entry**. The form resets immediately so you can log another expense without refreshing.

---

## Viewing, Editing & Filtering Expenses

Navigate to the **My Expenses** tab. All expenses are shown in a table, newest first.

### Filter by month

Use the **month dropdown** at the top. Only months that have at least one expense appear as options. Select **All** to see every expense.

### Filter by category

Use the **category filter** in the table header. Both the month and category filters work together.

### Edit an expense

Click the **edit (pencil) icon** on any row to update the amount, description, or category inline.

### Select and delete expenses in bulk

1. Click the **checkbox** in the table header to select all visible (filtered) rows at once, or tick individual checkboxes on any rows you want to remove.
   - The header checkbox shows a **dash (−)** when some rows are selected (indeterminate state).
   - Selecting all visible rows selects only the rows currently shown — rows hidden by filters are not affected.
2. Click **Delete Selected (N)** to remove the selected expenses.

> This action cannot be undone.

---

## Overview Dashboard — Spending Analysis

Navigate to the **Overview** tab to see your spending summary.

### Year and month filter

At the top of the Overview tab you will find two dropdowns:

| Dropdown | Options | Effect |
|----------|---------|--------|
| **Year** | All, or any year that has expenses | Filters both charts to that year |
| **Month** | All, or any month 1–12 | Filters to a specific month within the selected year |

The **Month** dropdown is disabled when Year is set to **All** (a single month across all years is not a useful slice). To filter by a specific month, first select a year.

A **scope badge** below the dropdowns confirms what data is being shown (e.g. *All time*, *2024*, or *Nov 2024*).

### Category Breakdown

The left panel shows how spending is distributed across categories for the selected period:

- Horizontal bar for each category sized proportionally to its share.
- Amount and percentage beside each bar.
- A **filter** dropdown inside this panel lets you highlight a single category.

### Monthly Trend

The right panel shows spending per calendar month as vertical bars:

- Each bar is labelled with the month abbreviation (e.g. *Jan*, *Feb*).
- The **peak month** — the month with the highest spending — is called out above the chart.
- When a specific month is selected via the top filter, only that month's bar is shown.

### Export CSV

At the bottom of the Overview tab you can download your expenses as a CSV file.

1. The **From** and **To** date fields are pre-filled to cover the currently selected year (or all time if no year is selected). You can adjust them to any date range you like.
2. Click **Download CSV**.
3. Your browser will save a file named `expenses_YYYY-MM-DD_to_YYYY-MM-DD.csv` with columns: **ID, Amount, Description, Category, Date**.

> **From must be on or before To.** If the dates are reversed an error is shown and no download starts.

### Example

With Year = **2024** selected:

| Panel | What you see |
|-------|-------------|
| Category Breakdown | Food & Dining 42% · Transport 28% · Entertainment 30% |
| Monthly Trend | Bar chart from Jan 2024 to Dec 2024, tallest bar in December |
| Scope badge | *2024* |
| Export CSV | From pre-filled to 2024-01-01, To pre-filled to 2024-12-31 |

---

## Recurring Expenses

Navigate to the **Recurring** tab. This tab stores *templates* for expenses that repeat every month — rent, subscriptions, gym membership, etc. Templates are separate from your real expenses; you control when they are added.

### Add a recurring template

1. Fill in the **Amount**, **Category**, and (optionally) a **Description**.
2. Click **Add**.

The template appears in the list below.

### Edit a template

Click the **Edit** button on any row, update the fields, and press **Save**.

### Delete templates in bulk

1. Tick individual checkboxes, or use the **select-all checkbox** in the header to select all templates.
2. Click **Delete (N)** to remove them.

### Dump templates into real expenses

When you want to log this month's recurring expenses:

1. Select one or more templates using their checkboxes.
2. The **Add to Expenses** panel appears at the bottom.
3. Choose the **date** the expenses should be recorded on (defaults to today; you can change it).
4. Click **Add to Expenses**.

The selected templates are inserted as real expenses on the chosen date. A success banner confirms how many were added.

**Duplicate warning:** If a template was already added as an expense in the current calendar month (same description, same category), the app will show a warning listing the affected templates. The expenses are still added — the warning is informational so you don't double-count by accident.

---

## Signing Out

Click **Sign Out** in the top-right corner. This:

1. Sends your refresh token to the server, which immediately invalidates it in the database.
2. Clears all tokens from your browser's storage.

After signing out, your old session is immediately invalidated — reopening the app will show the login screen.

---

## Returning Users — Session Restore

When you open the app, it checks your stored tokens in this order:

1. **Access token still valid (within 15 minutes of login/refresh)** → signed in immediately, no network call.
2. **Access token expired, refresh token still valid (within 7 days)** → app silently fetches a new token pair in the background, then shows the Overview tab. No login prompt.
3. **Both tokens expired (no activity for 7+ days)** → tokens are cleared and the login screen is shown.

This means you only need to re-enter your password after more than 7 days of inactivity.

---

## FAQ

**Can I use the same account on multiple devices?**
Yes. Each device holds its own refresh token. Logging out on one device does not affect sessions on others.

**What happens if I try to delete a category that has expenses?**
The app prevents it and shows an error message. Go to the **My Expenses** tab, filter by that category, delete the expenses, and then try deleting the category again.

**Are my expenses visible to anyone else?**
No. Every database query is strictly filtered by your user ID. Other users cannot see or access your data.

**I forgot my password. Can I reset it?**
Password reset is not yet available in the UI. Contact your administrator and ask them to reset your password — they can update it directly in the database on your behalf.

**The app logged me out unexpectedly.**
Either:
- Both tokens expired (no activity for more than 7 days).
- You were signed out from another device or by an administrator.

Sign in again to start a new session.

**Can I export my expenses?**
Yes. Go to the **Overview** tab, scroll to the **Export CSV** section, set the date range, and click **Download CSV**. The file is saved directly to your downloads folder.

**How do I change my password?**
Password change is not yet available in the UI. Contact your administrator and ask them to update it for you.

**I see a certificate warning on localhost — is it safe?**
Yes. Caddy generates a locally-trusted self-signed certificate for `localhost` automatically. All traffic is still TLS-encrypted. On a real domain with a valid DNS record, this warning does not appear — Caddy fetches a trusted Let's Encrypt certificate automatically.

**Why does the month filter only show some months?**
The dropdown only lists months that have at least one recorded expense. Months with no expenses are hidden to keep the list clean.

**The Month dropdown on the Overview tab is greyed out — why?**
The Month filter is disabled when Year is set to **All**. Filtering by a single month across all years would produce misleading comparisons. Select a specific year first, then choose a month.
