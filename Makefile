.PHONY: all build-frontend build-backend build-backend-linux build run clean

# Default target
all: build

# Build the React frontend production bundle
build-frontend:
	@echo "Building React frontend..."
	cd frontend && npm run build

# Build the Go backend binary untuk lokal (MacBook)
build-backend:
	@echo "Building Go backend binary for local OS..."
	go build -o filemanager ./backend

# BARU: Build Go backend binary khusus untuk target Server Linux Ubuntu
build-backend-linux:
	@echo "Building Go backend binary for Linux (amd64)..."
	GOOS=linux GOARCH=amd64 go build -o filemanager-server ./backend

# Build both frontend and backend
build: build-frontend build-backend
	@echo "Build complete! Binary 'filemanager' created."

# Build frontend dan backend untuk keperluan DEPLOY ke Ubuntu
build-server: build-frontend build-backend-linux
	@echo "Build complete! Binary 'filemanager-server' created for Ubuntu deployment."

# Build dan run untuk lokal MacBook
run: build-frontend build-backend
	./filemanager

# Clean up built artifacts
clean:
	rm -rf frontend/dist
	rm -f filemanager
	rm -f filemanager-server