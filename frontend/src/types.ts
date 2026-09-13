// Shared TypeScript types used across the app.

export interface User { id: number; email: string; }
export interface Category { id: number; name: string; }
export interface Expense {
    id: number;
    amount: number;
    description: string;
    categoryId: number;
    categoryName?: string;
    createdAt?: string;
}
export interface CategoryPercentage {
    categoryName: string;
    totalAmount:  number;
    percentage:   number;
}

export interface MonthlySummary {
    month:       string;   // "YYYY-MM-DD" (first day of month from date_trunc)
    totalAmount: number;
}

export type TabName = 'add' | 'categories' | 'viewer' | 'dashboard' | 'recurring';
export const TABS: TabName[] = ['dashboard', 'add', 'categories', 'viewer', 'recurring'];

// ---------------------------------------------------------------------------
// Action interfaces — typed contracts injected into views from Dashboard.
// Views depend on these shapes, never on the network layer directly.
// ---------------------------------------------------------------------------

export interface NewExpense {
    amount: number;
    description: string;
    categoryId: number;
}

/** Actions available to the AddExpense view. */
export interface ExpenseActions {
    addExpense: (payload: NewExpense) => Promise<boolean>;
}

/** Actions available to the Categories view. */
export interface CategoryActions {
    addCategory:      (name: string)                  => Promise<boolean>;
    updateCategory:   (id: number, name: string)      => Promise<boolean>;
    deleteCategories: (ids: number[])                 => Promise<void>;
}

export interface UpdateExpensePayload {
    amount: number;
    description: string;
    categoryId: number;
}

/** Actions available to the ExpenseViewer view. */
export interface ExpenseViewerActions {
    updateExpense:  (id: number, payload: UpdateExpensePayload) => Promise<boolean>;
    deleteExpenses: (ids: number[]) => Promise<void>;
}

export interface RecurringExpense {
    id:           number;
    amount:       number;
    description:  string;
    categoryId:   number;
    categoryName?: string;
}

export interface NewRecurringExpense {
    amount:      number;
    description: string;
    categoryId:  number;
}

export interface DumpResult {
    added:    number;
    warnings: number[]; // recurring IDs that already had an expense this month
}

/** Actions available to the RecurringView. */
export interface RecurringActions {
    addRecurring:    (payload: NewRecurringExpense)                    => Promise<boolean>;
    updateRecurring: (id: number, payload: NewRecurringExpense)        => Promise<boolean>;
    deleteRecurring: (ids: number[])                                   => Promise<void>;
    dumpRecurring:   (ids: number[], date: string) => Promise<DumpResult | null>;
}
