import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Category, CategoryBreakdown, SpendingActions, SpendingGroup } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
    categories: Category[];
    actions:    SpendingActions;
}

// ---------------------------------------------------------------------------
// Date-range presets
// ---------------------------------------------------------------------------

type Preset = 'all' | 'year' | '3m' | '1m' | 'current' | 'custom';

interface DateRange { from: string; to: string; }

function getPresetRange(preset: Preset): DateRange {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth(); // 0-based

    const pad     = (n: number) => String(n).padStart(2, '0');
    const ymd     = (year: number, month: number, day: number) =>
        `${year}-${pad(month + 1)}-${pad(day)}`;
    const lastDay = (year: number, month: number) =>
        new Date(year, month + 1, 0).getDate();

    if (preset === 'all')     return { from: '', to: '' };

    if (preset === 'current') return {
        from: ymd(y, m, 1),
        to:   ymd(y, m, lastDay(y, m)),
    };

    if (preset === 'year') return {
        from: `${y}-01-01`,
        to:   ymd(y, m, lastDay(y, m)),
    };

    if (preset === '1m') {
        const pm = m === 0 ? 11 : m - 1;
        const py = m === 0 ? y - 1 : y;
        return { from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)) };
    }

    if (preset === '3m') {
        const endM   = m === 0 ? 11 : m - 1;
        const endY   = m === 0 ? y - 1 : y;
        const startM = ((endM - 2) + 12) % 12;
        const startY = endM < 2 ? endY - 1 : endY;
        return { from: ymd(startY, startM, 1), to: ymd(endY, endM, lastDay(endY, endM)) };
    }

    return { from: '', to: '' }; // custom
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

const INR = new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});
const fmt = (n: number) => INR.format(n);

function fmtMonth(iso: string) {
    const [y, m] = iso.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleString('default', {
        month: 'short', year: '2-digit',
    });
}

// ---------------------------------------------------------------------------
// Static preset definitions
// ---------------------------------------------------------------------------

const PRESETS: { key: Preset; label: string }[] = [
    { key: 'all',     label: 'All time' },
    { key: 'current', label: 'This month' },
    { key: 'year',    label: 'This year' },
    { key: '3m',      label: 'Last 3 months' },
    { key: '1m',      label: 'Last month' },
    { key: 'custom',  label: 'Custom' },
];

// ---------------------------------------------------------------------------
// Static styles
// ---------------------------------------------------------------------------

const STYLES = {
    chipActive:   { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: '1px solid transparent' }              as React.CSSProperties,
    chipInactive: { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }     as React.CSSProperties,

    presetActive:   { background: 'rgba(99,102,241,0.25)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }                   as React.CSSProperties,
    presetInactive: { background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,

    // Saved group chip
    groupChip:    { background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.3)' }                     as React.CSSProperties,
    groupDel:     { background: 'none', border: 'none', color: '#6ee7b7', cursor: 'pointer', padding: '0 0 0 4px', lineHeight: 1 }        as React.CSSProperties,

    // Save input row
    saveInput: {
        background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
        border: '1px solid rgba(255,255,255,0.12)', outline: 'none',
    } as React.CSSProperties,
    saveBtn: {
        background: 'rgba(99,102,241,0.2)', color: '#a5b4fc',
        border: '1px solid rgba(99,102,241,0.35)', cursor: 'pointer',
    } as React.CSSProperties,

    card:     { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' } as React.CSSProperties,
    barTrack: { background: 'rgba(255,255,255,0.07)' }                                             as React.CSSProperties,
    barFill:  { background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', minWidth: '2px' }            as React.CSSProperties,

    sectionLabel: { color: 'rgba(255,255,255,0.35)' }  as React.CSSProperties,
    allTimeVal:   { color: '#a5b4fc' }                  as React.CSSProperties,
    emptyState:   { color: 'rgba(255,255,255,0.3)' }    as React.CSSProperties,

    dateInput: {
        background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
        border: '1px solid rgba(255,255,255,0.12)', outline: 'none',
    } as React.CSSProperties,

    selectAllBtn: { color: '#818cf8', background: 'none', border: 'none', padding: 0, cursor: 'pointer' } as React.CSSProperties,
    cardHeader:   { cursor: 'pointer', userSelect: 'none' as const }                                      as React.CSSProperties,
    chevron:      { color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', transition: 'transform 0.2s' }   as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SpendingView({ categories, actions }: Props) {
    const [selectedIds,  setSelectedIds]  = useState<Set<number>>(new Set());
    const [preset,       setPreset]       = useState<Preset>('all');
    const [customFrom,   setCustomFrom]   = useState('');
    const [customTo,     setCustomTo]     = useState('');
    const [breakdown,    setBreakdown]    = useState<CategoryBreakdown[]>([]);
    const [loading,      setLoading]      = useState(false);

    // Saved groups — loaded from server on mount
    const [groups,     setGroups]     = useState<SpendingGroup[]>([]);
    const [groupName,  setGroupName]  = useState('');

    // ---------------------------------------------------------------------------
    // Date range
    // ---------------------------------------------------------------------------

    const dateRange = useMemo<DateRange>(() => {
        if (preset === 'custom') return { from: customFrom, to: customTo };
        return getPresetRange(preset);
    }, [preset, customFrom, customTo]);

    // ---------------------------------------------------------------------------
    // Fetch
    // ---------------------------------------------------------------------------

    const actionsRef = useRef(actions);
    actionsRef.current = actions;

    const doFetch = useCallback(async (ids: Set<number>, range: DateRange) => {
        if (ids.size === 0) { setBreakdown([]); return; }
        setLoading(true);
        try {
            const data = await actionsRef.current.fetchCategoryBreakdown(
                Array.from(ids), range.from, range.to,
            );
            setBreakdown(data);
        } finally {
            setLoading(false);
        }
    }, []);

    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const fire = () => doFetch(selectedIds, dateRange);
        if (preset === 'custom') {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            debounceTimer.current = setTimeout(fire, 600);
            return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
        }
        fire();
    }, [selectedIds, dateRange, preset, doFetch]);

    // ---------------------------------------------------------------------------
    // Category handlers
    // ---------------------------------------------------------------------------

    const toggleCategory = useCallback((id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(categories.map(c => c.id)));
    }, [categories]);

    const clearAll = useCallback(() => setSelectedIds(new Set()), []);

    const handlePreset = useCallback((p: Preset) => {
        setPreset(p);
        if (p !== 'custom') { setCustomFrom(''); setCustomTo(''); }
    }, []);

    // ---------------------------------------------------------------------------
    // Group handlers
    // ---------------------------------------------------------------------------

    // Load groups from server on mount
    useEffect(() => {
        actionsRef.current.fetchGroups().then(setGroups);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSaveGroup = useCallback(async () => {
        const name = groupName.trim();
        if (!name || selectedIds.size === 0) return;
        const created = await actionsRef.current.saveGroup(name, Array.from(selectedIds));
        if (created) {
            setGroups(prev => [...prev, created]);
            setGroupName('');
        }
    }, [groupName, selectedIds]);

    const applyGroup = useCallback((group: SpendingGroup) => {
        const valid = new Set(categories.map(c => c.id));
        setSelectedIds(new Set(group.categoryIds.filter(id => valid.has(id))));
    }, [categories]);

    const handleDeleteGroup = useCallback(async (id: number) => {
        await actionsRef.current.deleteGroup(id);
        setGroups(prev => prev.filter(g => g.id !== id));
    }, []);

    // ---------------------------------------------------------------------------
    // Derived
    // ---------------------------------------------------------------------------

    const { grandTotal, maxMonthly } = useMemo(() => {
        let grand = 0, maxM = 0;
        for (const b of breakdown) {
            grand += b.allTimeTotal;
            for (const mo of b.monthly) if (mo.total > maxM) maxM = mo.total;
        }
        return { grandTotal: grand, maxMonthly: maxM || 1 };
    }, [breakdown]);

    const allSelected = categories.length > 0 && selectedIds.size === categories.length;

    // Collapse state — Set of categoryIds whose monthly breakdown is hidden.
    // Starts empty (all expanded). Toggled per card header click.
    const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

    const toggleCollapse = useCallback((id: number) => {
        setCollapsedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div className="flex flex-col gap-6">

            {/* ---- Header ---- */}
            <div className="flex flex-col gap-1">
                <h2 className="text-xl font-black text-white">Spending Analysis</h2>
                <p className="text-sm" style={STYLES.sectionLabel}>
                    Select categories and a date range to see monthly breakdowns + all-time totals.
                </p>
            </div>

            {/* ---- Saved groups ---- */}
            {groups.length > 0 && (
                <section className="flex flex-col gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider" style={STYLES.sectionLabel}>
                        Saved groups
                    </span>
                    <div className="flex flex-wrap gap-2">
                        {groups.map(g => (
                            <div key={g.id} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold" style={STYLES.groupChip}>
                                <button
                                    className="font-bold"
                                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                                    onClick={() => applyGroup(g)}
                                    title={`Select: ${g.categoryIds.length} categories`}
                                >
                                    {g.name}
                                    <span style={{ opacity: 0.6, marginLeft: 4 }}>({g.categoryIds.length})</span>
                                </button>
                                <button style={STYLES.groupDel} onClick={() => handleDeleteGroup(g.id)} title="Remove group">×</button>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* ---- Category chips ---- */}
            <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider" style={STYLES.sectionLabel}>
                        Categories
                    </span>
                    <div className="flex gap-3 text-xs font-semibold">
                        {!allSelected && (
                            <button style={STYLES.selectAllBtn} onClick={selectAll}>Select all</button>
                        )}
                        {selectedIds.size > 0 && (
                            <button style={STYLES.selectAllBtn} onClick={clearAll}>Clear</button>
                        )}
                    </div>
                </div>

                {categories.length === 0 ? (
                    <p className="text-sm" style={STYLES.emptyState}>No categories yet. Add some first.</p>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {categories.map(c => {
                            const active = selectedIds.has(c.id);
                            return (
                                <button
                                    key={c.id}
                                    className="px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                                    style={active ? STYLES.chipActive : STYLES.chipInactive}
                                    onClick={() => toggleCategory(c.id)}
                                >
                                    {c.name}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Save current selection as a group */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                        <input
                            type="text"
                            placeholder="Group name…"
                            value={groupName}
                            maxLength={32}
                            onChange={e => setGroupName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSaveGroup()}
                            className="rounded-lg px-3 py-1.5 text-xs w-40"
                            style={STYLES.saveInput}
                        />
                        <button
                            className="px-3 py-1.5 rounded-lg text-xs font-bold"
                            style={STYLES.saveBtn}
                            onClick={handleSaveGroup}
                            disabled={!groupName.trim()}
                        >
                            Save group
                        </button>
                    </div>
                )}
            </section>

            {/* ---- Date range ---- */}
            <section className="flex flex-col gap-3">
                <span className="text-xs font-bold uppercase tracking-wider" style={STYLES.sectionLabel}>
                    Date range
                </span>
                <div className="flex flex-wrap gap-2">
                    {PRESETS.map(p => (
                        <button
                            key={p.key}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={preset === p.key ? STYLES.presetActive : STYLES.presetInactive}
                            onClick={() => handlePreset(p.key)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {preset === 'custom' && (
                    <div className="flex flex-wrap gap-3 items-center mt-1">
                        <label className="flex flex-col gap-1 text-xs font-medium" style={STYLES.sectionLabel}>
                            From
                            <input
                                type="date"
                                value={customFrom}
                                onChange={e => setCustomFrom(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-sm font-mono"
                                style={STYLES.dateInput}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-medium" style={STYLES.sectionLabel}>
                            To
                            <input
                                type="date"
                                value={customTo}
                                onChange={e => setCustomTo(e.target.value)}
                                className="rounded-lg px-3 py-1.5 text-sm font-mono"
                                style={STYLES.dateInput}
                            />
                        </label>
                    </div>
                )}
            </section>

            {/* ---- Grand total bar ---- */}
            {!loading && breakdown.length > 1 && (
                <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4" style={STYLES.card}>
                    <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold uppercase tracking-wider" style={STYLES.sectionLabel}>
                            Combined total
                        </span>
                        <span className="text-xs" style={STYLES.sectionLabel}>
                            {breakdown.length} categories
                        </span>
                    </div>
                    <span className="text-2xl font-black" style={STYLES.allTimeVal}>
                        {fmt(grandTotal)}
                    </span>
                </div>
            )}

            {/* ---- Results ---- */}
            <section className="flex flex-col gap-4">
                {selectedIds.size === 0 && (
                    <div className="py-12 text-center text-sm" style={STYLES.emptyState}>
                        👆 Select one or more categories above to see spending data.
                    </div>
                )}

                {selectedIds.size > 0 && loading && (
                    <div className="py-8 text-center text-sm" style={STYLES.emptyState}>
                        Loading…
                    </div>
                )}

                {selectedIds.size > 0 && !loading && breakdown.length === 0 && (
                    <div className="py-12 text-center text-sm" style={STYLES.emptyState}>
                        No expenses found for the selected categories and date range.
                    </div>
                )}

                {!loading && breakdown.map(cat => {
                    const collapsed = collapsedIds.has(cat.categoryId);
                    return (
                        <div key={cat.categoryId} className="rounded-2xl overflow-hidden" style={STYLES.card}>

                            {/* Header — always visible, click to toggle */}
                            <div
                                className="flex items-center justify-between gap-2 px-5 py-4"
                                style={STYLES.cardHeader}
                                onClick={() => toggleCollapse(cat.categoryId)}
                            >
                                <div className="flex items-center gap-2">
                                    <span
                                        style={{
                                            ...STYLES.chevron,
                                            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                                        }}
                                    >▼</span>
                                    <h3 className="font-black text-white text-base">{cat.categoryName}</h3>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs" style={STYLES.sectionLabel}>All-time total</span>
                                    <span className="text-lg font-black" style={STYLES.allTimeVal}>
                                        {fmt(cat.allTimeTotal)}
                                    </span>
                                </div>
                            </div>

                            {/* Monthly breakdown — shown when expanded */}
                            {!collapsed && (
                                <div className="px-5 pb-5 flex flex-col gap-2">
                                    {cat.monthly.length === 0 ? (
                                        <p className="text-xs" style={STYLES.emptyState}>No monthly data available.</p>
                                    ) : (
                                        <>
                                            <span className="text-xs font-bold uppercase tracking-wider" style={STYLES.sectionLabel}>
                                                Monthly breakdown
                                            </span>
                                            <div className="flex flex-col gap-2">
                                                {cat.monthly.map(mo => {
                                                    const pct = Math.max(2, (mo.total / maxMonthly) * 100);
                                                    return (
                                                        <div key={mo.month} className="flex items-center gap-3">
                                                            <span className="text-xs font-mono w-14 shrink-0 text-right" style={STYLES.sectionLabel}>
                                                                {fmtMonth(mo.month)}
                                                            </span>
                                                            <div className="flex-1 h-5 rounded-full overflow-hidden" style={STYLES.barTrack}>
                                                                <div className="h-full rounded-full" style={{ ...STYLES.barFill, width: `${pct}%` }} />
                                                            </div>
                                                            <span className="text-xs font-bold w-24 text-right text-white shrink-0">
                                                                {fmt(mo.total)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                        </div>
                    );
                })}
            </section>

        </div>
    );
}
