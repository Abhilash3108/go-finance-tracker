package main

import (
	"log"
	"net/http"
)

func main() {
	// Load required config from environment.
	dbURL         := mustEnv("DB_URL")
	jwtSecret      = []byte(mustEnv("JWT_SECRET"))
	allowedOrigin   = mustEnv("ALLOWED_ORIGIN")

	// Connect to Postgres and run pending migrations.
	initDB(dbURL)

	// ---------------------------------------------------------------------------
	// Routes
	// ---------------------------------------------------------------------------
	mux := http.NewServeMux()

	// Auth — public endpoints.
	mux.HandleFunc("/api/auth/register", handleRegister)
	mux.HandleFunc("/api/auth/login",    handleLogin)
	mux.HandleFunc("/api/auth/refresh",  handleRefresh)
	mux.HandleFunc("/api/auth/logout",   handleLogout)

	// auth wraps a handler with authMiddleware.
	auth := func(h http.HandlerFunc) http.Handler { return authMiddleware(h) }

	// Data — protected endpoints.
	mux.Handle("/api/categories",                     auth(handleCategories))
	mux.Handle("/api/categories/delete",              auth(deleteCategory))
	mux.Handle("/api/expenses",                       auth(handleExpenses))
	mux.Handle("/api/expenses/delete",                auth(deleteExpense))
	mux.Handle("/api/expenses/category-percentage",   auth(getCategoryPercentage))
	mux.Handle("/api/reports/monthly",                auth(getMonthlySummary))
	mux.Handle("/api/reports/total",                  auth(getTotalExpenses))
	mux.Handle("/api/reports/category-totals",        auth(getCategoryTotals))

	// Apply CORS globally.
	handler := corsMiddleware(mux)

	log.Println("🚀 Backend listening on :8080")
	if err := http.ListenAndServe(":8080", handler); err != nil {
		log.Fatal("Server error: ", err)
	}
}
