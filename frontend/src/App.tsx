import { useState, useEffect, useMemo } from 'react';

/**
 * --- Type Definitions ---
 */
interface Category { id: number; name: string; }
interface CategoryPercentage { categoryName: string; totalAmount: number; percentage: number; }
interface Expense { 
    id: number; 
    amount: number; 
    description: string; 
    categoryId: number; 
    categoryName?: string; 
    createdAt?: string; 
}

/**
 * FinanceTracker App
 */
export default function App() {
    // --- State: View Management ---
    const [activeTab, setActiveTab] = useState<'add' | 'categories' | 'viewer' | 'dashboard'>('dashboard');
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [categoryPercentData, setCategoryPercentData] = useState<CategoryPercentage[]>([]);
    
    // --- State: Selection & Filters ---
    const [selectedExpIds, setSelectedExpIds] = useState<Set<number>>(new Set());
    const [selectedCatIds, setSelectedCatIds] = useState<Set<number>>(new Set());
    const [monthFilter, setMonthFilter] = useState<string>('all'); 
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [dashCategoryFilter, setDashCategoryFilter] = useState<string>('all');

    // --- State: Form Inputs ---
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [newCategoryName, setNewCategoryName] = useState('');

    /**
     * fetchData: Retrieves all data needed for the application.
     */
    const fetchData = async () => {
        try {
            const [expRes, catRes, percentRes] = await Promise.all([
                fetch('/api/expenses'), 
                fetch('/api/categories'),
                fetch('/api/expenses/category-percentage')
            ]);
            if (expRes.ok) setExpenses(await expRes.json());
            if (catRes.ok) setCategories(await catRes.json());
            if (percentRes.ok) setCategoryPercentData(await percentRes.json());
        } catch (err) { console.error("Fetch error:", err); }
    };

    useEffect(() => { fetchData(); }, []);

    const availableMonths = useMemo(() => {
        const months = new Set(expenses.map(e => e.createdAt?.substring(0, 7) || ''));
        return Array.from(months).sort().reverse();
    }, [expenses]);

    const filteredExpenses = useMemo(() => {
        return expenses.filter(exp => {
            const matchesMonth = monthFilter === 'all' || exp.createdAt?.startsWith(monthFilter);
            const matchesCategory = categoryFilter === 'all' || exp.categoryName === categoryFilter;
            return matchesMonth && matchesCategory;
        });
    }, [expenses, monthFilter, categoryFilter]);

    // Dashboard breakdown logic
    const displayedDashData = useMemo(() => {
        if (dashCategoryFilter === 'all') return categoryPercentData;
        return categoryPercentData.filter(d => d.categoryName === dashCategoryFilter);
    }, [categoryPercentData, dashCategoryFilter]);

    // --- Handlers ---
    const addExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!categoryId) return; 
        const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: parseFloat(amount), description, categoryId: parseInt(categoryId, 10) })
        });
        if (res.ok) { await fetchData(); setAmount(''); setDescription(''); setCategoryId(''); }
    };

    const addCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newCategoryName })
        });
        if (res.ok) { fetchData(); setNewCategoryName(''); }
    };

    const deleteExpenses = async () => {
        for (const id of selectedExpIds) {
            await fetch(`/api/expenses/delete?id=${id}`, { method: 'DELETE' });
        }
        setSelectedExpIds(new Set());
        fetchData();
    };

    const deleteCategories = async () => {
        for (const id of selectedCatIds) {
            await fetch(`/api/categories/delete?id=${id}`, { method: 'DELETE' });
        }
        setSelectedCatIds(new Set());
        fetchData();
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-7xl mx-auto">
                <header className="mb-10"><h1 className="text-4xl font-black text-gray-800">Finance Tracker</h1></header>
                
                <div className="flex gap-2 mb-8 bg-white p-1 rounded-xl shadow-sm inline-block">
                    {['add', 'categories', 'viewer', 'dashboard'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab as any)} 
                            className={`px-6 py-2 rounded-lg font-bold capitalize transition ${activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                            {tab}
                        </button>
                    ))}
                </div>

                <main className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                    {activeTab === 'add' && (
                        <form onSubmit={addExpense} className="max-w-md space-y-4">
                            <h2 className="text-2xl font-bold mb-4">Add Expense</h2>
                            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)" className="w-full border p-3 rounded-lg" required />
                            <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full border p-3 rounded-lg bg-white" required>
                                <option value="">Select Category</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="w-full border p-3 rounded-lg" required />
                            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">Save Entry</button>
                        </form>
                    )}

                    {activeTab === 'categories' && (
                        <div>
                            <form onSubmit={addCategory} className="flex gap-2 mb-6 max-w-md">
                                <input value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)} className="flex-1 border p-3 rounded-lg" placeholder="New Category Name" required />
                                <button type="submit" className="bg-green-600 text-white px-6 rounded-lg font-bold hover:bg-green-700">Add</button>
                            </form>
                            
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg">Manage Categories</h3>
                                <button onClick={deleteCategories} disabled={selectedCatIds.size === 0} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50">Delete Selected ({selectedCatIds.size})</button>
                            </div>

                            <table className="w-full text-left border rounded-lg overflow-hidden">
                                <thead className="bg-gray-50 border-b">
                                    <tr>
                                        <th className="p-4">Select</th>
                                        <th className="p-4">Category Name</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map(cat => (
                                        <tr key={cat.id} className="border-b hover:bg-gray-50">
                                            <td className="p-4"><input type="checkbox" onChange={() => { const s = new Set(selectedCatIds); s.has(cat.id) ? s.delete(cat.id) : s.add(cat.id); setSelectedCatIds(s); }} /></td>
                                            <td className="p-4 font-medium text-gray-700">{cat.name}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'viewer' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <select onChange={e => setMonthFilter(e.target.value)} className="border p-2 rounded-lg">
                                    <option value="all">All Months</option>
                                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <button onClick={deleteExpenses} className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">Delete Selected ({selectedExpIds.size})</button>
                            </div>
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 border-b text-xs font-bold text-gray-500">
                                    <tr>
                                        <th className="p-4">Select</th>
                                        <th className="p-4">Date</th>
                                        <th className="p-4">Description</th>
                                        <th className="p-4">
                                            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="bg-transparent uppercase">
                                                <option value="all">Category ▼</option>
                                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                            </select>
                                        </th>
                                        <th className="p-4 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredExpenses.map(exp => (
                                        <tr key={exp.id} className="border-b hover:bg-blue-50">
                                            <td className="p-4"><input type="checkbox" onChange={() => { const s = new Set(selectedExpIds); s.has(exp.id) ? s.delete(exp.id) : s.add(exp.id); setSelectedExpIds(s); }} /></td>
                                            <td className="p-4 text-gray-600">{exp.createdAt?.split('T')[0]}</td>
                                            <td className="p-4 font-medium">{exp.description}</td>
                                            <td className="p-4 text-indigo-600">{exp.categoryName}</td>
                                            <td className="p-4 text-right font-bold">${exp.amount.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'dashboard' && (
                        <div>
                            <div className="mb-8">
                                <label className="block text-sm font-bold text-gray-700 mb-2">Filter Analysis by Category</label>
                                <select value={dashCategoryFilter} onChange={e => setDashCategoryFilter(e.target.value)} className="border p-2 rounded-lg w-full max-w-xs">
                                    <option value="all">All Categories</option>
                                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-indigo-600 text-white p-8 rounded-2xl shadow-lg">
                                    <p className="text-indigo-200">Total Spent</p>
                                    <h3 className="text-5xl font-black">${displayedDashData.reduce((a, b) => a + b.totalAmount, 0).toFixed(2)}</h3>
                                </div>
                                <div className="p-6 border rounded-xl bg-gray-50">
                                    <h3 className="font-bold mb-4 text-gray-800">Category Breakdown</h3>
                                    {displayedDashData.map(c => (
                                        <div key={c.categoryName} className="flex justify-between py-3 border-b border-gray-200">
                                            <span className="text-gray-600 font-medium">{c.categoryName}</span>
                                            <div className="text-right">
                                                <span className="block font-bold text-gray-900">${c.totalAmount.toFixed(2)}</span>
                                                <span className="text-xs text-indigo-500 font-bold">{c.percentage.toFixed(1)}% of total</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}