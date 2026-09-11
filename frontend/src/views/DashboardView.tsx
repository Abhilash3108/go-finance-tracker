import { useState } from 'react';
import type { Category, CategoryPercentage } from '../types';
import CategoryFilter from '../components/CategoryFilter';

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
                <CategoryFilter
                    categories={categories}
                    value={filter}
                    onChange={setFilter}
                />
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-indigo-600 text-white p-8 rounded-2xl shadow-lg">
                    <p className="text-indigo-200">Total Spent</p>
                    <h3 className="text-5xl font-black">₹{total.toFixed(2)}</h3>
                </div>

                <div className="p-6 border rounded-xl bg-gray-50">
                    <h3 className="font-bold mb-4 text-gray-800">Category Breakdown</h3>
                    {displayed.map(c => (
                        <div key={c.categoryName} className="flex justify-between py-3 border-b border-gray-200">
                            <span className="text-gray-600 font-medium">{c.categoryName}</span>
                            <div className="text-right">
                                <span className="block font-bold text-gray-900">₹{c.totalAmount.toFixed(2)}</span>
                                <span className="text-xs text-indigo-500 font-bold">{c.percentage.toFixed(1)}% of total</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
