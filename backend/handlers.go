package main

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
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
	rows, err := db.Query(
		"SELECT date_trunc('month', created_at)::date AS month, SUM(amount) AS total"+
			" FROM expenses WHERE user_id = $1 GROUP BY month ORDER BY month DESC",
		userID,
	)
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

func getTotalExpenses(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	var total float64
	if err := db.QueryRow(
		"SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE user_id = $1", userID,
	).Scan(&total); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonResponse(w, map[string]float64{"total": total}, http.StatusOK)
}

func getCategoryTotals(w http.ResponseWriter, r *http.Request) {
	userID := userIDFromContext(r)
	rows, err := db.Query(
		"SELECT c.name, SUM(e.amount) AS total"+
			" FROM expenses e JOIN categories c ON e.category_id = c.id"+
			" WHERE e.user_id = $1 GROUP BY c.name",
		userID,
	)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	res := []CategoryTotal{}
	for rows.Next() {
		var s CategoryTotal
		if err := rows.Scan(&s.CategoryName, &s.TotalAmount); err != nil {
			http.Error(w, "Failed to read category total row", http.StatusInternalServerError)
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
