import { useState, useCallback } from 'react';
import type { Expense, Category, ExpenseViewerActions } from '../types';
import CategoryDropdown from '../components/CategoryDropdown';
import CategoryFilter   from '../components/CategoryFilter';

interface Props {
    expenses:   Expense[];
    categories: Category[];
    actions:    ExpenseViewerActions;
    onChanged:  () => void;
}

interface EditState {
    amount:      string;
    description: string;
    categoryId:  number;
}

export default function ExpenseViewer({ expenses, categories, actions, onChanged }: Props) {
    const [monthFilter,    setMonthFilter]    = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [selected,       setSelected]       = useState<Set<number>>(new Set());

    // Edit state
    const [editingId,   setEditingId]   = useState<number | null>(null);
    const [editState,   setEditState]   = useState<EditState>({ amount: '', description: '', categoryId: 0 });
    const [editError,   setEditError]   = useState('');
    const [editLoading, setEditLoading] = useState(false);

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

    const startEdit = (exp: Expense) => {
        setEditingId(exp.id);
        setEditState({
            amount:      exp.amount.toString(),
            description: exp.description ?? '',
            categoryId:  exp.categoryId,
        });
        setEditError('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditError('');
    };

    const saveEdit = async (id: number) => {
        const amount = parseFloat(editState.amount);
        if (!editState.amount || isNaN(amount) || amount <= 0) {
            setEditError('Amount must be greater than 0');
            return;
        }
        if (!editState.categoryId) {
            setEditError('Please select a category');
            return;
        }
        setEditLoading(true);
        setEditError('');
        const ok = await actions.updateExpense(id, {
            amount,
            description: editState.description.trim(),
            categoryId:  editState.categoryId,
        });
        setEditLoading(false);
        if (ok) {
            setEditingId(null);
            onChanged();
        } else {
            setEditError('Update failed — please try again');
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <select onChange={e => setMonthFilter(e.target.value)} className="border p-2 rounded-lg">
                    <option value="all">All Months</option>
                    {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button onClick={handleDelete} disabled={selected.size === 0}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50">
                    Delete Selected ({selected.size})
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b text-xs font-bold text-gray-500">
                        <tr>
                            <th className="p-4">Select</th>
                            <th className="p-4">Date</th>
                            <th className="p-4">Description</th>
                            <th className="p-4">
                                <CategoryFilter
                                    categories={categories}
                                    value={categoryFilter}
                                    onChange={setCategoryFilter}
                                    allLabel="Category"
                                />
                            </th>
                            <th className="p-4 text-right">Amount</th>
                            <th className="p-4">Edit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(exp => (
                            <tr key={exp.id} className="border-b hover:bg-blue-50">
                                {/* Checkbox */}
                                <td className="p-4">
                                    <input type="checkbox" checked={selected.has(exp.id)}
                                        onChange={() => toggle(exp.id)}
                                        disabled={editingId === exp.id} />
                                </td>

                                {/* Date — never editable */}
                                <td className="p-4 text-gray-600 whitespace-nowrap">
                                    {exp.createdAt?.split('T')[0]}
                                </td>

                                {editingId === exp.id ? (
                                    <>
                                        {/* Description edit */}
                                        <td className="p-4">
                                            <input
                                                autoFocus
                                                value={editState.description}
                                                onChange={e => setEditState(s => ({ ...s, description: e.target.value }))}
                                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
                                                placeholder="Description (optional)"
                                                className="border p-2 rounded-lg w-full min-w-[140px]"
                                            />
                                        </td>

                                        {/* Category edit */}
                                        <td className="p-4 min-w-[160px]">
                                            <CategoryDropdown
                                                categories={categories}
                                                value={editState.categoryId || null}
                                                onChange={id => setEditState(s => ({ ...s, categoryId: id }))}
                                            />
                                        </td>

                                        {/* Amount edit */}
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-gray-500">₹</span>
                                                    <input
                                                        type="number" step="0.01" min="0.01"
                                                        value={editState.amount}
                                                        onChange={e => setEditState(s => ({ ...s, amount: e.target.value }))}
                                                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(exp.id); if (e.key === 'Escape') cancelEdit(); }}
                                                        className="border p-2 rounded-lg w-28 text-right"
                                                    />
                                                </div>
                                                {editError && (
                                                    <span className="text-red-500 text-xs text-right">{editError}</span>
                                                )}
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td className="p-4 font-medium">{exp.description}</td>
                                        <td className="p-4 text-indigo-600">{exp.categoryName}</td>
                                        <td className="p-4 text-right font-bold">₹{exp.amount.toFixed(2)}</td>
                                    </>
                                )}

                                {/* Edit / Save / Cancel */}
                                <td className="p-4">
                                    {editingId === exp.id ? (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => saveEdit(exp.id)}
                                                disabled={editLoading}
                                                className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                                                {editLoading ? 'Saving…' : 'Save'}
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                disabled={editLoading}
                                                className="bg-gray-200 text-gray-700 px-3 py-1 rounded-lg text-sm font-bold hover:bg-gray-300 disabled:opacity-50">
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => startEdit(exp)}
                                            className="text-indigo-600 hover:text-indigo-800 text-sm font-bold px-2 py-1 rounded hover:bg-indigo-50">
                                            ✏️ Edit
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
