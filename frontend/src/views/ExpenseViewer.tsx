import { useState, useCallback } from 'react';
import type { Expense, Category, ExpenseViewerActions } from '../types';

interface Props {
    expenses: Expense[];
    categories: Category[];
    actions: ExpenseViewerActions;
    onChanged: () => void;
}

export default function ExpenseViewer({ expenses, categories, actions, onChanged }: Props) {
    const [monthFilter,    setMonthFilter]    = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [selected,       setSelected]       = useState<Set<number>>(new Set());

    const toggle = useCallback((id: number) => {
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }, []);

    const availableMonths = Array.from(new Set(
        expenses.map(e => e.createdAt?.substring(0, 7)).filter((m): m is string => Boolean(m)),
    )).sort().reverse();

    const filtered = expenses.filter(exp => {
        const matchMonth    = monthFilter    === 'all' || exp.createdAt?.startsWith(monthFilter);
        const matchCategory = categoryFilter === 'all' || exp.categoryName === categoryFilter;
        return matchMonth && matchCategory;
    });

    const handleDelete = async () => {
        await actions.deleteExpenses([...selected]);
        setSelected(new Set());
        onChanged();
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <select onChange={e => setMonthFilter(e.target.value)} className="border p-2 rounded-lg">
                    <option value="all">All Months</option>
                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={handleDelete}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600">
                    Delete Selected ({selected.size})
                </button>
            </div>

            <table className="w-full text-left">
                <thead className="bg-gray-50 border-b text-xs font-bold text-gray-500">
                    <tr>
                        <th className="p-4">Select</th>
                        <th className="p-4">Date</th>
                        <th className="p-4">Description</th>
                        <th className="p-4">
                            <select value={categoryFilter}
                                onChange={e => setCategoryFilter(e.target.value)}
                                className="bg-transparent uppercase">
                                <option value="all">Category ▼</option>
                                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                        </th>
                        <th className="p-4 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {filtered.map(exp => (
                        <tr key={exp.id} className="border-b hover:bg-blue-50">
                            <td className="p-4">
                                <input type="checkbox" checked={selected.has(exp.id)}
                                    onChange={() => toggle(exp.id)} />
                            </td>
                            <td className="p-4 text-gray-600">{exp.createdAt?.split('T')[0]}</td>
                            <td className="p-4 font-medium">{exp.description}</td>
                            <td className="p-4 text-indigo-600">{exp.categoryName}</td>
                            <td className="p-4 text-right font-bold">${exp.amount.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
