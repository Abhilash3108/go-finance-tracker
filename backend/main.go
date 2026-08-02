package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	// "time"

	_ "github.com/lib/pq"
)

// --- Struct Definitions ---
type Category struct{ ID int `json:"id"`; Name string `json:"name"` }
type Expense struct{ ID int `json:"id"`; Amount float64 `json:"amount"`; Description string `json:"description"`; CategoryID int `json:"categoryId"`; CategoryName string `json:"categoryName,omitempty"`; CreatedAt string `json:"createdAt,omitempty"` }
type MonthlySummary struct{ Month string `json:"month"`; TotalAmount float64 `json:"totalAmount"` }
type CategoryTotal struct{ CategoryName string `json:"categoryName"`; TotalAmount float64 `json:"totalAmount"` }
type Result struct { 
    Year          int     `json:"year"`
    CategoryName  string  `json:"categoryName"` 
    TotalAmount   float64 `json:"totalAmount"` 
    Percentage    float64 `json:"percentage"` 
}

var db *sql.DB

// --- API Router ---
func main() {
	initDB()
	mux := http.NewServeMux()

	// Registering endpoints
	mux.HandleFunc("/api/categories", handleCategories)
	mux.HandleFunc("/api/categories/delete", deleteCategory)
	mux.HandleFunc("/api/expenses", handleExpenses)
	mux.HandleFunc("/api/expenses/delete", deleteExpense)
	mux.HandleFunc("/api/expenses/total", getTotalExpenses)
	mux.HandleFunc("/api/expenses/monthly", getMonthlySummary)
	mux.HandleFunc("/api/expenses/category-totals", getCategoryTotals)
	mux.HandleFunc("/api/expenses/category-percentage", getCategoryPercentage)

	log.Println("🚀 Finance API Server running on port 8080...")
	log.Fatal(http.ListenAndServe(":8080", mux))
}

// --- Helper: Centralized Filter Builder ---
// Returns a WHERE clause (e.g. " WHERE EXTRACT(YEAR FROM created_at) = $1") and arguments.
func buildFilter(r *http.Request, alias string) (string, []interface{}) {
	years := r.URL.Query()["year"]
	month := r.URL.Query().Get("month")
	var conditions []string
	var args []interface{}
	
	prefix := ""
	if alias != "" { prefix = alias + "." }

	if len(years) > 0 {
		var placeholders []string
		for _, y := range years {
			args = append(args, y)
			placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)))
		}
		conditions = append(conditions, fmt.Sprintf("EXTRACT(YEAR FROM %screated_at) IN (%s)", prefix, strings.Join(placeholders, ",")))
	}
	if month != "" {
		args = append(args, month)
		conditions = append(conditions, fmt.Sprintf("EXTRACT(MONTH FROM %screated_at) = $%d", prefix, len(args)))
	}

	if len(conditions) == 0 { return "", nil }
	return " WHERE " + strings.Join(conditions, " AND "), args
}

// --- Handlers: Categories ---
func getCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, name FROM categories ORDER BY name")
	if err != nil { http.Error(w, err.Error(), 500); return }
	defer rows.Close()
	var cats []Category = []Category{}
	for rows.Next() {
		var c Category
		rows.Scan(&c.ID, &c.Name)
		cats = append(cats, c)
	}
	jsonResponse(w, cats, http.StatusOK)
}

func createCategory(w http.ResponseWriter, r *http.Request) {
	var cat Category
	json.NewDecoder(r.Body).Decode(&cat)
	err := db.QueryRow("INSERT INTO categories (name) VALUES ($1) RETURNING id", cat.Name).Scan(&cat.ID)
	if err != nil { http.Error(w, "Failed to create category", 500); return }
	jsonResponse(w, cat, http.StatusCreated)
}

// --- Handlers: Expenses ---
func getExpenses(w http.ResponseWriter, r *http.Request) {
	where, args := buildFilter(r, "e")
	query := fmt.Sprintf("SELECT e.id, e.amount, e.description, e.category_id, c.name, e.created_at FROM expenses e JOIN categories c ON e.category_id = c.id %s ORDER BY e.created_at DESC", where)
	rows, err := db.Query(query, args...)
	if err != nil { http.Error(w, err.Error(), 500); return }
	defer rows.Close()

	res := []Expense{}
	for rows.Next() {
		var e Expense
		rows.Scan(&e.ID, &e.Amount, &e.Description, &e.CategoryID, &e.CategoryName, &e.CreatedAt)
		res = append(res, e)
	}
	jsonResponse(w, res, http.StatusOK)
}

func createExpense(w http.ResponseWriter, r *http.Request) {
	var exp Expense
	json.NewDecoder(r.Body).Decode(&exp)
	err := db.QueryRow("INSERT INTO expenses (amount, description, category_id) VALUES ($1, $2, $3) RETURNING id", exp.Amount, exp.Description, exp.CategoryID).Scan(&exp.ID)
	if err != nil { http.Error(w, "Failed to save expense", 500); return }
	jsonResponse(w, exp, http.StatusCreated)
}

// --- Handlers: Reports & Deletion ---
func deleteExpense(w http.ResponseWriter, r *http.Request) {
	db.Exec("DELETE FROM expenses WHERE id = $1", r.URL.Query().Get("id"))
	w.WriteHeader(http.StatusNoContent)
}

func deleteCategory(w http.ResponseWriter, r *http.Request) {
	db.Exec("DELETE FROM categories WHERE id = $1", r.URL.Query().Get("id"))
	w.WriteHeader(http.StatusNoContent)
}

func getMonthlySummary(w http.ResponseWriter, r *http.Request) {
	rows, _ := db.Query("SELECT date_trunc('month', created_at)::date AS month, SUM(amount) AS total FROM expenses GROUP BY month ORDER BY month DESC")
	defer rows.Close()
	var sums []MonthlySummary = []MonthlySummary{}
	for rows.Next() {
		var s MonthlySummary
		rows.Scan(&s.Month, &s.TotalAmount)
		sums = append(sums, s)
	}
	jsonResponse(w, sums, http.StatusOK)
}

func getTotalExpenses(w http.ResponseWriter, r *http.Request) {
	var total float64
	db.QueryRow("SELECT COALESCE(SUM(amount), 0) FROM expenses").Scan(&total)
	jsonResponse(w, map[string]float64{"total": total}, http.StatusOK)
}

func getCategoryTotals(w http.ResponseWriter, r *http.Request) {
	rows, _ := db.Query("SELECT c.name, SUM(e.amount) as total FROM expenses e JOIN categories c ON e.category_id = c.id GROUP BY c.name")
	defer rows.Close()
	var res []CategoryTotal = []CategoryTotal{}
	for rows.Next() {
		var s CategoryTotal
		rows.Scan(&s.CategoryName, &s.TotalAmount)
		res = append(res, s)
	}
	jsonResponse(w, res, http.StatusOK)
}

func getCategoryPercentage(w http.ResponseWriter, r *http.Request) {
	where, args := buildFilter(r, "e")
	query := fmt.Sprintf(`
		WITH FilteredExpenses AS (
			SELECT amount, category_id, EXTRACT(YEAR FROM created_at)::int as yr 
			FROM expenses e %s
		),
		YearlyTotals AS (
			SELECT yr, SUM(amount) as total FROM FilteredExpenses GROUP BY yr
		)
		SELECT fe.yr, c.name, SUM(fe.amount), (SUM(fe.amount) / NULLIF((SELECT total FROM YearlyTotals yt WHERE yt.yr = fe.yr), 0)) * 100 
		FROM FilteredExpenses fe
		JOIN categories c ON fe.category_id = c.id
		GROUP BY fe.yr, c.name`, where)

	rows, err := db.Query(query, append(args, args...)...)
	if err != nil { http.Error(w, err.Error(), 500); return }
	defer rows.Close()

	res := []Result{}
	for rows.Next() {
		var s Result
		rows.Scan(&s.Year, &s.CategoryName, &s.TotalAmount, &s.Percentage)
		res = append(res, s)
	}
	jsonResponse(w, res, http.StatusOK)
}

// --- Utils ---
func jsonResponse(w http.ResponseWriter, data interface{}, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(data)
}

func initDB() {
    dbURL := os.Getenv("DB_URL")
    if dbURL == "" { dbURL = "postgres://postgres:supersecretpassword@db:5432/financedb?sslmode=disable" }
    
    var err error
    // Use the global 'db' directly, do NOT use 'db :='
    db, err = sql.Open("postgres", dbURL) 
    
    if err != nil || db.Ping() != nil {
        log.Fatal("Database connection failed: ", err)
    }
    log.Println("Database Connected")
}

func handleCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" { getCategories(w, r) } else { createCategory(w, r) }
}
func handleExpenses(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" { getExpenses(w, r) } else { createExpense(w, r) }
}