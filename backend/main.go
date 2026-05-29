package main

import (
	"errors"
	"filemanager"
	"filemanager/backend/database"
	"filemanager/backend/handlers"
	"filemanager/backend/storage"
	"io/fs"
	"log"
	"net/http"
	"os"
)

func main() {
	// 1. Initialize local storage engine targeting './storage' directory
	storageDir := "./storage"
	localStorage, err := storage.NewLocalStorage(storageDir)
	if err != nil {
		log.Fatalf("Failed to initialize storage engine: %v", err)
	}
	log.Printf("Storage engine initialized at: %s", storageDir)

	// 2. Initialize Metadata Store (MySQL default, or InMemory if DB_DSN=memory)
	var metaStore database.MetadataStore
	var authStore database.AuthStore
	dbDsn := os.Getenv("DB_DSN")
	if dbDsn == "" {
		dbDsn = "root:@tcp(127.0.0.1:3306)/filemanager?parseTime=true"
	}
	if dbDsn == "memory" {
		inMemory := database.NewInMemoryStore()
		metaStore = inMemory
		authStore = inMemory
		log.Println("Using In-Memory store for metadata")
	} else {
		mysqlStore, err := database.NewMySQLStore(dbDsn)
		if err != nil {
			log.Fatalf("Failed to connect to MySQL database: %v", err)
		}
		metaStore = mysqlStore
		authStore = mysqlStore
		log.Println("Using MySQL database for metadata")
	}

	// 3. Fetch the embedded frontend filesystem
	distFS, err := fs.Sub(filemanager.FrontendDist, "frontend/dist")
	if err != nil {
		log.Fatalf("Error reading embedded frontend filesystem: %v", err)
	}

	// Create ServeMux router
	mux := http.NewServeMux()

	// API Routing
	mux.HandleFunc("GET /api/status", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Write([]byte(`{"status":"ok","phase":3,"message":"Database Integration API is active"}`))
	})

	// Bind Upload, Download, List, Token, Delete, and Login endpoints
	mux.HandleFunc("POST /api/login", handlers.MakeLoginHandler(authStore))
	mux.HandleFunc("GET /api/session", handlers.MakeSessionHandler())
	mux.HandleFunc("POST /api/logout", handlers.RequireCSRF(handlers.MakeLogoutHandler()))
	mux.HandleFunc("POST /api/upload", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeUploadHandler(localStorage, metaStore))))
	mux.HandleFunc("GET /api/files", handlers.RequireAuth(handlers.MakeListFilesHandler(metaStore)))
	mux.HandleFunc("GET /api/files/shared-count", handlers.RequireAuth(handlers.MakeCountSharedFilesHandler(metaStore)))
	mux.HandleFunc("GET /api/files/starred-count", handlers.RequireAuth(handlers.MakeCountStarredFilesHandler(metaStore)))
	mux.HandleFunc("GET /api/folders", handlers.RequireAuth(handlers.MakeListFoldersHandler(metaStore)))
	mux.HandleFunc("POST /api/folders", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeCreateFolderHandler(metaStore))))
	mux.HandleFunc("GET /api/trash", handlers.RequireAuth(handlers.MakeListTrashFilesHandler(metaStore)))
	mux.HandleFunc("POST /api/trash/{systemName}/restore", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeRestoreTrashFileHandler(metaStore))))
	mux.HandleFunc("DELETE /api/files/{systemName}", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeDeleteFileHandler(localStorage, metaStore))))
	mux.HandleFunc("PATCH /api/files/{systemName}/star", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeToggleFileStarHandler(metaStore))))
	mux.HandleFunc("PATCH /api/files/{systemName}/folder", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeMoveFileToFolderHandler(metaStore))))
	mux.HandleFunc("DELETE /api/trash/{systemName}", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeHardDeleteFileHandler(localStorage, metaStore))))
	mux.HandleFunc("POST /api/token", handlers.RequireAuth(handlers.RequireCSRF(handlers.MakeTokenGenHandler(metaStore))))
	mux.HandleFunc("GET /api/download", handlers.MakeDownloadHandler(localStorage, metaStore))

	// Serving the React Frontend static files
	fileServer := http.FileServer(http.FS(distFS))

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		if path == "/" {
			fileServer.ServeHTTP(w, r)
			return
		}

		// Try to find the file in embedded FS
		_, err := distFS.Open(path[1:])
		if err == nil {
			fileServer.ServeHTTP(w, r)
			return
		}

		// If the file is not found, fallback to index.html to allow client side routing (SPA fallback)
		if errors.Is(err, fs.ErrNotExist) {
			content, readErr := fs.ReadFile(distFS, "index.html")
			if readErr != nil {
				http.Error(w, "index.html not found", http.StatusNotFound)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Write(content)
			return
		}

		fileServer.ServeHTTP(w, r)
	})

	// Read port configuration
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server running on http://localhost:%s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatalf("Server startup failed: %v", err)
	}
}
