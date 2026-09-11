import { useState } from 'react';
import type { Category, ExpenseActions } from '../types';
import CategoryDropdown from '../components/CategoryDropdown';

interface Props {
    categories: Category[];
    actions:    ExpenseActions;
    onSaved:    () => void;
}

export default function AddExpense({ categories, actions, onSaved }: Props) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCategoryId) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        const ok = await actions.addExpense({
            amount:      parseFloat(data.get('amount') as string),
            description: (data.get('description') as string).trim() || '',
            categoryId:  selectedCategoryId,
        });
        if (ok) {
            form.reset();
            setSelectedCategoryId(null);
            onSaved();
        }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
            <h2 className="text-2xl font-bold mb-4">Add Expense</h2>

            <input name="amount" type="number" step="0.01" min="0.01"
                placeholder="Amount (₹)" className="w-full border p-3 rounded-lg" required />

            <CategoryDropdown
                categories={categories}
                value={selectedCategoryId}
                onChange={setSelectedCategoryId}
                required
            />

            <input name="description" type="text"
                placeholder="Description (optional)" className="w-full border p-3 rounded-lg" />

            <button type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
                Save Entry
            </button>
        </form>
    );
}
