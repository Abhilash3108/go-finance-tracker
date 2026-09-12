// Reusable tri-state "select all" checkbox.
// Renders checked when all items are selected, indeterminate when some are,
// and unchecked when none are.
// Single Responsibility: only handles the tri-state visual + click dispatch.

import { useEffect, useRef } from 'react';

interface Props {
    totalCount:    number;   // total selectable items
    selectedCount: number;   // how many are currently selected
    onSelectAll:   () => void;
    onDeselectAll: () => void;
    disabled?:     boolean;
}

export default function SelectAllCheckbox({
    totalCount,
    selectedCount,
    onSelectAll,
    onDeselectAll,
    disabled = false,
}: Props) {
    const ref          = useRef<HTMLInputElement>(null);
    const isAll        = totalCount > 0 && selectedCount === totalCount;
    const isAny        = selectedCount > 0 && selectedCount < totalCount;

    // Set the native indeterminate property — not settable via JSX prop
    useEffect(() => {
        if (ref.current) ref.current.indeterminate = isAny;
    }, [isAny]);

    const handleChange = () => {
        if (isAll) onDeselectAll();
        else       onSelectAll();
    };

    return (
        <input
            ref={ref}
            type="checkbox"
            checked={isAll}
            onChange={handleChange}
            disabled={disabled || totalCount === 0}
            className="w-4 h-4 accent-indigo-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={isAll ? 'Deselect all' : 'Select all'}
        />
    );
}
