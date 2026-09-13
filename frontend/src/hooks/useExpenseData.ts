import { useState, useCallback, useMemo } from 'react';
import type { Expense, Category, CategoryPercentage, MonthlySummary, RecurringExpense } from '../types';
import { apiFetch } from '../api';

export interface ExpenseData {
    expenses:               Expense[];
    categories:             Category[];
    availableYears:         string[];
    recurringItems:         RecurringExpense[];
    fetchData:              () => Promise<void>;
    fetchRecurring:         () => Promise<void>;
    fetchCategoryPercent:   (year: string, month: string) => Promise<CategoryPercentage[]>;
    fetchMonthlyTrend:      (year: string, month: string) => Promise<MonthlySummary[]>;
    fetchExport:            (from: string, to: string) => Promise<void>;
}

/**
 * Owns all remote data for the authenticated dashboard.
 * Centralises fetching so Dashboard only handles rendering and action wiring.
 *
 * fetchCategoryPercent is injected into DashboardView so that view never
 * imports apiFetch directly — satisfying the Dependency Inversion principle.
 */
export function useExpenseData(): ExpenseData {
    const [expenses,        setExpenses]        = useState<Expense[]>([]);
    const [categories,      setCategories]      = useState<Category[]>([]);
    const [recurringItems,  setRecurringItems]  = useState<RecurringExpense[]>([]);

    const fetchData = useCallback(async () => {
        try {
            const [expRes, catRes] = await Promise.all([
                apiFetch('/api/expenses'),
                apiFetch('/api/categories'),
            ]);
            if (expRes.ok) setExpenses(await expRes.json());
            if (catRes.ok) setCategories(await catRes.json());
        } catch (err) {
            console.error('Fetch error:', err);
        }
    }, []);

    // Derived from expenses already in memory — no extra API call
    const availableYears = useMemo(() =>
        Array.from(new Set(
            expenses
                .map(e => e.createdAt?.substring(0, 4))
                .filter((y): y is string => Boolean(y)),
        )).sort().reverse(),
    [expenses]);

    // Injected into DashboardView so the view never touches apiFetch directly
    const fetchCategoryPercent = useCallback(async (
        year:  string,
        month: string,
    ): Promise<CategoryPercentage[]> => {
        const params = new URLSearchParams();
        if (year  !== 'all') params.set('year',  year);
        if (month !== 'all') params.set('month', month);
        const qs  = params.toString();
        const res = await apiFetch(
            `/api/expenses/category-percentage${qs ? `?${qs}` : ''}`,
        );
        if (!res.ok) return [];
        return res.json();
    }, []);

    const fetchMonthlyTrend = useCallback(async (
        year:  string,
        month: string,
    ): Promise<MonthlySummary[]> => {
        const params = new URLSearchParams();
        if (year  !== 'all') params.set('year',  year);
        if (month !== 'all') params.set('month', month);
        const qs  = params.toString();
        const res = await apiFetch(
            `/api/reports/monthly${qs ? `?${qs}` : ''}`,
        );
        if (!res.ok) return [];
        return res.json();
    }, []);

    // Fetch (or refresh) recurring expense templates only — lightweight, called
    // when the Recurring tab is first opened or after a CRUD action there.
    const fetchRecurring = useCallback(async () => {
        try {
            const res = await apiFetch('/api/recurring');
            if (res.ok) setRecurringItems(await res.json());
        } catch (err) {
            console.error('fetchRecurring error:', err);
        }
    }, []);

    // Triggers a CSV download for the given date range.
    // 'from' / 'to' are "YYYY-MM-DD" strings, or '' to omit the bound.
    const fetchExport = useCallback(async (from: string, to: string): Promise<void> => {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to)   params.set('to',   to);
        const qs  = params.toString();
        const res = await apiFetch(`/api/expenses/export${qs ? `?${qs}` : ''}`);
        if (!res.ok) return;
        const blob     = await res.blob();
        const url      = URL.createObjectURL(blob);
        const a        = document.createElement('a');
        // Prefer the filename the server suggested via Content-Disposition.
        const cd       = res.headers.get('Content-Disposition') ?? '';
        const match    = cd.match(/filename="([^"]+)"/);
        a.download     = match ? match[1] : 'expenses.csv';
        a.href         = url;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, []);

    return {
        expenses, categories, availableYears, recurringItems,
        fetchData, fetchRecurring,
        fetchCategoryPercent, fetchMonthlyTrend, fetchExport,
    };
}
