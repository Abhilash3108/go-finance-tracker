import { useState, useCallback, useMemo } from 'react';
import type { Expense, Category, ExpenseViewerActions } from '../types';
import CategoryDropdown    from '../components/CategoryDropdown';
import CategoryFilter      from '../components/CategoryFilter';
import SelectAllCheckbox   from '../components/SelectAllCheckbox';

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

// ---------------------------------------------------------------------------
// Static style constants
// ---------------------------------------------------------------------------

const STYLES = {
    iconMark:   { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } as React.CSSProperties,
    deleteBtn:  { background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' } as React.CSSProperties,
    summaryBar: { background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)' } as React.CSSProperties,
    summaryAmt: { color: '#a5b4fc' } as React.CSSProperties,
    summaryLbl: { color: 'rgba(165,180,252,0.7)' } as React.CSSProperties,
    tableWrap:  { border: '1px solid rgba(255,255,255,0.07)' } as React.CSSProperties,
    thead:      { background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.07)' } as React.CSSProperties,
    th:         { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,
    tdDate:     { color: 'rgba(255,255,255,0.45)' } as React.CSSProperties,
    categoryTag: { background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.25)' } as React.CSSProperties,
    editInput:  { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(99,102,241,0.5)' } as React.CSSProperties,
    saveBtn:    { background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' } as React.CSSProperties,
    cancelBtn:  { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)' } as React.CSSProperties,
    editBtn:    { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,
    emptyBox:   { background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)' } as React.CSSProperties,
    monthSelect: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Row background helper — defined outside component so it is never recreated
// ---------------------------------------------------------------------------

function getRowStyle(selected: Set<number>, id: number, idx: number): React.CSSProperties {
    return {
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: selected.has(id)
            ? 'rgba(99,102,241,0.1)'
            : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
    };
}

// ---------------------------------------------------------------------------
// ExpenseEditRow — isolated sub-component; receives only what it needs
// ---------------------------------------------------------------------------

interface EditRowProps {
    editState:  EditState;
    editError:  string;
    editLoading: boolean;
    categories: Category[];
    onChange:   (field: keyof EditState, value: string | number) => void;
    onSave:     () => void;
    onCancel:   () => void;
}

function ExpenseEditRow({
    editState, editError, editLoading, categories, onChange, onSave, onCancel,
}: EditRowProps) {
    const handleCategoryChange = useCallback(
        (id: number) => onChange('categoryId', id),
        [onChange],
    );

    return (
        <>
            {/* Description edit */}
            <td className="px-4 py-3">
                <input
                    autoFocus
                    value={editState.description}
                    onChange={e => onChange('description', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
                    placeholder="Description"
                    className="rounded-lg px-3 py-1.5 text-sm text-white outline-none w-full"
                    style={STYLES.editInput}
                />
            </td>

            {/* Category edit */}
            <td className="px-4 py-3" style={{ minWidth: '160px', maxWidth: '200px' }}>
                <CategoryDropdown
                    categories={categories}
                    value={editState.categoryId || null}
                    onChange={handleCategoryChange}
                    dark
                />
            </td>

            {/* Amount edit */}
            <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1">
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>₹</span>
                        <input
                            type="number" step="0.01" min="0.01"
                            value={editState.amount}
                            onChange={e => onChange('amount', e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter')  onSave();
                                if (e.key === 'Escape') onCancel();
                            }}
                            className="rounded-lg px-2 py-1.5 text-sm text-white text-right outline-none w-24"
                            style={STYLES.editInput}
                        />
                    </div>
                    {editError && (
                        <span className="text-xs" style={{ color: '#f87171' }}>{editError}</span>
                    )}
                </div>
            </td>

            {/* Save / Cancel */}
            <td className="px-4 py-3">
                <div className="flex gap-1.5">
                    <button
                        onClick={onSave}
                        disabled={editLoading}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                        style={STYLES.saveBtn}
                    >
                        {editLoading ? '…' : 'Save'}
                    </button>
                    <button
                        onClick={onCancel}
                        disabled={editLoading}
                        className="text-xs font-bold px-2.5 py-1.5 rounded-lg disabled:opacity-50"
                        style={STYLES.cancelBtn}
                    >
                        ✕
                    </button>
                </div>
            </td>
        </>
    );
}

// ---------------------------------------------------------------------------
// ExpenseViewer — owns filtering, selection, and edit orchestration
// ---------------------------------------------------------------------------

export default function ExpenseViewer({ expenses, categories, actions, onChanged }: Props) {
    const [monthFilter,    setMonthFilter]    = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [selected,       setSelected]       = useState<Set<number>>(new Set());
    const [editingId,      setEditingId]      = useState<number | null>(null);
    const [editState,      setEditState]      = useState<EditState>({ amount: '', description: '', categoryId: 0 });
    const [editError,      setEditError]      = useState('');
    const [editLoading,    setEditLoading]    = useState(false);
    const [deleting,       setDeleting]       = useState(false);

    const toggle = useCallback((id: number) => {
        setSelected(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    }, []);

    // All three derived values share one memo — recomputed only when deps change
    const { availableMonths, filtered, filteredTotal } = useMemo(() => {
        const months = Array.from(new Set(
            expenses.map(e => e.createdAt?.substring(0, 7)).filter((m): m is string => Boolean(m)),
        )).sort().reverse();

        const rows = expenses.filter(exp => {
            const matchMonth    = monthFilter    === 'all' || exp.createdAt?.startsWith(monthFilter);
            const matchCategory = categoryFilter === 'all' || exp.categoryName === categoryFilter;
            return matchMonth && matchCategory;
        });

        const total = rows.reduce((sum, e) => sum + e.amount, 0);

        return { availableMonths: months, filtered: rows, filteredTotal: total };
    }, [expenses, monthFilter, categoryFilter]);

    // Select only visible (filtered) rows; deselect clears everything
    const selectAll   = useCallback(() => {
        setSelected(prev => {
            const s = new Set(prev);
            filtered.forEach(e => s.add(e.id));
            return s;
        });
    }, [filtered]);

    const deselectAll = useCallback(() => setSelected(new Set()), []);

    // Count how many filtered rows are currently selected (for tri-state header)
    const filteredSelectedCount = useMemo(
        () => filtered.filter(e => selected.has(e.id)).length,
        [filtered, selected],
    );

    const handleDelete = async () => {
        setDeleting(true);
        await actions.deleteExpenses([...selected]);
        setDeleting(false);
        setSelected(new Set());
        onChanged();
    };

    const startEdit = useCallback((exp: Expense) => {
        setEditingId(exp.id);
        setEditState({ amount: exp.amount.toString(), description: exp.description ?? '', categoryId: exp.categoryId });
        setEditError('');
    }, []);

    const cancelEdit = useCallback(() => { setEditingId(null); setEditError(''); }, []);

    // Stable callback for the edit row's field changes
    const handleEditChange = useCallback((field: keyof EditState, value: string | number) => {
        setEditState(s => ({ ...s, [field]: value }));
    }, []);

    const saveEdit = async (id: number) => {
        const amount = parseFloat(editState.amount);
        if (!editState.amount || isNaN(amount) || amount <= 0) { setEditError('Amount must be > 0'); return; }
        if (!editState.categoryId) { setEditError('Select a category'); return; }
        setEditLoading(true); setEditError('');
        const ok = await actions.updateExpense(id, {
            amount,
            description: editState.description.trim(),
            categoryId:  editState.categoryId,
        });
        setEditLoading(false);
        if (ok) { setEditingId(null); onChanged(); }
        else    { setEditError('Update failed — please try again'); }
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg text-white" style={STYLES.iconMark}>
                    ≡
                </div>
                <h2 className="text-xl font-black text-white">Expenses</h2>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
                <div className="flex gap-3 flex-wrap">
                    {/* Month filter */}
                    <select
                        onChange={e => setMonthFilter(e.target.value)}
                        className="rounded-xl px-4 py-2 text-sm font-semibold outline-none appearance-none cursor-pointer"
                        style={STYLES.monthSelect}
                    >
                        <option value="all">All Months</option>
                        {availableMonths.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    {/* Category filter */}
                    <CategoryFilter
                        categories={categories}
                        value={categoryFilter}
                        onChange={setCategoryFilter}
                        allLabel="All Categories"
                        dark
                    />
                </div>

                {selected.size > 0 && (
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-xl transition-all disabled:opacity-50"
                        style={STYLES.deleteBtn}
                    >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        {deleting ? 'Deleting…' : `Delete (${selected.size})`}
                    </button>
                )}
            </div>

            {/* Summary strip */}
            {filtered.length > 0 && (
                <div className="flex items-center justify-between rounded-xl px-5 py-3 mb-4" style={STYLES.summaryBar}>
                    <span className="text-xs font-semibold" style={STYLES.summaryLbl}>
                        {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'}
                    </span>
                    <span className="text-sm font-black" style={STYLES.summaryAmt}>
                        ₹{filteredTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                </div>
            )}

            {/* Table / empty state */}
            {filtered.length === 0 ? (
                <div className="rounded-2xl p-12 text-center" style={STYLES.emptyBox}>
                    <p className="text-3xl mb-2">💸</p>
                    <p className="font-bold text-white">No expenses found</p>
                    <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Try adjusting the filters.</p>
                </div>
            ) : (
                <div className="overflow-x-auto rounded-xl" style={STYLES.tableWrap}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={STYLES.thead}>
                                <th className="px-4 py-3 text-left w-8">
                                    <SelectAllCheckbox
                                        totalCount={filtered.length}
                                        selectedCount={filteredSelectedCount}
                                        onSelectAll={selectAll}
                                        onDeselectAll={deselectAll}
                                        disabled={editingId !== null || deleting}
                                    />
                                </th>
                                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={STYLES.th}>Date</th>
                                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={STYLES.th}>Description</th>
                                <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={STYLES.th}>
                                    <CategoryFilter
                                        categories={categories}
                                        value={categoryFilter}
                                        onChange={setCategoryFilter}
                                        allLabel="Category"
                                        dark compact
                                    />
                                </th>
                                <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider" style={STYLES.th}>Amount</th>
                                <th className="px-4 py-3 w-24" />
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((exp, idx) => (
                                <tr key={exp.id} style={getRowStyle(selected, exp.id, idx)}>

                                    {/* Checkbox */}
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selected.has(exp.id)}
                                            onChange={() => toggle(exp.id)}
                                            disabled={editingId === exp.id}
                                            className="w-4 h-4 accent-indigo-500 cursor-pointer"
                                        />
                                    </td>

                                    {/* Date — never editable */}
                                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium" style={STYLES.tdDate}>
                                        {exp.createdAt?.split('T')[0]}
                                    </td>

                                    {editingId === exp.id ? (
                                        <ExpenseEditRow
                                            editState={editState}
                                            editError={editError}
                                            editLoading={editLoading}
                                            categories={categories}
                                            onChange={handleEditChange}
                                            onSave={() => saveEdit(exp.id)}
                                            onCancel={cancelEdit}
                                        />
                                    ) : (
                                        <>
                                            <td className="px-4 py-3 text-white font-medium">
                                                {exp.description || <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={STYLES.categoryTag}>
                                                    {exp.categoryName}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-white">
                                                ₹{exp.amount.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => startEdit(exp)}
                                                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all"
                                                    style={STYLES.editBtn}
                                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#a5b4fc'; }}
                                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; }}
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
