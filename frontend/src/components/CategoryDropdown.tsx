// Reusable searchable category dropdown — no external library.
// Used by AddExpense and ExpenseViewer (edit row).
// Pass dark={true} for the dark-themed app shell.

import { useState, useRef, useMemo, useCallback } from 'react';
import type { Category } from '../types';
import { useClickOutside } from '../hooks/useClickOutside';

export interface CategoryDropdownProps {
    categories: Category[];
    value:      number | null;
    onChange:   (id: number) => void;
    required?:  boolean;
    name?:      string;
    dark?:      boolean;
}

// ---------------------------------------------------------------------------
// Static style constants — defined once, never recreated on render
// ---------------------------------------------------------------------------

const TRIGGER_DARK: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'rgba(255,255,255,0.3)',
};
const TRIGGER_DARK_OPEN: React.CSSProperties = {
    ...TRIGGER_DARK,
    border: '1px solid rgba(99,102,241,0.7)',
};
const PANEL_DARK: React.CSSProperties = {
    background: '#1e1f2e',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
};
const PANEL_LIGHT: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #e5e7eb',
    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
};
const SEARCH_DARK: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
};
const SEARCH_BORDER_DARK: React.CSSProperties = { borderBottom: '1px solid rgba(255,255,255,0.07)' };
const SEARCH_BORDER_LIGHT: React.CSSProperties = { borderBottom: '1px solid #f3f4f6' };
const CHEVRON_OPEN:  React.CSSProperties = { transition: 'transform 0.2s', transform: 'rotate(180deg)' };
const CHEVRON_CLOSE: React.CSSProperties = { transition: 'transform 0.2s' };

export default function CategoryDropdown({
    categories,
    value,
    onChange,
    required,
    name = 'categoryId',
    dark = false,
}: CategoryDropdownProps) {
    const [open,  setOpen]  = useState(false);
    const [query, setQuery] = useState('');
    const containerRef      = useRef<HTMLDivElement>(null);
    const inputRef          = useRef<HTMLInputElement>(null);

    const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
    useClickOutside(containerRef, close);

    const selected = useMemo(() => categories.find(c => c.id === value) ?? null, [categories, value]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q === '' ? categories : categories.filter(c => c.name.toLowerCase().includes(q));
    }, [categories, query]);

    const openDropdown = useCallback(() => {
        setOpen(true);
        setQuery('');
        setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    const selectCategory = useCallback((cat: Category) => {
        onChange(cat.id);
        setOpen(false);
        setQuery('');
    }, [onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') close();
    }, [close]);

    // Compose trigger class names without prop spreading
    const triggerClass = dark
        ? 'w-full text-left flex justify-between items-center rounded-xl px-4 py-3 text-sm outline-none transition-all'
        : 'w-full text-left flex justify-between items-center rounded-xl px-4 py-3 text-sm outline-none transition-all border border-gray-300 bg-white hover:border-indigo-400 focus:ring-2 focus:ring-indigo-300';

    const triggerStyle: React.CSSProperties = dark
        ? (open ? TRIGGER_DARK_OPEN : TRIGGER_DARK)
        : {};

    const triggerTextColor = dark
        ? (selected ? '#fff' : 'rgba(255,255,255,0.3)')
        : (selected ? '#111827' : '#9ca3af');

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger */}
            <button
                type="button"
                onClick={openDropdown}
                className={triggerClass}
                style={triggerStyle}
            >
                <span className="text-sm truncate" style={{ color: triggerTextColor }}>
                    {selected ? selected.name : 'Select category…'}
                </span>
                <svg
                    className="h-4 w-4 shrink-0 ml-2"
                    fill="none" viewBox="0 0 24 24"
                    stroke="currentColor" strokeWidth={2}
                    style={{
                        color: dark ? 'rgba(255,255,255,0.3)' : '#9ca3af',
                        ...(open ? CHEVRON_OPEN : CHEVRON_CLOSE),
                    }}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Hidden input for FormData / native required validation */}
            <input type="hidden" name={name} value={value ?? ''} required={required} />

            {/* Dropdown panel */}
            {open && (
                <div
                    className="absolute z-30 w-full mt-1 rounded-xl overflow-hidden"
                    style={dark ? PANEL_DARK : PANEL_LIGHT}
                >
                    {/* Search */}
                    <div className="p-2" style={dark ? SEARCH_BORDER_DARK : SEARCH_BORDER_LIGHT}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search…"
                            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                            style={dark ? SEARCH_DARK : { border: '1px solid #e5e7eb' }}
                        />
                    </div>

                    {/* Options */}
                    <ul className="max-h-48 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <li
                                className="p-3 text-sm text-center"
                                style={{ color: dark ? 'rgba(255,255,255,0.3)' : '#9ca3af' }}
                            >
                                No categories found
                            </li>
                        ) : (
                            filtered.map(cat => {
                                const isSelected = cat.id === value;
                                return (
                                    <li
                                        key={cat.id}
                                        onClick={() => selectCategory(cat)}
                                        className="px-4 py-2.5 text-sm cursor-pointer transition-colors"
                                        style={isSelected
                                            ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontWeight: 700 }
                                            : { color: dark ? 'rgba(255,255,255,0.7)' : '#374151' }
                                        }
                                        onMouseEnter={e => {
                                            if (!isSelected) (e.currentTarget as HTMLLIElement).style.background =
                                                dark ? 'rgba(255,255,255,0.06)' : '#f5f3ff';
                                        }}
                                        onMouseLeave={e => {
                                            if (!isSelected) (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                                        }}
                                    >
                                        {cat.name}
                                    </li>
                                );
                            })
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
