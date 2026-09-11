import { useState, useCallback } from 'react';
import type { Category, CategoryActions } from '../types';

interface Props {
    categories: Category[];
    actions: CategoryActions;
    onChanged: () => void;
}

export default function Categories({ categories, actions, onChanged }: Props) {
    const [newName,    setNewName]    = useState('');
    const [selected,   setSelected]   = useState<Set<number>>(new Set());
    // editingId: which row is in edit mode; editValue: the draft name
    const [editingId,  setEditingId]  = useState<number | null>(null);
    const [editValue,  setEditValue]  = useState('');
    const [editError,  setEditError]  = useState('');
    const [editLoading, setEditLoading] = useState(false);

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

    const startEdit = (cat: Category) => {
        setEditingId(cat.id);
        setEditValue(cat.name);
        setEditError('');
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValue('');
        setEditError('');
    };

    const saveEdit = async (id: number) => {
        const trimmed = editValue.trim();
        if (!trimmed) { setEditError('Name cannot be empty'); return; }
        setEditLoading(true);
        setEditError('');
        const ok = await actions.updateCategory(id, trimmed);
        setEditLoading(false);
        if (ok) {
            setEditingId(null);
            setEditValue('');
            onChanged();
        } else {
            setEditError('Name already exists or update failed');
        }
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
                    <tr>
                        <th className="p-4">Select</th>
                        <th className="p-4">Category Name</th>
                        <th className="p-4">Edit</th>
                    </tr>
                </thead>
                <tbody>
                    {categories.map(cat => (
                        <tr key={cat.id} className="border-b hover:bg-gray-50">
                            <td className="p-4">
                                <input type="checkbox" checked={selected.has(cat.id)}
                                    onChange={() => toggle(cat.id)}
                                    disabled={editingId === cat.id} />
                            </td>

                            {/* Name cell — toggles between read and edit mode */}
                            <td className="p-4">
                                {editingId === cat.id ? (
                                    <div className="flex flex-col gap-1">
                                        <input
                                            autoFocus
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') saveEdit(cat.id);
                                                if (e.key === 'Escape') cancelEdit();
                                            }}
                                            className="border p-2 rounded-lg w-full max-w-xs"
                                        />
                                        {editError && (
                                            <span className="text-red-500 text-xs">{editError}</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="font-medium text-gray-700">{cat.name}</span>
                                )}
                            </td>

                            {/* Action cell — edit / save / cancel buttons */}
                            <td className="p-4">
                                {editingId === cat.id ? (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => saveEdit(cat.id)}
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
                                        onClick={() => startEdit(cat)}
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
    );
}
