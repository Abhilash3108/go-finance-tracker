import { useState, useEffect, useCallback } from 'react';
import type {
    User, Expense, Category, CategoryPercentage, TabName,
    ExpenseActions, CategoryActions, ExpenseViewerActions, NewExpense, UpdateExpensePayload,
} from './types';
import { TABS } from './types';
import { apiFetch } from './api';
import AddExpense    from './views/AddExpense';
import Categories    from './views/Categories';
import ExpenseViewer from './views/ExpenseViewer';
import DashboardView from './views/DashboardView';

interface Props {
    user: User;
    onLogout: () => void;
}

export default function Dashboard({ user, onLogout }: Props) {
    const [activeTab,           setActiveTab]           = useState<TabName>('dashboard');
    const [expenses,            setExpenses]            = useState<Expense[]>([]);
    const [categories,          setCategories]          = useState<Category[]>([]);
    const [categoryPercentData, setCategoryPercentData] = useState<CategoryPercentage[]>([]);

    const fetchData = useCallback(async () => {
        try {
            const [expRes, catRes, pctRes] = await Promise.all([
                apiFetch('/api/expenses'),
                apiFetch('/api/categories'),
                apiFetch('/api/expenses/category-percentage'),
            ]);
            if (expRes.ok) setExpenses(await expRes.json());
            if (catRes.ok) setCategories(await catRes.json());
            if (pctRes.ok) setCategoryPercentData(await pctRes.json());
        } catch (err) {
            console.error('Fetch error:', err);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // ---------------------------------------------------------------------------
    // Action implementations — injected into views so they stay network-free.
    // ---------------------------------------------------------------------------

    const expenseActions: ExpenseActions = {
        addExpense: async (payload: NewExpense) => {
            const res = await apiFetch('/api/expenses', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            return res.ok;
        },
    };

    const categoryActions: CategoryActions = {
        addCategory: async (name: string) => {
            const res = await apiFetch('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name }),
            });
            return res.ok;
        },
        updateCategory: async (id: number, name: string) => {
            const res = await apiFetch(`/api/categories?id=${id}`, {
                method: 'PUT',
                body: JSON.stringify({ name }),
            });
            return res.ok;
        },
        deleteCategories: async (ids: number[]) => {
            await Promise.all(
                ids.map(id => apiFetch(`/api/categories/delete?id=${id}`, { method: 'DELETE' })),
            );
        },
    };

    const expenseViewerActions: ExpenseViewerActions = {
        updateExpense: async (id: number, payload: UpdateExpensePayload) => {
            const res = await apiFetch(`/api/expenses?id=${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            return res.ok;
        },
        deleteExpenses: async (ids: number[]) => {
            await Promise.all(
                ids.map(id => apiFetch(`/api/expenses/delete?id=${id}`, { method: 'DELETE' })),
            );
        },
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-7xl mx-auto">

                <header className="mb-10 flex justify-between items-center">
                    <h1 className="text-4xl font-black text-gray-800">Finance Tracker</h1>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">{user.email}</span>
                        <button onClick={onLogout}
                            className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold transition">
                            Sign Out
                        </button>
                    </div>
                </header>

                <div className="flex gap-2 mb-8 bg-white p-1 rounded-xl shadow-sm inline-block">
                    {TABS.map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-6 py-2 rounded-lg font-bold capitalize transition ${
                                activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                            }`}>
                            {tab}
                        </button>
                    ))}
                </div>

                <main className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    {activeTab === 'add'        && <AddExpense    categories={categories} actions={expenseActions}        onSaved={fetchData} />}
                    {activeTab === 'categories' && <Categories    categories={categories} actions={categoryActions}        onChanged={fetchData} />}
                    {activeTab === 'viewer'     && <ExpenseViewer expenses={expenses} categories={categories} actions={expenseViewerActions} onChanged={fetchData} />}
                    {activeTab === 'dashboard'  && <DashboardView categories={categories} categoryPercentData={categoryPercentData} />}
                </main>

            </div>
        </div>
    );
}
