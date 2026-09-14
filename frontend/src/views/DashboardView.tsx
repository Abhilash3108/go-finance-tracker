import { useState, useMemo, useEffect, useCallback } from 'react';
import type { Category, CategoryPercentage, MonthlySummary } from '../types';
import CategoryFilter from '../components/CategoryFilter';

interface Props {
    categories:           Category[];
    availableYears:       string[];
    // All injected from useExpenseData — view never touches apiFetch directly (DIP).
    fetchCategoryPercent: (year: string, month: string) => Promise<CategoryPercentage[]>;
    fetchMonthlyTrend:    (year: string, month: string) => Promise<MonthlySummary[]>;
    fetchExport:          (from: string, to: string)    => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BAR_GRADIENTS = [
    'linear-gradient(90deg, #6366f1, #8b5cf6)',
    'linear-gradient(90deg, #06b6d4, #3b82f6)',
    'linear-gradient(90deg, #10b981, #059669)',
    'linear-gradient(90deg, #f59e0b, #ef4444)',
    'linear-gradient(90deg, #ec4899, #8b5cf6)',
    'linear-gradient(90deg, #14b8a6, #06b6d4)',
];
const BAR_DOT_COLORS = ['#818cf8', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#2dd4bf'];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const MONTHS = [
    { value: '1',  label: 'January'   },
    { value: '2',  label: 'February'  },
    { value: '3',  label: 'March'     },
    { value: '4',  label: 'April'     },
    { value: '5',  label: 'May'       },
    { value: '6',  label: 'June'      },
    { value: '7',  label: 'July'      },
    { value: '8',  label: 'August'    },
    { value: '9',  label: 'September' },
    { value: '10', label: 'October'   },
    { value: '11', label: 'November'  },
    { value: '12', label: 'December'  },
];

// ---------------------------------------------------------------------------
// Helpers defined outside component — never recreated on render
// ---------------------------------------------------------------------------

/** Convert year/month dropdown values to a YYYY-MM-DD bound for the export API.
 *  Returns '' when year is 'all' (no bound). */
function toIsoDate(year: string, month: string, side: 'from' | 'to'): string {
    if (year === 'all') return '';
    if (month !== 'all') {
        const m = month.padStart(2, '0');
        if (side === 'from') return `${year}-${m}-01`;
        const lastDay = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
        return `${year}-${m}-${String(lastDay).padStart(2, '0')}`;
    }
    return side === 'from' ? `${year}-01-01` : `${year}-12-31`;
}

// ---------------------------------------------------------------------------
// Static style constants
// ---------------------------------------------------------------------------

const STYLES = {
    totalCard: {
        background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))',
        border: '1px solid rgba(99,102,241,0.3)',
    } as React.CSSProperties,
    totalLabel:   { color: 'rgba(165,180,252,0.7)' } as React.CSSProperties,

    statCard: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
    } as React.CSSProperties,
    statLabel:    { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,
    statSub:      { color: '#a78bfa' } as React.CSSProperties,
    statSubMuted: { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,

    sectionCard: {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
    } as React.CSSProperties,
    sectionLabel: { color: 'rgba(255,255,255,0.4)' } as React.CSSProperties,

    barTrack:  { background: 'rgba(255,255,255,0.07)' } as React.CSSProperties,
    barGlow:   { boxShadow: '0 0 8px rgba(99,102,241,0.4)' } as React.CSSProperties,
    pctColor:  { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,

    // Monthly trend bar column
    trendBarTrack: {
        background: 'rgba(255,255,255,0.06)',
        borderRadius: '6px 6px 0 0',
    } as React.CSSProperties,
    trendLabel: { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,
    trendAmt:   { color: 'rgba(255,255,255,0.55)' } as React.CSSProperties,
    trendPeak:  { color: '#a5b4fc' } as React.CSSProperties,

    emptyBox: {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
    } as React.CSSProperties,
    emptySubtext: { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,

    select: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.7)',
    } as React.CSSProperties,
    selectActive: {
        background: 'rgba(99,102,241,0.15)',
        border: '1px solid rgba(99,102,241,0.5)',
        color: '#a5b4fc',
    } as React.CSSProperties,

    scopeBadge: {
        background: 'rgba(99,102,241,0.12)',
        border: '1px solid rgba(99,102,241,0.25)',
        color: '#a5b4fc',
    } as React.CSSProperties,

    skeletonBlock: { background: 'rgba(255,255,255,0.08)' } as React.CSSProperties,

    exportBtn: {
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
        color: '#fff',
    } as React.CSSProperties,
    exportInput: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.75)',
        colorScheme: 'dark',
    } as React.CSSProperties,
} as const;

// ---------------------------------------------------------------------------
// Helpers defined outside component — never recreated on render
// ---------------------------------------------------------------------------

/** Parse "YYYY-MM-DD" → short label e.g. "Jun 2024" */
function monthLabel(isoDate: string): string {
    const parts = isoDate.split('-');
    const m = parseInt(parts[1], 10) - 1;
    return `${MONTH_NAMES[m] ?? parts[1]} ${parts[0]}`;
}

/** Short label for narrow bars e.g. "Jun" */
function monthShort(isoDate: string): string {
    const parts = isoDate.split('-');
    const m = parseInt(parts[1], 10) - 1;
    return MONTH_NAMES[m] ?? parts[1];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DashboardView({
    categories,
    availableYears,
    fetchCategoryPercent,
    fetchMonthlyTrend,
    fetchExport,
}: Props) {
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [year,    setYear]    = useState(() => String(new Date().getFullYear()));
    const [month,   setMonth]   = useState(() => String(new Date().getMonth() + 1));

    const [pctData,   setPctData]   = useState<CategoryPercentage[]>([]);
    const [trendData, setTrendData] = useState<MonthlySummary[]>([]);
    const [loading,   setLoading]   = useState(true);

    // Export state — date inputs pre-filled from the current scope
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo,   setExportTo]   = useState('');
    const [exporting,  setExporting]  = useState(false);
    const [exportError, setExportError] = useState('');

    // Single effect — both API calls share the same year/month scope
    // Both callbacks are stable (useCallback in hook), so this fires only
    // when the user actually changes a filter.
    const load = useCallback(async () => {
        setLoading(true);
        const [pct, trend] = await Promise.all([
            fetchCategoryPercent(year, month),
            fetchMonthlyTrend(year, month),
        ]);
        setPctData(pct);
        setTrendData(trend);
        setLoading(false);
    }, [fetchCategoryPercent, fetchMonthlyTrend, year, month]);

    useEffect(() => { load(); }, [load]);

    const handleYearChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setYear(val);
        if (val === 'all') setMonth('all');
        // Pre-fill export date range to match the newly selected scope
        setExportFrom(toIsoDate(val, 'all', 'from'));
        setExportTo(toIsoDate(val, 'all', 'to'));
    }, []);

    const handleMonthChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        setMonth(val);
        // Re-sync export bounds when month changes
        setExportFrom(toIsoDate(year, val, 'from'));
        setExportTo(toIsoDate(year, val, 'to'));
    }, [year]);

    const handleExportFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setExportFrom(e.target.value);
        setExportError('');
    }, []);

    const handleExportToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setExportTo(e.target.value);
        setExportError('');
    }, []);

    const handleExport = useCallback(async () => {
        if (exportFrom && exportTo && exportFrom > exportTo) {
            setExportError('"From" date must be before "To" date.');
            return;
        }
        setExportError('');
        setExporting(true);
        await fetchExport(exportFrom, exportTo);
        setExporting(false);
    }, [fetchExport, exportFrom, exportTo]);

    // ---------------------------------------------------------------------------
    // Derived: category stats — recomputes only when categoryFilter or pctData changes
    // ---------------------------------------------------------------------------
    const { total, topSpend, count, sorted } = useMemo(() => {
        const disp = categoryFilter === 'all'
            ? pctData
            : pctData.filter(d => d.categoryName === categoryFilter);

        // Backend returns one row per (year, category) when year=all — aggregate
        // by categoryName first so totals and percentages are correct across all years.
        const map = new Map<string, number>();
        for (const d of disp) {
            map.set(d.categoryName, (map.get(d.categoryName) ?? 0) + d.totalAmount);
        }

        const tot = [...map.values()].reduce((sum, v) => sum + v, 0);
        const merged = [...map.entries()].map(([categoryName, totalAmount]) => ({
            categoryName,
            totalAmount,
            percentage: tot > 0 ? (totalAmount / tot) * 100 : 0,
        }));

        const top = merged.length > 0
            ? merged.reduce((a, b) => a.totalAmount > b.totalAmount ? a : b)
            : null;
        return {
            total:    tot,
            topSpend: top,
            count:    merged.length,
            sorted:   [...merged].sort((a, b) => b.totalAmount - a.totalAmount),
        };
    }, [categoryFilter, pctData]);

    // trendData is already ordered ASC from the backend — use directly.
    // Only the max value needs computing.
    const trendMax = useMemo(
        () => trendData.reduce((m, d) => Math.max(m, d.totalAmount), 0),
        [trendData],
    );

    // ---------------------------------------------------------------------------
    // Scope badge label
    // ---------------------------------------------------------------------------
    const scopeLabel = useMemo(() => {
        if (year === 'all') return 'All time';
        const monthName = month !== 'all'
            ? MONTHS.find(m => m.value === month)?.label
            : null;
        return monthName ? `${monthName} ${year}` : year;
    }, [year, month]);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------
    return (
        <div className="space-y-6">

            {/* ── Header + filters ───────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                    <h2 className="text-xl font-black text-white">Overview</h2>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={STYLES.scopeBadge}>
                        {scopeLabel}
                    </span>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {/* Year */}
                    <select
                        value={year}
                        onChange={handleYearChange}
                        className="rounded-xl px-3 py-2 text-xs font-semibold outline-none appearance-none cursor-pointer"
                        style={year !== 'all' ? STYLES.selectActive : STYLES.select}
                    >
                        <option value="all">All Years</option>
                        {availableYears.map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>

                    {/* Month — disabled until a year is chosen */}
                    <select
                        value={month}
                        onChange={handleMonthChange}
                        disabled={year === 'all'}
                        className="rounded-xl px-3 py-2 text-xs font-semibold outline-none appearance-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        style={month !== 'all' ? STYLES.selectActive : STYLES.select}
                    >
                        <option value="all">All Months</option>
                        {MONTHS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>

                    {/* Category filter — client-side only, no extra fetch */}
                    <div className="w-40">
                        <CategoryFilter
                            categories={categories}
                            value={categoryFilter}
                            onChange={setCategoryFilter}
                            dark
                        />
                    </div>
                </div>
            </div>

            {/* ── Export CSV ─────────────────────────────────────────────── */}
            <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-semibold uppercase tracking-widest" style={STYLES.sectionLabel}>
                        Export CSV
                    </span>
                    <input
                        type="date"
                        value={exportFrom}
                        onChange={handleExportFromChange}
                        className="rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                        style={STYLES.exportInput}
                        aria-label="Export from date"
                    />
                    <span className="text-xs" style={STYLES.sectionLabel}>→</span>
                    <input
                        type="date"
                        value={exportTo}
                        onChange={handleExportToChange}
                        className="rounded-xl px-3 py-2 text-xs font-semibold outline-none"
                        style={STYLES.exportInput}
                        aria-label="Export to date"
                    />
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        style={STYLES.exportBtn}
                    >
                        {exporting ? '⏳ Exporting…' : '⬇ Download'}
                    </button>
                </div>
                {exportError && (
                    <p className="text-xs font-semibold" style={{ color: '#f87171' }}>{exportError}</p>
                )}
            </div>

            {/* ── Loading skeleton ───────────────────────────────────────── */}
            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="rounded-2xl p-6 animate-pulse" style={STYLES.statCard}>
                            <div className="h-3 w-20 rounded mb-4" style={STYLES.skeletonBlock} />
                            <div className="h-8 w-32 rounded"       style={STYLES.skeletonBlock} />
                        </div>
                    ))}
                </div>
            ) : (
                <>
                    {/* ── Stat cards ─────────────────────────────────────── */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

                        <div className="rounded-2xl p-6" style={STYLES.totalCard}>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={STYLES.totalLabel}>
                                Total Spent
                            </p>
                            <p className="text-3xl sm:text-4xl font-black text-white break-all">
                                ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                        </div>

                        <div className="rounded-2xl p-6" style={STYLES.statCard}>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={STYLES.statLabel}>
                                Top Category
                            </p>
                            {topSpend ? (
                                <>
                                    <p className="text-xl font-black text-white truncate">{topSpend.categoryName}</p>
                                    <p className="text-sm mt-1 font-semibold" style={STYLES.statSub}>
                                        ₹{topSpend.totalAmount.toFixed(2)} · {topSpend.percentage.toFixed(1)}%
                                    </p>
                                </>
                            ) : (
                                <p className="text-white font-bold">—</p>
                            )}
                        </div>

                        <div className="rounded-2xl p-6" style={STYLES.statCard}>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={STYLES.statLabel}>
                                Categories
                            </p>
                            <p className="text-4xl font-black text-white">{count}</p>
                            <p className="text-sm mt-1" style={STYLES.statSubMuted}>with expenses</p>
                        </div>
                    </div>

                    {pctData.length === 0 && trendData.length === 0 ? (
                        /* ── Empty state ────────────────────────────────── */
                        <div className="rounded-2xl p-12 text-center" style={STYLES.emptyBox}>
                            <p className="text-4xl mb-3">📊</p>
                            <p className="font-bold text-white">No data for this period</p>
                            <p className="text-sm mt-1" style={STYLES.emptySubtext}>
                                {year === 'all'
                                    ? 'Add some expenses to see your breakdown.'
                                    : 'Try a different year or month.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                            {/* ── Category Breakdown ───────────────────── */}
                            <div className="rounded-2xl p-6 space-y-5" style={STYLES.sectionCard}>
                                <h3 className="text-sm font-bold uppercase tracking-widest" style={STYLES.sectionLabel}>
                                    Category Breakdown
                                </h3>

                                {sorted.length === 0 ? (
                                    <p className="text-sm py-4 text-center" style={STYLES.emptySubtext}>
                                        No categories match the current filter.
                                    </p>
                                ) : sorted.map((c, i) => {
                                    const colorIdx = i % BAR_GRADIENTS.length;
                                    return (
                                        <div key={c.categoryName} className="space-y-1.5">
                                            <div className="flex justify-between items-baseline gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className="w-2 h-2 rounded-full shrink-0 inline-block"
                                                        style={{ background: BAR_DOT_COLORS[colorIdx] }}
                                                    />
                                                    <span className="text-sm font-semibold text-white truncate">
                                                        {c.categoryName}
                                                    </span>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className="text-sm font-bold text-white">
                                                        ₹{c.totalAmount.toFixed(2)}
                                                    </span>
                                                    <span className="text-xs ml-2 font-semibold" style={STYLES.pctColor}>
                                                        {c.percentage.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-2 rounded-full overflow-hidden" style={STYLES.barTrack}>
                                                <div
                                                    className="h-full rounded-full"
                                                    style={{
                                                        width: `${Math.min(c.percentage, 100)}%`,
                                                        background: BAR_GRADIENTS[colorIdx],
                                                        transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                                                        ...STYLES.barGlow,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ── Monthly Trend ────────────────────────── */}
                            <div className="rounded-2xl p-6" style={STYLES.sectionCard}>
                                <h3 className="text-sm font-bold uppercase tracking-widest mb-6" style={STYLES.sectionLabel}>
                                    Monthly Trend
                                    {month !== 'all' && (
                                        <span className="ml-2 normal-case font-normal text-xs" style={STYLES.pctColor}>
                                            (single month selected)
                                        </span>
                                    )}
                                </h3>

                                {trendData.length === 0 ? (
                                    <p className="text-sm py-4 text-center" style={STYLES.emptySubtext}>
                                        No monthly data for this period.
                                    </p>
                                ) : (
                                    /* Vertical bar chart */
                                    <div className="flex items-end gap-1.5 h-40 overflow-x-auto pb-1">
                                        {trendData.map(row => {
                                            const heightPct = trendMax > 0
                                                ? (row.totalAmount / trendMax) * 100
                                                : 0;
                                            const isPeak = row.totalAmount === trendMax;
                                            return (
                                                <div
                                                    key={row.month}
                                                    className="flex flex-col items-center gap-1 flex-1 min-w-[36px] group"
                                                    title={`${monthLabel(row.month)}: ₹${row.totalAmount.toFixed(2)}`}
                                                >
                                                    {/* Amount label — visible on hover or for peak */}
                                                    <span
                                                        className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                                                        style={isPeak ? STYLES.trendPeak : STYLES.trendAmt}
                                                    >
                                                        ₹{row.totalAmount >= 1000
                                                            ? `${(row.totalAmount / 1000).toFixed(1)}k`
                                                            : row.totalAmount.toFixed(0)}
                                                    </span>

                                                    {/* Bar */}
                                                    <div className="w-full relative flex-1 flex items-end" style={STYLES.trendBarTrack}>
                                                        <div
                                                            className="w-full rounded-t-md"
                                                            style={{
                                                                height: `${Math.max(heightPct, 4)}%`,
                                                                background: isPeak
                                                                    ? 'linear-gradient(180deg, #818cf8, #6366f1)'
                                                                    : 'linear-gradient(180deg, rgba(99,102,241,0.5), rgba(99,102,241,0.2))',
                                                                transition: 'height 0.7s cubic-bezier(0.4,0,0.2,1)',
                                                            }}
                                                        />
                                                    </div>

                                                    {/* Month label */}
                                                    <span
                                                        className="text-[10px] font-semibold"
                                                        style={isPeak ? STYLES.trendPeak : STYLES.trendLabel}
                                                    >
                                                        {monthShort(row.month)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Peak month callout */}
                                {trendData.length > 1 && trendMax > 0 && (() => {
                                    const peak = trendData.find(r => r.totalAmount === trendMax)!;
                                    return (
                                        <p className="text-xs mt-4" style={STYLES.trendLabel}>
                                            Peak:{' '}
                                            <span className="font-bold" style={STYLES.trendPeak}>
                                                {monthLabel(peak.month)}
                                            </span>
                                            {' — '}
                                            ₹{peak.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        </p>
                                    );
                                })()}
                            </div>

                        </div>
                    )}
                </>
            )}
        </div>
    );
}
