package main

import (
	"database/sql/driver"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Helper: Filter Builder
// ---------------------------------------------------------------------------

// buildFilter builds an optional AND clause for year/month query parameters.
// startIdx is the next $N placeholder index (caller already used 1..startIdx-1).
func buildFilter(r *http.Request, alias string, startIdx int) (string, []interface{}) {
	years := r.URL.Query()["year"]
	month := r.URL.Query().Get("month")
	var conditions []string
	var args       []interface{}

	prefix := ""
	if alias != "" {
		prefix = alias + "."
	}

	idx := startIdx
	if len(years) > 0 {
		var placeholders []string
		for _, y := range years {
			args = append(args, y)
			placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
			idx++
		}
		conditions = append(conditions, fmt.Sprintf(
			"EXTRACT(YEAR FROM %screated_at) IN (%s)",
			prefix, strings.Join(placeholders, ","),
		))
	}
	if month != "" {
		args = append(args, month)
		conditions = append(conditions, fmt.Sprintf(
			"EXTRACT(MONTH FROM %screated_at) = $%d", prefix, idx,
		))
	}
	if len(conditions) == 0 {
		return "", nil
	}
	return " AND " + strings.Join(conditions, " AND "), args
}

// ---------------------------------------------------------------------------
// Handlers: Categories
// ---------------------------------------------------------------------------

func getCategories(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	rows, err := db.Query(
		"SELECT id, name FROM categories WHERE user_id = $1 ORDER BY name", userID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	cats := []Category{}
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			http.Error(w, "Failed to read category row", http.StatusInternalServerError)
			return
		}
		cats = append(cats, c)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, cats, http.StatusOK)
}

func createCategory(w http.ResponseWriter, r *http.Request) {
	http.MaxBytesReader(w, r.Body, 1<<20)
	var cat Category
	if err := json.NewDecoder(r.Body).Decode(&cat); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	cat.Name = strings.TrimSpace(cat.Name)
	if cat.Name == "" {
		http.Error(w, "Category name is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	err := db.QueryRow(
		"INSERT INTO categories (name, user_id) VALUES ($1, $2) RETURNING id",
		cat.Name, userID,
	).Scan(&cat.ID)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			http.Error(w, "Category name already exists", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to create category", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, cat, http.StatusCreated)
}

// ---------------------------------------------------------------------------
// Handlers: Expenses
// ---------------------------------------------------------------------------

func getExpenses(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	filterClause, filterArgs := buildFilter(r, "e", 2)
	args := append([]interface{}{userID}, filterArgs...)

	query := fmt.Sprintf(
		"SELECT e.id, e.amount, e.description, e.category_id, c.name, e.created_at"+
			" FROM expenses e JOIN categories c ON e.category_id = c.id"+
			" WHERE e.user_id = $1%s ORDER BY e.created_at DESC",
		filterClause,
	)
	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	res := []Expense{}
	for rows.Next() {
		var e Expense
		if err := rows.Scan(&e.ID, &e.Amount, &e.Description, &e.CategoryID, &e.CategoryName, &e.CreatedAt); err != nil {
			http.Error(w, "Failed to read expense row", http.StatusInternalServerError)
			return
		}
		res = append(res, e)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, res, http.StatusOK)
}

func createExpense(w http.ResponseWriter, r *http.Request) {
	http.MaxBytesReader(w, r.Body, 1<<20)
	var exp Expense
	if err := json.NewDecoder(r.Body).Decode(&exp); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if exp.Amount <= 0 {
		http.Error(w, "Amount must be greater than zero", http.StatusBadRequest)
		return
	}
	if exp.CategoryID == 0 {
		http.Error(w, "CategoryID is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	err := db.QueryRow(
		"INSERT INTO expenses (amount, description, category_id, user_id) VALUES ($1, $2, $3, $4) RETURNING id",
		exp.Amount, exp.Description, exp.CategoryID, userID,
	).Scan(&exp.ID)
	if err != nil {
		http.Error(w, "Failed to save expense", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, exp, http.StatusCreated)
}

func updateExpense(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id query parameter is required", http.StatusBadRequest)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)
	var payload struct {
		Amount      float64 `json:"amount"`
		Description string  `json:"description"`
		CategoryID  int     `json:"categoryId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if payload.Amount <= 0 {
		http.Error(w, "Amount must be greater than zero", http.StatusBadRequest)
		return
	}
	if payload.CategoryID == 0 {
		http.Error(w, "CategoryID is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	var exp Expense
	err := db.QueryRow(
		`UPDATE expenses
		    SET amount = $1, description = $2, category_id = $3
		  WHERE id = $4 AND user_id = $5
		  RETURNING id, amount, description, category_id`,
		payload.Amount, payload.Description, payload.CategoryID, id, userID,
	).Scan(&exp.ID, &exp.Amount, &exp.Description, &exp.CategoryID)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			http.Error(w, "Expense not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update expense", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, exp, http.StatusOK)
}

// ---------------------------------------------------------------------------
// Handlers: Deletion
// ---------------------------------------------------------------------------

// deleteExpense deletes one or more expenses in a single query.
// Accepts ?id=1&id=2&id=3 — all IDs must belong to the authenticated user.
func deleteExpense(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	ids := r.URL.Query()["id"]
	if len(ids) == 0 {
		http.Error(w, "at least one id is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)

	// Convert string ids to ints for the ANY($1) array parameter.
	intIDs, err := parseIntIDs(ids)
	if err != nil {
		http.Error(w, "invalid id value", http.StatusBadRequest)
		return
	}
	if _, err := db.Exec(
		"DELETE FROM expenses WHERE id = ANY($1) AND user_id = $2",
		intIDs, userID,
	); err != nil {
		http.Error(w, "Failed to delete expenses", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deleteCategory deletes one or more categories in a single query.
// Accepts ?id=1&id=2&id=3 — all IDs must belong to the authenticated user.
func deleteCategory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	ids := r.URL.Query()["id"]
	if len(ids) == 0 {
		http.Error(w, "at least one id is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)

	intIDs, err := parseIntIDs(ids)
	if err != nil {
		http.Error(w, "invalid id value", http.StatusBadRequest)
		return
	}
	_, err = db.Exec(
		"DELETE FROM categories WHERE id = ANY($1) AND user_id = $2",
		intIDs, userID,
	)
	if err != nil {
		if strings.Contains(err.Error(), "foreign key") || strings.Contains(err.Error(), "violates") {
			http.Error(w, "Cannot delete category with existing expenses", http.StatusConflict)
			return
		}
		http.Error(w, "Failed to delete categories", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---------------------------------------------------------------------------
// Handlers: Reports
// ---------------------------------------------------------------------------

func getMonthlySummary(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	filterClause, filterArgs := buildFilter(r, "e", 2)
	args := append([]interface{}{userID}, filterArgs...)

	query := fmt.Sprintf(
		"SELECT date_trunc('month', e.created_at)::date AS month, SUM(e.amount) AS total"+
			" FROM expenses e WHERE e.user_id = $1%s GROUP BY month ORDER BY month ASC",
		filterClause,
	)
	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	sums := []MonthlySummary{}
	for rows.Next() {
		var s MonthlySummary
		if err := rows.Scan(&s.Month, &s.TotalAmount); err != nil {
			http.Error(w, "Failed to read summary row", http.StatusInternalServerError)
			return
		}
		sums = append(sums, s)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, sums, http.StatusOK)
}

func getCategoryPercentage(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	filterClause, filterArgs := buildFilter(r, "e", 2)
	args := append([]interface{}{userID}, filterArgs...)

	query := fmt.Sprintf(`
		WITH FilteredExpenses AS (
			SELECT amount, category_id, EXTRACT(YEAR FROM created_at)::int AS yr
			FROM expenses e
			WHERE e.user_id = $1%s
		),
		YearlyTotals AS (
			SELECT yr, SUM(amount) AS total FROM FilteredExpenses GROUP BY yr
		)
		SELECT
			fe.yr,
			c.name,
			SUM(fe.amount),
			(SUM(fe.amount) / NULLIF(yt.total, 0)) * 100
		FROM FilteredExpenses fe
		JOIN categories c    ON fe.category_id = c.id
		JOIN YearlyTotals yt ON yt.yr = fe.yr
		GROUP BY fe.yr, c.name, yt.total`, filterClause)

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	res := []Result{}
	for rows.Next() {
		var s Result
		if err := rows.Scan(&s.Year, &s.CategoryName, &s.TotalAmount, &s.Percentage); err != nil {
			http.Error(w, "Failed to read percentage row", http.StatusInternalServerError)
			return
		}
		res = append(res, s)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, res, http.StatusOK)
}

func updateCategory(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id query parameter is required", http.StatusBadRequest)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)
	var payload struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	payload.Name = strings.TrimSpace(payload.Name)
	if payload.Name == "" {
		http.Error(w, "Category name is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	var cat Category
	err := db.QueryRow(
		"UPDATE categories SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING id, name",
		payload.Name, id, userID,
	).Scan(&cat.ID, &cat.Name)
	if err != nil {
		if strings.Contains(err.Error(), "unique") || strings.Contains(err.Error(), "duplicate") {
			http.Error(w, "Category name already exists", http.StatusConflict)
			return
		}
		if strings.Contains(err.Error(), "no rows") {
			http.Error(w, "Category not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update category", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, cat, http.StatusOK)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// parseIntIDs converts a slice of string ids (from query params) into a
// pq-compatible int array usable with ANY($1). Returns an error if any
// value is not a valid positive integer.
func parseIntIDs(strs []string) (interface{}, error) {
	ids := make([]int64, 0, len(strs))
	for _, s := range strs {
		n, err := strconv.ParseInt(s, 10, 64)
		if err != nil || n <= 0 {
			return nil, fmt.Errorf("invalid id: %q", s)
		}
		ids = append(ids, n)
	}
	// pq driver supports []int64 directly for ANY($1)
	return pqArray(ids), nil
}

// pqArray wraps []int64 into a type the lib/pq driver can serialise as a
// Postgres integer array for use with ANY($1).
type pqInt64Array []int64

func pqArray(ids []int64) pqInt64Array { return pqInt64Array(ids) }

// Value implements driver.Valuer so pqInt64Array can be passed as a
// query argument to lib/pq, which serialises it as '{1,2,3}'.
func (a pqInt64Array) Value() (driver.Value, error) {
	if len(a) == 0 {
		return "{}", nil
	}
	b := make([]string, len(a))
	for i, v := range a {
		b[i] = strconv.FormatInt(v, 10)
	}
	return "{" + strings.Join(b, ",") + "}", nil
}

// ---------------------------------------------------------------------------
// Handlers: Recurring Expenses
// ---------------------------------------------------------------------------

// getRecurring returns all recurring expense templates for the authenticated user.
func getRecurring(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	rows, err := db.Query(
		`SELECT r.id, r.amount, r.description, r.category_id, c.name
		   FROM recurring_expenses r
		   JOIN categories c ON r.category_id = c.id
		  WHERE r.user_id = $1
		  ORDER BY r.id ASC`,
		userID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	res := []RecurringExpense{}
	for rows.Next() {
		var e RecurringExpense
		if err := rows.Scan(&e.ID, &e.Amount, &e.Description, &e.CategoryID, &e.CategoryName); err != nil {
			http.Error(w, "Failed to read recurring row", http.StatusInternalServerError)
			return
		}
		res = append(res, e)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, res, http.StatusOK)
}

// createRecurring adds a new recurring expense template.
func createRecurring(w http.ResponseWriter, r *http.Request) {
	http.MaxBytesReader(w, r.Body, 1<<20)
	var e RecurringExpense
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if e.Amount <= 0 {
		http.Error(w, "Amount must be greater than zero", http.StatusBadRequest)
		return
	}
	if e.CategoryID == 0 {
		http.Error(w, "CategoryID is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	err := db.QueryRow(
		`INSERT INTO recurring_expenses (amount, description, category_id, user_id)
		 VALUES ($1, $2, $3, $4) RETURNING id`,
		e.Amount, strings.TrimSpace(e.Description), e.CategoryID, userID,
	).Scan(&e.ID)
	if err != nil {
		http.Error(w, "Failed to create recurring expense", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, e, http.StatusCreated)
}

// updateRecurring updates amount, description, and category for one template.
func updateRecurring(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, "id query parameter is required", http.StatusBadRequest)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)
	var payload struct {
		Amount      float64 `json:"amount"`
		Description string  `json:"description"`
		CategoryID  int     `json:"categoryId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if payload.Amount <= 0 {
		http.Error(w, "Amount must be greater than zero", http.StatusBadRequest)
		return
	}
	if payload.CategoryID == 0 {
		http.Error(w, "CategoryID is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	var e RecurringExpense
	err := db.QueryRow(
		`UPDATE recurring_expenses
		    SET amount = $1, description = $2, category_id = $3
		  WHERE id = $4 AND user_id = $5
		  RETURNING id, amount, description, category_id`,
		payload.Amount, strings.TrimSpace(payload.Description), payload.CategoryID, id, userID,
	).Scan(&e.ID, &e.Amount, &e.Description, &e.CategoryID)
	if err != nil {
		if strings.Contains(err.Error(), "no rows") {
			http.Error(w, "Recurring expense not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to update recurring expense", http.StatusInternalServerError)
		return
	}
	jsonResponse(w, e, http.StatusOK)
}

// deleteRecurring deletes one or more recurring expense templates.
// Accepts ?id=1&id=2
func deleteRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	ids := r.URL.Query()["id"]
	if len(ids) == 0 {
		http.Error(w, "at least one id is required", http.StatusBadRequest)
		return
	}
	userID := userIDFromContext(r)
	intIDs, err := parseIntIDs(ids)
	if err != nil {
		http.Error(w, "invalid id value", http.StatusBadRequest)
		return
	}
	if _, err := db.Exec(
		"DELETE FROM recurring_expenses WHERE id = ANY($1) AND user_id = $2",
		intIDs, userID,
	); err != nil {
		http.Error(w, "Failed to delete recurring expenses", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// dumpRecurring inserts selected recurring templates as real expenses on a given date.
//
// Request body:
//
//	{ "ids": [1,2,3], "date": "2024-03-01" }
//
// For each ID it checks whether an expense with the same description + category_id
// already exists in the same calendar month. Matching IDs are returned in DumpResult.Warnings
// but are still inserted (warn-but-allow policy).
func dumpRecurring(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	http.MaxBytesReader(w, r.Body, 1<<20)

	var req struct {
		IDs  []int  `json:"ids"`
		Date string `json:"date"` // "YYYY-MM-DD"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if len(req.IDs) == 0 {
		http.Error(w, "ids must not be empty", http.StatusBadRequest)
		return
	}
	if _, err := time.Parse("2006-01-02", req.Date); err != nil {
		http.Error(w, "date must be YYYY-MM-DD", http.StatusBadRequest)
		return
	}

	userID := userIDFromContext(r)

	// Fetch the selected templates — verifying ownership in the same query.
	placeholders := make([]string, len(req.IDs))
	args := []interface{}{userID}
	for i, id := range req.IDs {
		args = append(args, id)
		placeholders[i] = fmt.Sprintf("$%d", i+2)
	}
	query := fmt.Sprintf(
		`SELECT id, amount, description, category_id
		   FROM recurring_expenses
		  WHERE user_id = $1 AND id IN (%s)`,
		strings.Join(placeholders, ","),
	)
	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to fetch recurring templates", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type template struct {
		id, categoryID int
		amount         float64
		description    string
	}
	var templates []template
	for rows.Next() {
		var t template
		if err := rows.Scan(&t.id, &t.amount, &t.description, &t.categoryID); err != nil {
			http.Error(w, "Failed to read template row", http.StatusInternalServerError)
			return
		}
		templates = append(templates, t)
	}
	if err := rows.Err(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Duplicate check: for each template, look for an existing expense with the
	// same description + category_id in the same calendar month as req.Date.
	warnings := []int{}
	for _, t := range templates {
		var count int
		err := db.QueryRow(
			`SELECT COUNT(*) FROM expenses
			  WHERE user_id      = $1
			    AND category_id  = $2
			    AND description  = $3
			    AND date_trunc('month', created_at) = date_trunc('month', $4::timestamptz)`,
			userID, t.categoryID, t.description, req.Date,
		).Scan(&count)
		if err != nil {
			http.Error(w, "Duplicate check failed", http.StatusInternalServerError)
			return
		}
		if count > 0 {
			warnings = append(warnings, t.id)
		}
	}

	// Insert all selected templates as real expenses (warn-but-allow).
	added := 0
	for _, t := range templates {
		_, err := db.Exec(
			`INSERT INTO expenses (amount, description, category_id, user_id, created_at)
			 VALUES ($1, $2, $3, $4, $5::timestamptz)`,
			t.amount, t.description, t.categoryID, userID, req.Date,
		)
		if err != nil {
			http.Error(w, "Failed to insert expense", http.StatusInternalServerError)
			return
		}
		added++
	}

	if warnings == nil {
		warnings = []int{} // always return array, never null
	}
	jsonResponse(w, DumpResult{Added: added, Warnings: warnings}, http.StatusOK)
}

// handleRecurring dispatches GET / POST / PUT on /api/recurring.
func handleRecurring(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:  getRecurring(w, r)
	case http.MethodPost: createRecurring(w, r)
	case http.MethodPut:  updateRecurring(w, r)
	default:              http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

// ---------------------------------------------------------------------------
// Handler: CSV Export
// ---------------------------------------------------------------------------

// exportExpenses streams a CSV file of all expenses for the authenticated user
// within an optional date range.
//
// Query params (both optional, format YYYY-MM-DD):
//
//	?from=2024-01-01   — include expenses on or after this date
//	?to=2024-12-31     — include expenses on or before this date
//
// Response: text/csv with Content-Disposition: attachment so the browser
// triggers a file download rather than rendering in-page.
func exportExpenses(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	userID := userIDFromContext(r)

	// Build optional date-range WHERE conditions.
	var conditions []string
	var args []interface{}
	args = append(args, userID)
	idx := 2

	if from := r.URL.Query().Get("from"); from != "" {
		if _, err := time.Parse("2006-01-02", from); err != nil {
			http.Error(w, "invalid 'from' date — use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		args = append(args, from)
		conditions = append(conditions, fmt.Sprintf("e.created_at >= $%d::date", idx))
		idx++
	}
	if to := r.URL.Query().Get("to"); to != "" {
		if _, err := time.Parse("2006-01-02", to); err != nil {
			http.Error(w, "invalid 'to' date — use YYYY-MM-DD", http.StatusBadRequest)
			return
		}
		args = append(args, to)
		conditions = append(conditions, fmt.Sprintf("e.created_at < ($%d::date + INTERVAL '1 day')", idx))
		idx++
	}

	whereExtra := ""
	if len(conditions) > 0 {
		whereExtra = " AND " + strings.Join(conditions, " AND ")
	}

	query := fmt.Sprintf(
		"SELECT e.id, e.amount, e.description, c.name, e.created_at"+
			" FROM expenses e JOIN categories c ON e.category_id = c.id"+
			" WHERE e.user_id = $1%s ORDER BY e.created_at DESC",
		whereExtra,
	)

	rows, err := db.Query(query, args...)
	if err != nil {
		http.Error(w, "Failed to query expenses", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Build filename: expenses_YYYYMMDD_YYYYMMDD.csv or expenses_all.csv
	fromQ := r.URL.Query().Get("from")
	toQ   := r.URL.Query().Get("to")
	var filename string
	switch {
	case fromQ != "" && toQ != "":
		filename = fmt.Sprintf("expenses_%s_%s.csv",
			strings.ReplaceAll(fromQ, "-", ""),
			strings.ReplaceAll(toQ, "-", ""))
	case fromQ != "":
		filename = fmt.Sprintf("expenses_from_%s.csv", strings.ReplaceAll(fromQ, "-", ""))
	case toQ != "":
		filename = fmt.Sprintf("expenses_to_%s.csv", strings.ReplaceAll(toQ, "-", ""))
	default:
		filename = "expenses_all.csv"
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	// Prevent Caddy / nginx from buffering the whole response before sending.
	w.Header().Set("X-Content-Type-Options", "nosniff")

	cw := csv.NewWriter(w)
	// Header row
	if err := cw.Write([]string{"ID", "Amount", "Description", "Category", "Date"}); err != nil {
		return
	}

	for rows.Next() {
		var (
			id          int
			amount      float64
			description string
			category    string
			createdAt   time.Time
		)
		if err := rows.Scan(&id, &amount, &description, &category, &createdAt); err != nil {
			return // headers already sent; best we can do is stop writing
		}
		if err := cw.Write([]string{
			strconv.Itoa(id),
			strconv.FormatFloat(amount, 'f', 2, 64),
			description,
			category,
			createdAt.Format("2006-01-02"),
		}); err != nil {
			return
		}
	}
	cw.Flush()
	// rows.Err is intentionally not checked after headers are sent; we cannot
	// change the status code at this point — the client already has a 200.
}

// ---------------------------------------------------------------------------
// Route Dispatchers
// ---------------------------------------------------------------------------

func handleCategories(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:   getCategories(w, r)
	case http.MethodPost:  createCategory(w, r)
	case http.MethodPut:   updateCategory(w, r)
	default:               http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}

func handleExpenses(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:  getExpenses(w, r)
	case http.MethodPost: createExpense(w, r)
	case http.MethodPut:  updateExpense(w, r)
	default:              http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	}
}
