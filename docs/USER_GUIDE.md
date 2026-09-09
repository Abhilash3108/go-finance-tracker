# User Guide

> **Everything you need to go from sign-up to tracking your spending.**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Creating Your Account](#creating-your-account)
3. [Logging In](#logging-in)
4. [Setting Up Categories](#setting-up-categories)
5. [Adding Expenses](#adding-expenses)
6. [Viewing & Filtering Expenses](#viewing--filtering-expenses)
7. [Dashboard — Spending Analysis](#dashboard--spending-analysis)
8. [Signing Out](#signing-out)
9. [Returning Users — Session Restore](#returning-users--session-restore)
10. [FAQ](#faq)

---

## Getting Started

Open your browser and go to your Finance Tracker URL:

- **Local installation:** `https://localhost`
- **Production:** `https://yourdomain.com`

> **First time on localhost?** Your browser will show a security warning because the local certificate is self-signed. This is expected. Click **Advanced → Proceed to localhost** (Chrome) or **Accept the Risk and Continue** (Firefox).

You will land on the login screen. Since you don't have an account yet, click **Create an account**.

---

## Creating Your Account

![Auth Screen](../frontend/src/assets/auth-placeholder.png)

1. Click **Create an account** below the login form.
2. Enter your **email address**.
3. Choose a **password** — minimum 6 characters, maximum 72.
4. Click **Create Account**.

On success you are logged in immediately and taken to the Dashboard. No email confirmation required.

**Rules:**
- Each email can only be registered once.
- Passwords are hashed with bcrypt before storage — the server never stores your plain-text password.
- Your data is completely isolated from other users. No one else can see your categories or expenses.

---

## Logging In

If you already have an account:

1. Enter your **email** and **password**.
2. Click **Sign In**.

You will be taken to the Dashboard tab.

**Staying signed in:** Your session is stored in the browser. Closing and reopening the tab — or even closing the browser entirely — keeps you signed in for up to **7 days** without re-entering your password. The session renews automatically while you use the app.

---

## Setting Up Categories

> ⚠️ **Create at least one category before adding expenses.** Every expense must belong to a category.

Navigate to the **Categories** tab.

### Add a category

1. Type a category name in the text box (e.g. `Food`, `Transport`, `Rent`, `Entertainment`).
2. Click **Add**.

The category appears in the list immediately. Category names are unique per account — you can't create two categories with the same name.

**Suggested starting categories:**
- Food & Dining
- Transport
- Housing
- Utilities
- Entertainment
- Health
- Shopping
- Other

### Delete categories

1. Check the box next to one or more categories you want to remove.
2. Click **Delete Selected (N)**.

> ⚠️ **You cannot delete a category that has expenses attached to it.** Delete or reassign the expenses first, then delete the category. This protects your expense history from accidental data loss.

---

## Adding Expenses

Navigate to the **Add** tab.

### Record a new expense

Fill in the three fields:

| Field | Description | Example |
|-------|-------------|---------|
| **Amount ($)** | The cost — must be greater than $0. Accepts decimals. | `12.50` |
| **Category** | Which category this expense belongs to. | `Food & Dining` |
| **Description** | A short note about what you spent on. | `Lunch at Chipotle` |

Click **Save Entry**.

The form resets immediately so you can add another expense without refreshing. Your new expense appears in the **Viewer** tab.

**Tips:**
- You can add multiple expenses in a row — the form clears after each save.
- The date is recorded automatically at the moment you save.
- Amount supports two decimal places: `9.99`, `100.00`, `1250.75`.

---

## Viewing & Filtering Expenses

Navigate to the **Viewer** tab.

All your expenses are displayed in a table, newest first:

| Column | Description |
|--------|-------------|
| Date | When the expense was recorded (YYYY-MM-DD) |
| Description | The note you entered |
| Category | Which category it belongs to |
| Amount | Cost in dollars |

### Filter by month

Use the **All Months** dropdown at the top left. Only months that have at least one expense appear as options. Select a month (e.g. `2024-11`) to show only that month's expenses.

### Filter by category

Click the **Category ▼** dropdown in the table header. Select a category to show only expenses in that category. Both filters work together — you can view, for example, "Food expenses in November 2024".

### Delete expenses

1. Check the box in the **Select** column next to the expenses you want to remove.
2. Click **Delete Selected (N)**.

The selected expenses are permanently deleted. The count next to the button updates as you check boxes.

> This action cannot be undone. Double-check your selection before clicking Delete.

---

## Dashboard — Spending Analysis

Navigate to the **Dashboard** tab.

The dashboard shows your **total spending** and a **category breakdown** showing how much you spent in each category and what percentage of your total each represents.

### Filter by category

Use the **Filter Analysis by Category** dropdown to focus the view on one category. The total at the top updates to reflect only the filtered category.

**Reading the breakdown:**

```
Category Breakdown
─────────────────────────────
Food & Dining      $342.50    48.2% of total
Transport          $180.00    25.3% of total
Entertainment      $188.75    26.5% of total
─────────────────────────────
Total Spent        $711.25
```

Each row shows:
- **Category name**
- **Total amount** spent in that category
- **Percentage** of your overall spending

This helps you see at a glance where most of your money goes.

---

## Signing Out

Click **Sign Out** in the top-right corner of any screen.

What happens:
1. Your session is immediately invalidated on the server — the refresh token is revoked.
2. Tokens are cleared from your browser storage.
3. You are returned to the login screen.

**Sign out on all devices:** Signing out only clears the current browser's session. To invalidate all sessions (e.g. if you suspect your account is compromised), sign out from each device or change your password. Future: a "sign out everywhere" feature would clear the refresh token server-side, logging out all active sessions simultaneously.

---

## Returning Users — Session Restore

When you open the app after closing your browser:

1. If your **access token** (15 min) is still valid → you are signed in immediately, no flicker.
2. If the access token expired but your **refresh token** (7 days) is still valid → the app silently fetches a new token pair in the background and signs you in without any prompt.
3. If both tokens have expired (more than 7 days since last use) → you see the login screen.

This means you typically only need to enter your password once every 7 days, as long as you use the app at least once per week.

---

## FAQ

**Can I use the same account on multiple devices?**
Yes. Sign in on each device. Sessions are independent — each device has its own refresh token. Logging out on one device does not affect the others.

**What happens if I delete a category that has expenses?**
You cannot — the app prevents it with an error message. Delete the expenses in the Viewer tab first, then delete the category.

**Are my expenses visible to anyone else?**
No. Every database query filters strictly by your user ID, which is embedded in your signed JWT. Even if someone knew an integer expense ID, they could not retrieve your data without your token.

**I forgot my password. Can I reset it?**
Password reset is not yet implemented. Contact your administrator to reset the password hash directly in the database:
```sql
UPDATE users SET password_hash = '<new bcrypt hash>' WHERE email = 'you@example.com';
```
A self-service reset flow (email link) is a planned future feature.

**The app says "session expired" and logged me out unexpectedly.**
This happens when both your access token and refresh token have expired (no activity for 7+ days), or if you were logged out on another device. Sign in again. Your data is not affected.

**Can I export my expenses?**
Not yet via the UI. You can export directly from the database:
```bash
docker compose exec db psql -U postgres -d financedb \
  -c "\COPY (SELECT e.created_at, e.amount, e.description, c.name
             FROM expenses e JOIN categories c ON e.category_id = c.id
             WHERE e.user_id = 1
             ORDER BY e.created_at DESC)
      TO '/tmp/expenses.csv' CSV HEADER;"
docker compose cp db:/tmp/expenses.csv ./expenses.csv
```

**How do I change my password?**
Not yet available in the UI. Direct DB update:
```bash
# Generate a new bcrypt hash (use any bcrypt tool or a small Go script)
docker compose exec db psql -U postgres -d financedb \
  -c "UPDATE users SET password_hash = '\$2a\$10\$...' WHERE email = 'you@example.com';"
```

**I see a certificate warning on localhost — is this safe?**
Yes. Caddy issues a locally-trusted self-signed certificate for `localhost`. The warning is your browser telling you it doesn't recognise the certificate authority, not that anything is wrong with the app. All traffic is still encrypted. On a real domain with a Let's Encrypt certificate this warning does not appear.
