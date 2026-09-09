import { useState, useCallback } from 'react';
import type { Category, CategoryActions } from '../types';

interface Props {
    categories: Category[];
    actions: CategoryActions;
    onChanged: () => void;
}

export default function Categories({ categories, actions, onChanged }: Props) {
    const [newName,  setNewName]  = useState('');
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const toggle = useCallback((id: number) => {
        setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const ok = await actions.addCategory(newName);
        if (ok) { setNewName(''); onChanged(); }
    };

    const handleDelete = async () => {
        await actions.deleteCategories([...selected]);
        setSelected(new Set());
        onChanged();
    };

    return (
        <div>
            <form onSubmit={handleAdd} className="flex gap-2 mb-6 max-w-md">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                    className="flex-1 border p-3 rounded-lg" placeholder="New Category Name" required />
                <button type="submit"
                    className="bg-green-600 text-white px-6 rounded-lg font-bold hover:bg-green-700">
                    Add
                </button>
            </form>

            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg">Manage Categories</h3>
                <button onClick={handleDelete} disabled={selected.size === 0}
                    className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 disabled:opacity-50">
                    Delete Selected ({selected.size})
                </button>
            </div>

            <table className="w-full text-left border rounded-lg overflow-hidden">
                <thead className="bg-gray-50 border-b">
                    <tr><th className="p-4">Select</th><th className="p-4">Category Name</th></tr>
                </thead>
                <tbody>
                    {categories.map(cat => (
                        <tr key={cat.id} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                                <input type="checkbox" checked={selected.has(cat.id)}
                                    onChange={() => toggle(cat.id)} />
                            </td>
                            <td className="p-4 font-medium text-gray-700">{cat.name}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
