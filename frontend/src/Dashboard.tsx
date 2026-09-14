import { useMemo, useEffect } from 'react';
import type {
    User, TabName,
    ExpenseActions, CategoryActions, ExpenseViewerActions, RecurringActions, SpendingActions,
    NewExpense, UpdateExpensePayload, NewRecurringExpense,
} from './types';
import { TABS } from './types';
import { apiFetch } from './api';
import { useExpenseData } from './hooks/useExpenseData';
import AddExpense    from './views/AddExpense';
import Categories    from './views/Categories';
import ExpenseViewer from './views/ExpenseViewer';
import DashboardView from './views/DashboardView';
import RecurringView from './views/RecurringView';
import SpendingView  from './views/SpendingView';
import { useState } from 'react';

interface Props {
    user:     User;
    onLogout: () => void;
}

const TAB_ICONS: Record<TabName, string> = {
    dashboard:  '📊',
    add:        '➕',
    categories: '🏷️',
    viewer:     '📋',
    recurring:  '🔁',
    spending:   '🔍',
};

const TAB_LABELS: Record<TabName, string> = {
    dashboard:  'Overview',
    add:        'New Expense',
    categories: 'Categories',
    viewer:     'My Expenses',
    recurring:  'Recurring',
    spending:   'Spending',
};

// ---------------------------------------------------------------------------
// Static style constants
// ---------------------------------------------------------------------------

const STYLES = {
    root:      { background: '#0f1117' } as React.CSSProperties,
    nav:       { background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)' } as React.CSSProperties,
    logoMark:  { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } as React.CSSProperties,
    userBadge: { background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' } as React.CSSProperties,
    signOut:   { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' } as React.CSSProperties,
    signOutHover: { background: 'rgba(239,68,68,0.22)' } as React.CSSProperties,
    signOutLeave: { background: 'rgba(239,68,68,0.12)' } as React.CSSProperties,
    tabBar:    { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' } as React.CSSProperties,
    tabActive: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' } as React.CSSProperties,
    tabInactive: { color: 'rgba(255,255,255,0.4)', background: 'transparent' } as React.CSSProperties,
    panel:     { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' } as React.CSSProperties,
} as const;

export default function Dashboard({ user, onLogout }: Props) {
    const [activeTab, setActiveTab] = useState<TabName>('dashboard');
    const {
        expenses, categories, availableYears, recurringItems, recurringSummary,
        fetchData, fetchRecurring, fetchRecurringSummary,
        fetchCategoryPercent, fetchMonthlyTrend, fetchCategoryBreakdown, fetchExport,
    } = useExpenseData();

    useEffect(() => { fetchData(); }, [fetchData]);

    // ---------------------------------------------------------------------------
    // Action objects — memoised so child components never see stale references
    // and React.memo'd children don't re-render on every Dashboard render.
    // ---------------------------------------------------------------------------

    const expenseActions = useMemo<ExpenseActions>(() => ({
        addExpense: async (payload: NewExpense) => {
            const res = await apiFetch('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
            return res.ok;
        },
    }), []);

    const categoryActions = useMemo<CategoryActions>(() => ({
        addCategory: async (name: string) => {
            const res = await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
            return res.ok;
        },
        updateCategory: async (id: number, name: string) => {
            const res = await apiFetch(`/api/categories?id=${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
            return res.ok;
        },
        deleteCategories: async (ids: number[]) => {
            const params = ids.map(id => `id=${id}`).join('&');
            await apiFetch(`/api/categories/delete?${params}`, { method: 'DELETE' });
        },
    }), []);

    const expenseViewerActions = useMemo<ExpenseViewerActions>(() => ({
        updateExpense: async (id: number, payload: UpdateExpensePayload) => {
            const res = await apiFetch(`/api/expenses?id=${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            return res.ok;
        },
        deleteExpenses: async (ids: number[]) => {
            const params = ids.map(id => `id=${id}`).join('&');
            await apiFetch(`/api/expenses/delete?${params}`, { method: 'DELETE' });
        },
    }), []);

    const recurringActions = useMemo<RecurringActions>(() => ({
        addRecurring: async (payload: NewRecurringExpense) => {
            const res = await apiFetch('/api/recurring', { method: 'POST', body: JSON.stringify(payload) });
            return res.ok;
        },
        updateRecurring: async (id: number, payload: NewRecurringExpense) => {
            const res = await apiFetch(`/api/recurring?id=${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            return res.ok;
        },
        deleteRecurring: async (ids: number[]) => {
            const params = ids.map(id => `id=${id}`).join('&');
            await apiFetch(`/api/recurring/delete?${params}`, { method: 'DELETE' });
        },
        dumpRecurring: async (ids: number[], date: string) => {
            const res = await apiFetch('/api/recurring/dump', {
                method: 'POST',
                body: JSON.stringify({ ids, date }),
            });
            if (!res.ok) return null;
            return res.json();
        },
        fetchRecurringSummary,
    }), [fetchRecurringSummary]);

    const spendingActions = useMemo<SpendingActions>(() => ({
        fetchCategoryBreakdown,
    }), [fetchCategoryBreakdown]);

    // Load recurring templates + summary when the user first visits that tab.
    // Both fetches are stable callbacks — they fire in parallel, one round-trip.
    useEffect(() => {
        if (activeTab === 'recurring') {
            Promise.all([fetchRecurring(), fetchRecurringSummary()]);
        }
    }, [activeTab, fetchRecurring, fetchRecurringSummary]);

    return (
        <div className="min-h-screen" style={STYLES.root}>

            {/* Top nav */}
            <header className="sticky top-0 z-20 px-4 sm:px-6 py-4 flex justify-between items-center" style={STYLES.nav}>
                <div className="flex items-center gap-3">
                    <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black text-white"
                        style={STYLES.logoMark}
                    >
                        ₹
                    </div>
                    <span className="font-black text-white text-lg tracking-tight">Finance Tracker</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="hidden sm:inline text-xs px-3 py-1.5 rounded-full font-medium" style={STYLES.userBadge}>
                        {user.email}
                    </span>
                    <button
                        onClick={onLogout}
                        className="text-xs font-bold px-4 py-2 rounded-xl transition-all"
                        style={STYLES.signOut}
                        onMouseEnter={e => Object.assign((e.currentTarget as HTMLButtonElement).style, STYLES.signOutHover)}
                        onMouseLeave={e => Object.assign((e.currentTarget as HTMLButtonElement).style, STYLES.signOutLeave)}
                    >
                        Sign Out
                    </button>
                </div>
            </header>

            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

                {/* Tab bar — overflow-x-auto prevents clipping on narrow screens */}
                <nav
                    className="flex gap-1 mb-6 sm:mb-8 p-1 rounded-2xl w-fit max-w-full overflow-x-auto"
                    style={STYLES.tabBar}
                >
                    {TABS.map(tab => {
                        const active = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className="flex items-center gap-1.5 px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all whitespace-nowrap"
                                style={active ? STYLES.tabActive : STYLES.tabInactive}
                            >
                                <span>{TAB_ICONS[tab]}</span>
                                {TAB_LABELS[tab]}
                            </button>
                        );
                    })}
                </nav>

                {/* Main panel */}
                <div className="rounded-2xl p-4 sm:p-8" style={STYLES.panel}>
                    {activeTab === 'add'        && <AddExpense    categories={categories} actions={expenseActions}           onSaved={fetchData} />}
                    {activeTab === 'categories' && <Categories    categories={categories} actions={categoryActions}           onChanged={fetchData} />}
                    {activeTab === 'viewer'     && <ExpenseViewer expenses={expenses}     categories={categories} actions={expenseViewerActions} onChanged={fetchData} />}
                    {activeTab === 'dashboard'  && <DashboardView categories={categories} availableYears={availableYears} fetchCategoryPercent={fetchCategoryPercent} fetchMonthlyTrend={fetchMonthlyTrend} fetchExport={fetchExport} />}
                    {activeTab === 'recurring'  && <RecurringView items={recurringItems} categories={categories} actions={recurringActions} summary={recurringSummary} onChanged={() => { fetchRecurring(); fetchRecurringSummary(); }} onDumped={fetchData} />}
                    {activeTab === 'spending'   && <SpendingView  categories={categories} actions={spendingActions} />}
                </div>

            </div>
        </div>
    );
}
