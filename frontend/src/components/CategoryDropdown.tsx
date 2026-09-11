// Reusable searchable category dropdown — no external library.
// Used by AddExpense and ExpenseViewer (edit row).

import { useState, useRef, useEffect } from 'react';
import type { Category } from '../types';

export interface CategoryDropdownProps {
    categories: Category[];
    value:      number | null;   // selected category id; null = nothing selected
    onChange:   (id: number) => void;
    required?:  boolean;
    name?:      string;          // hidden input name for FormData (default: "categoryId")
}

export default function CategoryDropdown({
    categories,
    value,
    onChange,
    required,
    name = 'categoryId',
}: CategoryDropdownProps) {
    const [open,  setOpen]  = useState(false);
    const [query, setQuery] = useState('');
    const containerRef      = useRef<HTMLDivElement>(null);
    const inputRef          = useRef<HTMLInputElement>(null);

    const selected = categories.find(c => c.id === value) ?? null;

    const filtered = query.trim() === ''
        ? categories
        : categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));

    // Close when clicking outside
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

    const selectCategory = (cat: Category) => {
        onChange(cat.id);
        setOpen(false);
        setQuery('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    };

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger button */}
            <button
                type="button"
                onClick={openDropdown}
                className="w-full border border-gray-300 p-2 rounded-lg bg-white text-left flex justify-between items-center
                           hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
                <span className={selected ? 'text-gray-900 text-sm' : 'text-gray-400 text-sm'}>
                    {selected ? selected.name : 'Select Category'}
                </span>
                <span className="text-gray-400 text-xs ml-2">{open ? '▲' : '▼'}</span>
            </button>

            {/* Hidden input so FormData / native required validation works */}
            <input type="hidden" name={name} value={value ?? ''} required={required} />

            {open && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
                    {/* Search */}
                    <div className="p-2 border-b border-gray-100">
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Search categories…"
                            className="w-full border border-gray-200 p-2 rounded-md text-sm
                                       focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>

                    {/* Options */}
                    <ul className="max-h-48 overflow-y-auto">
                        {filtered.length === 0 ? (
                            <li className="p-3 text-sm text-gray-400 text-center">No categories found</li>
                        ) : (
                            filtered.map(cat => (
                                <li
                                    key={cat.id}
                                    onClick={() => selectCategory(cat)}
                                    className={`px-4 py-2 text-sm cursor-pointer hover:bg-indigo-50 hover:text-indigo-700
                                        ${cat.id === value
                                            ? 'bg-indigo-100 font-bold text-indigo-700'
                                            : 'text-gray-700'}`}
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
