package main

import (
	"database/sql"
	"time"
)

// ---------------------------------------------------------------------------
// Domain Models
// ---------------------------------------------------------------------------

type User struct {
	ID    int    `json:"id"`
	Email string `json:"email"`
}

type Category struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type Expense struct {
	ID           int     `json:"id"`
	Amount       float64 `json:"amount"`
	Description  string  `json:"description"`
	CategoryID   int     `json:"categoryId"`
	CategoryName string  `json:"categoryName,omitempty"`
	CreatedAt    string  `json:"createdAt,omitempty"`
}

type MonthlySummary struct {
	Month       string  `json:"month"`
	TotalAmount float64 `json:"totalAmount"`
}

type RecurringExpense struct {
	ID           int     `json:"id"`
	Amount       float64 `json:"amount"`
	Description  string  `json:"description"`
	CategoryID   int     `json:"categoryId"`
	CategoryName string  `json:"categoryName,omitempty"`
}

// DumpResult is returned by POST /api/recurring/dump.
// Warnings lists recurring item IDs that were already dumped this calendar month.
type DumpResult struct {
	Added    int   `json:"added"`
	Warnings []int `json:"warnings"` // IDs of items that already had an expense this month
}

// RecurringSummary is returned by GET /api/recurring/summary.
type RecurringSummary struct {
	Count int     `json:"count"`
	Total float64 `json:"total"`
}

// CategoryMonthly is one month's total for a single category.
type CategoryMonthly struct {
	Month string  `json:"month"` // "YYYY-MM-DD" first day of month
	Total float64 `json:"total"`
}

// CategoryBreakdown is returned per selected category by
// GET /api/reports/category-breakdown.
type CategoryBreakdown struct {
	CategoryID   int               `json:"categoryId"`
	CategoryName string            `json:"categoryName"`
	AllTimeTotal float64           `json:"allTimeTotal"`
	Monthly      []CategoryMonthly `json:"monthly"`
}

// SpendingGroup is a named set of category IDs saved by the user.
type SpendingGroup struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	CategoryIDs []int  `json:"categoryIds"`
}

type Result struct {
	Year         int     `json:"year"`
	CategoryName string  `json:"categoryName"`
	TotalAmount  float64 `json:"totalAmount"`
	Percentage   float64 `json:"percentage"`
}

// ---------------------------------------------------------------------------
// Context Key
// ---------------------------------------------------------------------------

// contextKey avoids collisions with other packages storing values in context.
type contextKey string

const contextUserID contextKey = "userID"

// ---------------------------------------------------------------------------
// Token Lifetimes
// ---------------------------------------------------------------------------

const (
	accessTokenTTL  = 15 * time.Minute
	refreshTokenTTL = 7 * 24 * time.Hour
)

// ---------------------------------------------------------------------------
// Global State
// ---------------------------------------------------------------------------

var (
	db            *sql.DB
	jwtSecret     []byte
	allowedOrigin string
)
