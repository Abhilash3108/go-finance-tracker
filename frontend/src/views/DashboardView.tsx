import { useState } from 'react';
import type { Category, CategoryPercentage } from '../types';

interface Props {
    categories: Category[];
    categoryPercentData: CategoryPercentage[];
}

export default function DashboardView({ categories, categoryPercentData }: Props) {
    const [filter, setFilter] = useState('all');

    const displayed = filter === 'all'
        ? categoryPercentData
        : categoryPercentData.filter(d => d.categoryName === filter);

    const total = displayed.reduce((sum, d) => sum + d.totalAmount, 0);

    return (
        <div>
            <div className="mb-8">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                    Filter Analysis by Category
                </label>
                <select value={filter} onChange={e => setFilter(e.target.value)}
                    className="border p-2 rounded-lg w-full max-w-xs">
                    <option value="all">All Categories</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-indigo-600 text-white p-8 rounded-2xl shadow-lg">
                    <p className="text-indigo-200">Total Spent</p>
                    <h3 className="text-5xl font-black">${total.toFixed(2)}</h3>
                </div>

                <div className="p-6 border rounded-xl bg-gray-50">
                    <h3 className="font-bold mb-4 text-gray-800">Category Breakdown</h3>
                    {displayed.map(c => (
                        <div key={c.categoryName} className="flex justify-between py-3 border-b border-gray-200">
                            <span className="text-gray-600 font-medium">{c.categoryName}</span>
                            <div className="text-right">
                                <span className="block font-bold text-gray-900">${c.totalAmount.toFixed(2)}</span>
                                <span className="text-xs text-indigo-500 font-bold">{c.percentage.toFixed(1)}% of total</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
