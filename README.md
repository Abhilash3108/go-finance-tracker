# Go Finance Tracker

A scalable, containerized Personal Finance Tracker built with a Go backend, React frontend, and PostgreSQL database.

## 🏗️ Architecture Overview

This project uses a **Containerized Micro-Monorepo** approach. By using Docker, we ensure the application runs identically on your local machine and in a production cloud environment.

### Project Structure
- **/backend**: Go API server. Chosen for high concurrency and performance.
- **/frontend**: React + TypeScript + Vite. Chosen for a fast, responsive UI.
- **/docker-compose.yml**: Orchestrates the DB, API, and Frontend, ensuring they connect seamlessly on a shared internal network.

---

## 📂 File Documentation

### ⚙️ Backend (/backend)
* **`main.go`**: The heart of the application. Handles API routing, database connection pooling, and business logic for financial reports.
* **`Dockerfile`**: A multi-stage Docker build that compiles your Go code into a tiny, efficient binary, keeping the container footprint minimal.
* **`go.mod` / `go.sum`**: Go dependency management files. Used to pin specific versions of libraries (like `lib/pq` for Postgres) to ensure reproducible builds.

### 🎨 Frontend (/frontend)
* **`App.tsx`**: The main React component. It manages the application state, handles data fetching, and provides the UI tabs.
* **`main.tsx`**: Entry point that renders the React app into the DOM.
* **`package.json`**: Lists all React dependencies (Tailwind, Vite, etc.) and build scripts.
* **`vite.config.ts`**: Configures the development server. Crucially, it sets up a **Proxy** that redirects API calls from the frontend port (5173) to the backend port (8080) to avoid CORS issues during development.
* **`nginx.conf`**: A configuration for the Nginx web server used in production. It routes traffic and serves the static React files.
* **`Dockerfile`**: A two-stage build. First, it builds the React app (npm run build); second, it serves the static files using Nginx.

### 🌐 Infrastructure
* **`docker-compose.yml`**: The "glue" of the project. It defines three services:
    1. `db`: A PostgreSQL container with persistent storage (`pgdata`).
    2. `backend`: Runs the Go API, waits for the DB to be healthy, and connects via internal Docker DNS.
    3. `frontend`: Runs the Nginx server to serve the React SPA.

---

## 🚀 Why this stack?

1.  **PostgreSQL (`db`)**: Chosen for its ACID compliance, ensuring your financial data is always reliable and accurate.
2.  **Go Backend**: Provides a robust, type-safe API. It connects to the DB using connection pooling, which is much more performant than opening a new connection for every request.
3.  **Tailwind CSS**: Used for rapid, responsive UI development without needing to manage hundreds of CSS files.
4.  **Docker**: Eliminates the "it works on my machine" problem. With one command (`docker-compose up`), the entire stack—database, API, and UI—is ready to work together.

## 🛠️ How to run
1. Ensure Docker Desktop is running.
2. Run `docker-compose up --build`.
3. Access the app at `http://localhost`.