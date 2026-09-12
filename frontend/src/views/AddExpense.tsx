import { useState, useRef, useEffect, useMemo } from 'react';
import type { Category, ExpenseActions } from '../types';
import CategoryDropdown from '../components/CategoryDropdown';

interface Props {
    categories: Category[];
    actions:    ExpenseActions;
    onSaved:    () => void;
}

// ---------------------------------------------------------------------------
// Static style constants
// ---------------------------------------------------------------------------

const STYLES = {
    iconMark: {
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    } as React.CSSProperties,

    flashBox: {
        background: 'rgba(16,185,129,0.15)',
        border: '1px solid rgba(16,185,129,0.3)',
        color: '#6ee7b7',
    } as React.CSSProperties,

    label: { color: 'rgba(255,255,255,0.4)' } as React.CSSProperties,
    labelMuted: { color: 'rgba(255,255,255,0.2)' } as React.CSSProperties,
    rupeePrefix: { color: 'rgba(255,255,255,0.35)' } as React.CSSProperties,

    input: {
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.1)',
    } as React.CSSProperties,
    inputFocus: { border: '1px solid rgba(99,102,241,0.7)' } as React.CSSProperties,
    inputBlur:  { border: '1px solid rgba(255,255,255,0.1)' } as React.CSSProperties,

    btnSaving: {
        background: 'rgba(99,102,241,0.4)',
        boxShadow: 'none',
    } as React.CSSProperties,
    btnReady: {
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        boxShadow: '0 8px 24px rgba(99,102,241,0.3)',
    } as React.CSSProperties,
} as const;

export default function AddExpense({ categories, actions, onSaved }: Props) {
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
    const [saving,             setSaving]             = useState(false);
    const [flash,              setFlash]              = useState(false);

    // Store the timer handle so we can clear it if the component unmounts
    const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Cleanup: cancel any pending flash timer on unmount
        return () => {
            if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
        };
    }, []);

    // Submit button style only changes when `saving` changes
    const submitStyle = useMemo<React.CSSProperties>(
        () => saving ? STYLES.btnSaving : STYLES.btnReady,
        [saving],
    );

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCategoryId) return;
        setSaving(true);
        const form = e.currentTarget;
        const data = new FormData(form);
        const ok = await actions.addExpense({
            amount:      parseFloat(data.get('amount') as string),
            description: (data.get('description') as string).trim() || '',
            categoryId:  selectedCategoryId,
        });
        setSaving(false);
        if (ok) {
            form.reset();
            setSelectedCategoryId(null);
            setFlash(true);
            // Safe timeout — cleared on unmount via ref
            if (flashTimerRef.current !== null) clearTimeout(flashTimerRef.current);
            flashTimerRef.current = setTimeout(() => setFlash(false), 2000);
            onSaved();
        }
    };

    return (
        <div className="max-w-md">
            <div className="flex items-center gap-3 mb-8">
                <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-lg font-black text-white"
                    style={STYLES.iconMark}
                >
                    +
                </div>
                <h2 className="text-xl font-black text-white">Add Expense</h2>
            </div>

            {/* Success flash */}
            {flash && (
                <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-6 font-semibold" style={STYLES.flashBox}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Expense saved successfully!
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">

                {/* Amount */}
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={STYLES.label}>
                        Amount
                    </label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold" style={STYLES.rupeePrefix}>
                            ₹
                        </span>
                        <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            className="w-full rounded-xl pl-8 pr-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                            style={STYLES.input}
                            onFocus={e => Object.assign(e.currentTarget.style, STYLES.inputFocus)}
                            onBlur={e  => Object.assign(e.currentTarget.style, STYLES.inputBlur)}
                            required
                        />
                    </div>
                </div>

                {/* Category */}
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={STYLES.label}>
                        Category
                    </label>
                    <CategoryDropdown
                        categories={categories}
                        value={selectedCategoryId}
                        onChange={setSelectedCategoryId}
                        required
                        dark
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={STYLES.label}>
                        Description{' '}
                        <span style={STYLES.labelMuted}>(optional)</span>
                    </label>
                    <input
                        name="description"
                        type="text"
                        placeholder="e.g. Lunch at Chipotle"
                        className="w-full rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 outline-none"
                        style={STYLES.input}
                        onFocus={e => Object.assign(e.currentTarget.style, STYLES.inputFocus)}
                        onBlur={e  => Object.assign(e.currentTarget.style, STYLES.inputBlur)}
                    />
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
                    style={submitStyle}
                >
                    {saving ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Saving…
                        </span>
                    ) : 'Save Entry'}
                </button>
            </form>
        </div>
    );
}
