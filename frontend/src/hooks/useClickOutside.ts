import { useEffect, RefObject } from 'react';

/**
 * Calls `callback` whenever a mousedown event fires outside `ref`.
 * The listener is attached once on mount and removed on unmount.
 */
export function useClickOutside(ref: RefObject<HTMLElement>, callback: () => void): void {
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                callback();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [ref, callback]);
}
