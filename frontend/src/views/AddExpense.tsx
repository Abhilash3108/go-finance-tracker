import type { Category, ExpenseActions } from '../types';

interface Props {
    categories: Category[];
    actions: ExpenseActions;
    onSaved: () => void;
}

export default function AddExpense({ categories, actions, onSaved }: Props) {
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const ok = await actions.addExpense({
            amount:      parseFloat(data.get('amount') as string),
            description: data.get('description') as string,
            categoryId:  parseInt(data.get('categoryId') as string, 10),
        });
        if (ok) { form.reset(); onSaved(); }
    };

    return (
        <form onSubmit={handleSubmit} className="max-w-md space-y-4">
            <h2 className="text-2xl font-bold mb-4">Add Expense</h2>
            <input name="amount" type="number" step="0.01" min="0.01"
                placeholder="Amount ($)" className="w-full border p-3 rounded-lg" required />
            <select name="categoryId" className="w-full border p-3 rounded-lg bg-white" required>
                <option value="">Select Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input name="description" type="text"
                placeholder="Description" className="w-full border p-3 rounded-lg" required />
            <button type="submit"
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition">
                Save Entry
            </button>
        </form>
    );
}
