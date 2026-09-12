import { useState, useCallback, useMemo } from 'react';
import type { Expense, Category, CategoryPercentage, MonthlySummary } from '../types';
import { apiFetch } from '../api';

export interface ExpenseData {
    expenses:               Expense[];
    categories:             Category[];
    availableYears:         string[];
    fetchData:              () => Promise<void>;
    fetchCategoryPercent:   (year: string, month: string) => Promise<CategoryPercentage[]>;
    fetchMonthlyTrend:      (year: string, month: string) => Promise<MonthlySummary[]>;
}

/**
 * Owns all remote data for the authenticated dashboard.
 * Centralises fetching so Dashboard only handles rendering and action wiring.
 *
 * fetchCategoryPercent is injected into DashboardView so that view never
 * imports apiFetch directly — satisfying the Dependency Inversion principle.
 */
export function useExpenseData(): ExpenseData {
    const [expenses,   setExpenses]   = useState<Expense[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

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

    return { expenses, categories, availableYears, fetchData, fetchCategoryPercent, fetchMonthlyTrend };
}
