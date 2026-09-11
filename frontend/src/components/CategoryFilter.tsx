// Reusable searchable category filter dropdown.
// Unlike CategoryDropdown (which selects a category id for form submission),
// this works by category name and includes an "All" option.
// Used by DashboardView and ExpenseViewer filter bar.

import { useState, useRef, useEffect } from 'react';
import type { Category } from '../types';

export interface CategoryFilterProps {
    categories:  Category[];
    value:       string;          // selected category name, or 'all'
    onChange:    (value: string) => void;
    allLabel?:   string;          // label for the "show all" option (default: "All Categories")
}

export default function CategoryFilter({
    categories,
    value,
    onChange,
    allLabel = 'All Categories',
}: CategoryFilterProps) {
    const [open,  setOpen]  = useState(false);
    const [query, setQuery] = useState('');
    const containerRef      = useRef<HTMLDivElement>(null);
    const inputRef          = useRef<HTMLInputElement>(null);

    const selectedLabel = value === 'all'
        ? allLabel
        : (categories.find(c => c.name === value)?.name ?? allLabel);

    const filtered = query.trim() === ''
        ? categories
        : categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
                setQuery('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const openDropdown = () => {
        setOpen(true);
        setQuery('');
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    const select = (val: string) => {
        onChange(val);
        setOpen(false);
        setQuery('');
    };

    return (
        <div ref={containerRef} className="relative w-full max-w-xs">
            {/* Trigger */}
            <button
                type="button"
                onClick={openDropdown}
                className="w-full border border-gray-300 p-2 rounded-lg bg-white text-left flex justify-between items-center
                           hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
                <span className="text-sm text-gray-700">{selectedLabel}</span>
                <span className="text-gray-400 text-xs ml-2">{open ? '▲' : '▼'}</span>
            </button>

            {open && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    {/* Search */}
                    <div className="p-2 border-b border-gray-100">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setQuery(''); } }}
                            placeholder="Search categories…"
                            className="w-full border border-gray-200 p-2 rounded-md text-sm
                                       focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    {/* Options */}
                    <ul className="max-h-48 overflow-y-auto">
                        {/* "All" option — only shown when not searching */}
                        {query.trim() === '' && (
                            <li
                                onClick={() => select('all')}
                                className={`px-4 py-2 text-sm cursor-pointer hover:bg-indigo-50 hover:text-indigo-700
                                    ${value === 'all' ? 'bg-indigo-100 font-bold text-indigo-700' : 'text-gray-700'}`}
                            >
                                {allLabel}
                            </li>
                        )}
                        {filtered.length === 0 ? (
                            <li className="p-3 text-sm text-gray-400 text-center">No categories found</li>
                        ) : (
                            filtered.map(cat => (
                                <li
                                    key={cat.id}
                                    onClick={() => select(cat.name)}
                                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-indigo-50 hover:text-indigo-700
                                        ${cat.name === value ? 'bg-indigo-100 font-bold text-indigo-700' : 'text-gray-700'}`}
                                >
                                    {cat.name}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
