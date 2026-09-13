// RecurringView — manage recurring expense templates and dump them into
// the real expenses table for a chosen date.
//
// SOLID:
//   SRP  — only handles the recurring-template UI; no network code.
//   DIP  — all mutations come through injected `actions`; no apiFetch import.
//   ISP  — receives exactly RecurringActions + the data it needs, nothing more.
//
// Performance:
//   - Static STYLES object outside component (never recreated).
//   - All callbacks in useCallback; row styles in useMemo.
//   - selectAll placed after `items` prop (no ordering hazard).

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Category, RecurringExpense, RecurringActions, DumpResult, NewRecurringExpense } from '../types';
import SelectAllCheckbox from '../components/SelectAllCheckbox';

interface Props {
    items:      RecurringExpense[];
    categories: Category[];
    actions:    RecurringActions;
    onChanged:  () => void;   // reload recurring list
    onDumped:   () => void;   // reload main expense list after a dump
}

// ---------------------------------------------------------------------------
// Static style constants — defined outside component
// ---------------------------------------------------------------------------

const STYLES = {
    iconMark: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } as React.CSSProperties,

    addInput: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
    } as React.CSSProperties,
    addInputFocus: { border: '1px solid rgba(99,102,241,0.7)' } as React.CSSProperties,
    addInputBlur:  { border: '1px solid rgba(255,255,255,0.1)' } as React.CSSProperties,

    addSelect: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.7)',
    } as React.CSSProperties,

    addBtn: {
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
    } as React.CSSProperties,

    deleteBtn: {
        background: 'rgba(239,68,68,0.15)',
        color: '#f87171',
        border: '1px solid rgba(239,68,68,0.25)',
    } as React.CSSProperties,

    dumpCard: {
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.2)',
    } as React.CSSProperties,
    dumpBtn: {
        background: 'linear-gradient(135deg, #10b981, #059669)',
        boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
    } as React.CSSProperties,
    dumpInput: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.75)',
        colorScheme: 'dark',
    } as React.CSSProperties,

    warnBox: {
        background: 'rgba(251,191,36,0.1)',
        border: '1px solid rgba(251,191,36,0.3)',
        color: '#fcd34d',
    } as React.CSSProperties,
    successBox: {
        background: 'rgba(16,185,129,0.1)',
        border: '1px solid rgba(16,185,129,0.3)',
        color: '#6ee7b7',
    } as React.CSSProperties,

    emptyBox: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.1)',
    } as React.CSSProperties,

    editInput: {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(99,102,241,0.6)',
    } as React.CSSProperties,
    editSelect: {
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(99,102,241,0.6)',
        color: 'rgba(255,255,255,0.85)',
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
} as const;

// ---------------------------------------------------------------------------
// Row background helper — defined outside component
// ---------------------------------------------------------------------------

function getRowStyle(selected: Set<number>, id: number): React.CSSProperties {
    return selected.has(id)
        ? { background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)' }
        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' };
}

// ---------------------------------------------------------------------------
// Today's date as YYYY-MM-DD (used to default the dump date picker)
// ---------------------------------------------------------------------------

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RecurringView({ items, categories, actions, onChanged, onDumped }: Props) {

    // ── Add-form state ───────────────────────────────────────────────────────
    const [newAmount, setNewAmount]     = useState('');
    const [newDesc,   setNewDesc]       = useState('');
    const [newCat,    setNewCat]        = useState('');
    const [adding,    setAdding]        = useState(false);
    const [addError,  setAddError]      = useState('');

    // ── Selection state ──────────────────────────────────────────────────────
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [deleting, setDeleting] = useState(false);

    // ── Inline edit state ────────────────────────────────────────────────────
    const [editingId,    setEditingId]    = useState<number | null>(null);
    const [editAmount,   setEditAmount]   = useState('');
    const [editDesc,     setEditDesc]     = useState('');
    const [editCat,      setEditCat]      = useState('');
    const [editLoading,  setEditLoading]  = useState(false);
    const [editError,    setEditError]    = useState('');

    // ── Dump state ───────────────────────────────────────────────────────────
    const [dumpDate,    setDumpDate]    = useState(todayIso);
    const [dumping,     setDumping]     = useState(false);
    const [dumpResult,  setDumpResult]  = useState<DumpResult | null>(null);
    const dumpDateRef = useRef<HTMLInputElement>(null);

    // Clear dump result when selection or date changes
    useEffect(() => { setDumpResult(null); }, [selected, dumpDate]);

    // ── Callbacks ────────────────────────────────────────────────────────────

    const toggle = useCallback((id: number) => {
        setSelected(prev => {
            const s = new Set(prev);
            s.has(id) ? s.delete(id) : s.add(id);
            return s;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelected(new Set(items.map(i => i.id)));
    }, [items]);

    const deselectAll = useCallback(() => {
        setSelected(new Set());
    }, []);

    const handleAdd = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const amt = parseFloat(newAmount);
        if (isNaN(amt) || amt <= 0) { setAddError('Amount must be > 0'); return; }
        if (!newCat) { setAddError('Select a category'); return; }
        setAddError('');
        setAdding(true);
        const payload: NewRecurringExpense = {
            amount: amt,
            description: newDesc.trim(),
            categoryId: parseInt(newCat, 10),
        };
        const ok = await actions.addRecurring(payload);
        setAdding(false);
        if (ok) { setNewAmount(''); setNewDesc(''); setNewCat(''); onChanged(); }
        else    { setAddError('Failed to add — check category or amount.'); }
    }, [newAmount, newDesc, newCat, actions, onChanged]);

    const handleDelete = useCallback(async () => {
        setDeleting(true);
        await actions.deleteRecurring([...selected]);
        setDeleting(false);
        setSelected(new Set());
        onChanged();
    }, [selected, actions, onChanged]);

    const startEdit = useCallback((item: RecurringExpense) => {
        setEditingId(item.id);
        setEditAmount(String(item.amount));
        setEditDesc(item.description);
        setEditCat(String(item.categoryId));
        setEditError('');
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingId(null);
        setEditError('');
    }, []);

    const saveEdit = useCallback(async (id: number) => {
        const amt = parseFloat(editAmount);
        if (isNaN(amt) || amt <= 0) { setEditError('Amount must be > 0'); return; }
        if (!editCat) { setEditError('Select a category'); return; }
        setEditLoading(true);
        setEditError('');
        const ok = await actions.updateRecurring(id, {
            amount: amt,
            description: editDesc.trim(),
            categoryId: parseInt(editCat, 10),
        });
        setEditLoading(false);
        if (ok) { setEditingId(null); onChanged(); }
        else    { setEditError('Update failed.'); }
    }, [editAmount, editDesc, editCat, actions, onChanged]);

    const handleDump = useCallback(async () => {
        if (selected.size === 0) return;
        setDumping(true);
        setDumpResult(null);
        const result = await actions.dumpRecurring([...selected], dumpDate);
        setDumping(false);
        if (result) {
            setDumpResult(result);
            if (result.added > 0) {
                setSelected(new Set());
                onDumped();
            }
        }
    }, [selected, dumpDate, actions, onDumped]);

    // ── Memos ────────────────────────────────────────────────────────────────

    const rowStyles = useMemo(
        () => new Map(items.map(item => [item.id, getRowStyle(selected, item.id)])),
        [items, selected],
    );

    // Map recurring ID → category name for the warning message
    const idToName = useMemo(
        () => new Map(items.map(i => [i.id, `${i.description || i.categoryName} (₹${i.amount})`])),
        [items],
    );

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div>
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg text-white" style={STYLES.iconMark}>
                    🔁
                </div>
                <div>
                    <h2 className="text-xl font-black text-white">Recurring Expenses</h2>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        Templates for expenses you pay every month. Select and dump them into My Expenses when due.
                    </p>
                </div>
            </div>

            {/* ── Add form ─────────────────────────────────────────────────── */}
            <form onSubmit={handleAdd} className="flex flex-wrap gap-3 mb-8">
                <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    placeholder="Amount"
                    className="w-32 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                    style={STYLES.addInput}
                    onFocus={e => Object.assign(e.currentTarget.style, STYLES.addInputFocus)}
                    onBlur={e  => Object.assign(e.currentTarget.style, STYLES.addInputBlur)}
                    required
                />
                <input
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                    placeholder="Description (e.g. Rent)"
                    className="flex-1 min-w-[140px] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                    style={STYLES.addInput}
                    onFocus={e => Object.assign(e.currentTarget.style, STYLES.addInputFocus)}
                    onBlur={e  => Object.assign(e.currentTarget.style, STYLES.addInputBlur)}
                />
                <select
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    className="rounded-xl px-4 py-3 text-sm outline-none appearance-none cursor-pointer"
                    style={STYLES.addSelect}
                    required
                >
                    <option value="">Category</option>
                    {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
                <button
                    type="submit"
                    disabled={adding}
                    className="shrink-0 px-5 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-60 transition-all"
                    style={STYLES.addBtn}
                >
                    {adding ? '…' : 'Add'}
                </button>
                {addError && (
                    <p className="w-full text-xs font-semibold" style={{ color: '#f87171' }}>{addError}</p>
                )}
            </form>

            {/* ── Toolbar ──────────────────────────────────────────────────── */}
            <div className="flex justify-between items-center mb-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                    <SelectAllCheckbox
                        totalCount={items.length}
                        selectedCount={selected.size}
                        onSelectAll={selectAll}
                        onDeselectAll={deselectAll}
                        disabled={editingId !== null || deleting}
                    />
                    <p className="text-xs font-semibold uppercase tracking-widest min-w-0 truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {selected.size > 0
                            ? `${selected.size} of ${items.length} selected`
                            : `${items.length} ${items.length === 1 ? 'template' : 'templates'}`}
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

            {/* ── Template list ─────────────────────────────────────────────── */}
            <div className="space-y-2 mb-8">
                {items.length === 0 && (
                    <div className="rounded-2xl p-10 text-center" style={STYLES.emptyBox}>
                        <p className="text-3xl mb-2">🔁</p>
                        <p className="font-bold text-white">No recurring templates yet</p>
                        <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            Add your regular expenses like rent, subscriptions, or recharges above.
                        </p>
                    </div>
                )}

                {items.map(item => (
                    <div
                        key={item.id}
                        className="flex items-center gap-4 rounded-xl px-4 py-3 transition-all"
                        style={rowStyles.get(item.id)}
                    >
                        {/* Checkbox */}
                        <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                            disabled={editingId === item.id}
                            className="w-4 h-4 accent-indigo-500 cursor-pointer shrink-0"
                        />

                        {/* Content / edit form */}
                        <div className="flex-1 min-w-0">
                            {editingId === item.id ? (
                                <div className="flex flex-wrap gap-2 items-start">
                                    <input
                                        autoFocus
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        value={editAmount}
                                        onChange={e => setEditAmount(e.target.value)}
                                        className="w-28 rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                                        style={STYLES.editInput}
                                    />
                                    <input
                                        value={editDesc}
                                        onChange={e => setEditDesc(e.target.value)}
                                        placeholder="Description"
                                        className="flex-1 min-w-[100px] rounded-lg px-3 py-1.5 text-sm text-white outline-none"
                                        style={STYLES.editInput}
                                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
                                    />
                                    <select
                                        value={editCat}
                                        onChange={e => setEditCat(e.target.value)}
                                        className="rounded-lg px-3 py-1.5 text-sm outline-none appearance-none"
                                        style={STYLES.editSelect}
                                    >
                                        <option value="">Category</option>
                                        {categories.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {editError && (
                                        <p className="w-full text-xs" style={{ color: '#f87171' }}>{editError}</p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-baseline gap-3 flex-wrap">
                                    <span className="font-black text-white">
                                        ₹{item.amount.toFixed(2)}
                                    </span>
                                    {item.description && (
                                        <span className="text-sm text-white truncate">{item.description}</span>
                                    )}
                                    <span
                                        className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                                        style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}
                                    >
                                        {item.categoryName}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Edit / Save / Cancel */}
                        {editingId === item.id ? (
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={() => saveEdit(item.id)}
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
                                onClick={() => startEdit(item)}
                                className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all shrink-0"
                                style={STYLES.editBtn}
                            >
                                Edit
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* ── Dump panel — only shown when at least one item is selected ── */}
            {selected.size > 0 && (
                <div className="rounded-2xl p-5 space-y-4" style={STYLES.dumpCard}>
                    <h3 className="text-sm font-bold text-white">
                        Add {selected.size} selected template{selected.size > 1 ? 's' : ''} to My Expenses
                    </h3>

                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                Date to use
                            </label>
                            <input
                                ref={dumpDateRef}
                                type="date"
                                value={dumpDate}
                                onChange={e => setDumpDate(e.target.value)}
                                className="rounded-xl px-3 py-2 text-sm font-semibold outline-none"
                                style={STYLES.dumpInput}
                            />
                        </div>
                        <button
                            onClick={handleDump}
                            disabled={dumping || !dumpDate}
                            className="self-end px-5 py-2.5 rounded-xl font-bold text-sm text-white disabled:opacity-50 transition-all"
                            style={STYLES.dumpBtn}
                        >
                            {dumping ? '⏳ Adding…' : '✚ Add to Expenses'}
                        </button>
                    </div>

                    {/* Feedback after dump */}
                    {dumpResult && (
                        <div>
                            {dumpResult.added > 0 && (
                                <div className="rounded-xl px-4 py-3 text-sm font-semibold mb-2" style={STYLES.successBox}>
                                    ✅ {dumpResult.added} expense{dumpResult.added > 1 ? 's' : ''} added to My Expenses.
                                </div>
                            )}
                            {dumpResult.warnings.length > 0 && (
                                <div className="rounded-xl px-4 py-3 text-sm" style={STYLES.warnBox}>
                                    <p className="font-bold mb-1">⚠️ Possible duplicates for this month:</p>
                                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                                        {dumpResult.warnings.map(id => (
                                            <li key={id}>{idToName.get(id) ?? `ID ${id}`}</li>
                                        ))}
                                    </ul>
                                    <p className="text-xs mt-2 opacity-75">These were still added — check My Expenses if you want to remove duplicates.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
