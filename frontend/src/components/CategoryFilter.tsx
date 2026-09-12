// Reusable searchable category filter dropdown.
// Works by category name; includes an "All" option.
// Used by DashboardView and ExpenseViewer.
//
// Props:
//   dark     — dark-themed panel (default false)
//   compact  — minimal text+chevron trigger for use in table headers (default false)
//              In compact mode the panel is right-anchored to avoid viewport clipping.

import { useState, useRef, useMemo, useCallback } from 'react';
import type { Category } from '../types';
import { useClickOutside } from '../hooks/useClickOutside';

export interface CategoryFilterProps {
    categories: Category[];
    value:      string;
    onChange:   (value: string) => void;
    allLabel?:  string;
    dark?:      boolean;
    compact?:   boolean;
}

// ---------------------------------------------------------------------------
// Static style constants
// ---------------------------------------------------------------------------

const TRIGGER_DARK: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
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
const DIVIDER_DARK:  React.CSSProperties = { borderBottom: '1px solid rgba(255,255,255,0.07)' };
const DIVIDER_LIGHT: React.CSSProperties = { borderBottom: '1px solid #f3f4f6' };
const CHEVRON_OPEN:  React.CSSProperties = { transition: 'transform 0.2s', transform: 'rotate(180deg)' };
const CHEVRON_CLOSE: React.CSSProperties = { transition: 'transform 0.2s' };

// ---------------------------------------------------------------------------
// Chevron SVG — shared between both trigger variants
// ---------------------------------------------------------------------------

function Chevron({ open, dark, small }: { open: boolean; dark: boolean; small?: boolean }) {
    return (
        <svg
            className={small ? 'h-3 w-3' : 'h-4 w-4'}
            fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={small ? 2.5 : 2}
            style={{
                color: dark ? 'rgba(255,255,255,0.3)' : '#9ca3af',
                ...(open ? CHEVRON_OPEN : CHEVRON_CLOSE),
            }}
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CategoryFilter({
    categories,
    value,
    onChange,
    allLabel = 'All Categories',
    dark     = false,
    compact  = false,
}: CategoryFilterProps) {
    const [open,  setOpen]  = useState(false);
    const [query, setQuery] = useState('');
    const containerRef      = useRef<HTMLDivElement>(null);
    const inputRef          = useRef<HTMLInputElement>(null);

    const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
    useClickOutside(containerRef, close);

    const selectedLabel = useMemo(() =>
        value === 'all' ? allLabel : (categories.find(c => c.name === value)?.name ?? allLabel),
    [value, allLabel, categories]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q === '' ? categories : categories.filter(c => c.name.toLowerCase().includes(q));
    }, [categories, query]);

    const openDropdown = useCallback(() => {
        setOpen(true);
        setQuery('');
        setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    const select = useCallback((val: string) => {
        onChange(val);
        setOpen(false);
        setQuery('');
    }, [onChange]);

    // Panel is right-anchored in compact mode (table header) to avoid viewport clipping
    const panelPositionStyle: React.CSSProperties = compact
        ? { right: 0, left: 'auto', minWidth: '180px' }
        : { left: 0,  minWidth: '180px' };

    const panelStyle: React.CSSProperties = {
        ...panelPositionStyle,
        ...(dark ? PANEL_DARK : PANEL_LIGHT),
    };

    return (
        <div ref={containerRef} className="relative">

            {/* ---- Compact trigger (table header) ---- */}
            {compact ? (
                <button
                    type="button"
                    onClick={openDropdown}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors"
                    style={{ color: value !== 'all' ? '#a5b4fc' : 'rgba(255,255,255,0.35)' }}
                >
                    {selectedLabel}
                    <Chevron open={open} dark small />
                </button>
            ) : (
            /* ---- Full trigger ---- */
                <button
                    type="button"
                    onClick={openDropdown}
                    className={
                        dark
                            ? 'w-full text-left flex justify-between items-center rounded-xl px-4 py-2.5 text-sm outline-none transition-all'
                            : 'w-full text-left flex justify-between items-center rounded-xl px-4 py-2.5 text-sm outline-none transition-all border border-gray-300 bg-white hover:border-indigo-400 focus:ring-2 focus:ring-indigo-300'
                    }
                    style={dark ? (open ? TRIGGER_DARK_OPEN : TRIGGER_DARK) : {}}
                >
                    <span
                        className="truncate"
                        style={{ color: dark
                            ? (value !== 'all' ? '#a5b4fc' : 'rgba(255,255,255,0.5)')
                            : '#374151'
                        }}
                    >
                        {selectedLabel}
                    </span>
                    <Chevron open={open} dark={dark} />
                </button>
            )}

            {/* ---- Dropdown panel ---- */}
            {open && (
                <div className="absolute z-30 mt-1 rounded-xl overflow-hidden" style={panelStyle}>

                    {/* Search */}
                    <div className="p-2" style={dark ? DIVIDER_DARK : DIVIDER_LIGHT}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') close(); }}
                            placeholder="Search…"
                            className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                            style={dark ? SEARCH_DARK : { border: '1px solid #e5e7eb' }}
                        />
                    </div>

                    {/* Options */}
                    <ul className="max-h-48 overflow-y-auto">
                        {/* "All" option — only when not actively searching */}
                        {query.trim() === '' && (
                            <li
                                onClick={() => select('all')}
                                className="px-4 py-2.5 text-sm cursor-pointer transition-colors"
                                style={value === 'all'
                                    ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontWeight: 700 }
                                    : { color: dark ? 'rgba(255,255,255,0.7)' : '#374151' }
                                }
                                onMouseEnter={e => {
                                    if (value !== 'all') (e.currentTarget as HTMLLIElement).style.background =
                                        dark ? 'rgba(255,255,255,0.06)' : '#f5f3ff';
                                }}
                                onMouseLeave={e => {
                                    if (value !== 'all') (e.currentTarget as HTMLLIElement).style.background = 'transparent';
                                }}
                            >
                                {allLabel}
                            </li>
                        )}

                        {filtered.length === 0 ? (
                            <li
                                className="p-3 text-sm text-center"
                                style={{ color: dark ? 'rgba(255,255,255,0.3)' : '#9ca3af' }}
                            >
                                No categories found
                            </li>
                        ) : (
                            filtered.map(cat => {
                                const isSelected = cat.name === value;
                                return (
                                    <li
                                        key={cat.id}
                                        onClick={() => select(cat.name)}
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
