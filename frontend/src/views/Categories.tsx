import { useState, useCallback, useMemo } from 'react';
import type { Category, CategoryActions } from '../types';
import SelectAllCheckbox from '../components/SelectAllCheckbox';

interface Props {
    categories: Category[];
    actions:    CategoryActions;
    onChanged:  () => void;
}

// ---------------------------------------------------------------------------
// Static style constants
// ---------------------------------------------------------------------------

const STYLES = {
    iconMark: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } as React.CSSProperties,

    addInput: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
    } as React.CSSProperties,
    addInputFocus: { border: '1px solid rgba(99,102,241,0.7)' } as React.CSSProperties,
    addInputBlur:  { border: '1px solid rgba(255,255,255,0.1)' } as React.CSSProperties,

    addBtn: {
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
    } as React.CSSProperties,

    deleteBtn: {
        background: 'rgba(239,68,68,0.15)',
        color: '#f87171',
        border: '1px solid rgba(239,68,68,0.25)',
    } as React.CSSProperties,

    emptyBox: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.1)',
    } as React.CSSProperties,

    editInput: {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(99,102,241,0.6)',
    } as React.CSSProperties,

    saveBtn: {
        background: 'rgba(99,102,241,0.25)',
        color: '#a5b4fc',
        border: '1px solid rgba(99,102,241,0.4)',
    } as React.CSSProperties,
    cancelBtn: {
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.4)',
        border: '1px solid rgba(255,255,255,0.1)',
    } as React.CSSProperties,
    editBtn: {
        background: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.35)',
        border: '1px solid rgba(255,255,255,0.08)',
    } as React.CSSProperties,
    editBtnHoverColor: '#a5b4fc',
    editBtnLeaveColor: 'rgba(255,255,255,0.35)',
} as const;

// Helper: compute row background/border based on selection state.
// Defined outside the component so it is never recreated on render.
function getRowStyle(selected: Set<number>, id: number): React.CSSProperties {
    return selected.has(id)
        ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }
        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' };
}

export default function Categories({ categories, actions, onChanged }: Props) {
    const [newName,     setNewName]     = useState('');
    const [selected,    setSelected]    = useState<Set<number>>(new Set());
    const [editingId,   setEditingId]   = useState<number | null>(null);
    const [editValue,   setEditValue]   = useState('');
    const [editError,   setEditError]   = useState('');
    const [editLoading, setEditLoading] = useState(false);
    const [adding,      setAdding]      = useState(false);
    const [deleting,    setDeleting]    = useState(false);

    const toggle = useCallback((id: number) => {
        setSelected(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    }, []);

    // Stable — categories ref doesn't change identity unless the list changes
    const selectAll   = useCallback(() => {
        setSelected(new Set(categories.map(c => c.id)));
    }, [categories]);

    const deselectAll = useCallback(() => {
        setSelected(new Set());
    }, []);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setAdding(true);
        const ok = await actions.addCategory(newName.trim());
        setAdding(false);
        if (ok) { setNewName(''); onChanged(); }
    };

    const handleDelete = async () => {
        setDeleting(true);
        await actions.deleteCategories([...selected]);
        setDeleting(false);
        setSelected(new Set());
        onChanged();
    };

    const startEdit  = useCallback((cat: Category) => {
        setEditingId(cat.id);
        setEditValue(cat.name);
        setEditError('');
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditValue('');
        setEditError('');
    }, []);

    const saveEdit = async (id: number) => {
        const trimmed = editValue.trim();
        if (!trimmed) { setEditError('Name cannot be empty'); return; }
        setEditLoading(true);
        setEditError('');
        const ok = await actions.updateCategory(id, trimmed);
        setEditLoading(false);
        if (ok) { setEditingId(null); setEditValue(''); onChanged(); }
        else    { setEditError('Name already exists or update failed'); }
    };

    // Memoize row styles so they only recompute when `selected` or `editingId` changes
    const rowStyles = useMemo(
        () => new Map(categories.map(cat => [cat.id, getRowStyle(selected, cat.id)])),
        [categories, selected],
    );

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg text-white" style={STYLES.iconMark}>
                    ⊞
                </div>
                <h2 className="text-xl font-black text-white">Categories</h2>
            </div>

            {/* Add form */}
            <form onSubmit={handleAdd} className="flex gap-3 mb-8 max-w-md">
                <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="New category name"
                    className="flex-1 min-w-0 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                    style={STYLES.addInput}
                    onFocus={e => Object.assign(e.currentTarget.style, STYLES.addInputFocus)}
                    onBlur={e  => Object.assign(e.currentTarget.style, STYLES.addInputBlur)}
                    required
                />
                {/* shrink-0 prevents the button from compressing below its label width */}
                <button
                    type="submit"
                    disabled={adding}
                    className="shrink-0 px-5 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-60 transition-all"
                    style={STYLES.addBtn}
                >
                    {adding ? '…' : 'Add'}
                </button>
            </form>

            {/* Toolbar */}
            <div className="flex justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <SelectAllCheckbox
                        totalCount={categories.length}
                        selectedCount={selected.size}
                        onSelectAll={selectAll}
                        onDeselectAll={deselectAll}
                        disabled={editingId !== null || deleting}
                    />
                    <p className="text-xs font-semibold uppercase tracking-widest min-w-0 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {selected.size > 0
                            ? `${selected.size} of ${categories.length} selected`
                            : `${categories.length} ${categories.length === 1 ? 'category' : 'categories'}`}
                    </p>
                </div>
                {selected.size > 0 && (
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="shrink-0 flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                        style={STYLES.deleteBtn}
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {deleting ? 'Deleting…' : `Delete (${selected.size})`}
                    </button>
                )}
            </div>

            {/* Category list */}
            <div className="space-y-2">
                {categories.length === 0 && (
                    <div className="rounded-2xl p-10 text-center" style={STYLES.emptyBox}>
                        <p className="text-3xl mb-2">📂</p>
                        <p className="font-bold text-white">No categories yet</p>
                        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Add one above to get started.</p>
                    </div>
                )}

                {categories.map(cat => (
                    <div
                        key={cat.id}
                        className="flex items-center gap-4 rounded-xl px-4 py-3 transition-all"
                        style={rowStyles.get(cat.id)}
                    >
                        {/* Checkbox */}
                        <input
                            type="checkbox"
                            checked={selected.has(cat.id)}
                            onChange={() => toggle(cat.id)}
                            disabled={editingId === cat.id}
                            className="w-4 h-4 accent-indigo-500 cursor-pointer shrink-0"
                        />

                        {/* Name / edit input */}
                        <div className="flex-1 min-w-0">
                            {editingId === cat.id ? (
                                <div className="space-y-1">
                                    <input
                                        autoFocus
                                        value={editValue}
                                        onChange={e => setEditValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter')  saveEdit(cat.id);
                                            if (e.key === 'Escape') cancelEdit();
                                        }}
                                        className="rounded-lg px-3 py-1.5 text-sm text-white outline-none w-full"
                                        style={STYLES.editInput}
                                    />
                                    {editError && (
                                        <p className="text-xs" style={{ color: '#f87171' }}>{editError}</p>
                                    )}
                                </div>
                            ) : (
                                <span className="font-semibold text-sm text-white truncate block">{cat.name}</span>
                            )}
                        </div>

                        {/* Edit / Save / Cancel */}
                        {editingId === cat.id ? (
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => saveEdit(cat.id)}
                                    disabled={editLoading}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                    style={STYLES.saveBtn}
                                >
                                    {editLoading ? '…' : 'Save'}
                                </button>
                                <button
                                    onClick={cancelEdit}
                                    disabled={editLoading}
                                    className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
                                    style={STYLES.cancelBtn}
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => startEdit(cat)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all shrink-0"
                                style={STYLES.editBtn}
                                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = STYLES.editBtnHoverColor; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = STYLES.editBtnLeaveColor; }}
                            >
                                Edit
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
