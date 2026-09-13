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
