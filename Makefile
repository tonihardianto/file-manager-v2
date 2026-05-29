.PHONY: all build-frontend build-backend build run clean

# Default target
all: build

# Build the React frontend production bundle
build-frontend:
	@echo "Building React frontend..."
	cd frontend && npm run build

# Build the Go backend binary
build-backend:
	@echo "Building Go backend binary..."
	go build -o filemanager ./backend

# Build both frontend and backend
build: build-frontend build-backend
	@echo "Build complete! Binary 'filemanager' created."

# Build and run the single binary
run: build
	./filemanager

# Clean up built artifacts
clean:
	rm -rf frontend/dist
	rm -f filemanager
