package handlers

import (
	"bytes"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"filemanager/backend/database"
	"filemanager/backend/security"
	"filemanager/backend/storage"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"path/filepath"
	"regexp"
	"strconv"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type Response struct {
	Status  string      `json:"status"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
}

const (
	// MaxUploadSize sets the file size limit to 1 GB
	MaxUploadSize     = 1 * 1024 * 1024 * 1024
	sessionCookieName = "fm_session"
	csrfCookieName    = "fm_csrf"
	csrfHeaderName    = "X-CSRF-Token"
)

// Allowed MIME types whitelist
var allowedMimeTypes = map[string]bool{
	"image/jpeg":                   true,
	"image/png":                    true,
	"image/gif":                    true,
	"image/webp":                   true,
	"image/svg+xml":                true,
	"application/pdf":              true,
	"text/plain":                   true,
	"text/markdown":                true,
	"application/zip":              true,
	"application/x-zip-compressed": true,
	"application/x-tar":            true,
	"application/x-gzip":           true,
	"application/octet-stream":     true, // Generic binary files
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":   true, // docx
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":         true, // xlsx
	"application/vnd.openxmlformats-officedocument.presentationml.presentation": true, // pptx
}

// sanitizeFileName strips paths and restricts filename to alphanumeric, dots, hyphens, and underscores.
func sanitizeFileName(filename string) string {
	base := filepath.Base(filename)
	reg := regexp.MustCompile(`[^a-zA-Z0-9._-]`)
	return reg.ReplaceAllString(base, "_")
}

// RequireAuth is a middleware that validates session cookie before allowing access.
func RequireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || cookie.Value == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "unauthorized"})
			return
		}

		if _, err := security.VerifySessionToken(cookie.Value); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "unauthorized"})
			return
		}

		next(w, r)
	}
}

// RequireCSRF validates double-submit CSRF token for mutating requests.
func RequireCSRF(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		csrfCookie, err := r.Cookie(csrfCookieName)
		if err != nil || csrfCookie.Value == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "csrf validation failed"})
			return
		}

		csrfHeader := r.Header.Get(csrfHeaderName)
		if csrfHeader == "" || csrfHeader != csrfCookie.Value {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "csrf validation failed"})
			return
		}

		next(w, r)
	}
}

func generateCSRFToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("fallback-%d", time.Now().UnixNano())
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// MakeUploadHandler handles streaming file uploads via multipart reader.
func MakeUploadHandler(engine storage.StorageEngine, metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var folderID *int64
		if rawFolderID := r.URL.Query().Get("folderId"); rawFolderID != "" {
			parsedFolderID, err := strconv.ParseInt(rawFolderID, 10, 64)
			if err != nil || parsedFolderID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid folderId query parameter"})
				return
			}
			folderID = &parsedFolderID
		}

		type uploadFailure struct {
			FileName string `json:"fileName"`
			Reason   string `json:"reason"`
		}
		type uploadSummary struct {
			UploadedCount int                     `json:"uploadedCount"`
			FailedCount   int                     `json:"failedCount"`
			UploadedFiles []database.FileMetadata `json:"uploadedFiles"`
			FailedFiles   []uploadFailure         `json:"failedFiles"`
		}

		// 1. Initialize multipart reader for memory-efficient streaming
		reader, err := r.MultipartReader()
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Expected multipart/form-data request"})
			return
		}

		var uploaded []database.FileMetadata
		var failed []uploadFailure

		// 2. Scan request parts and process all files under the same field name.
		for {
			part, err := reader.NextPart()
			if err == io.EOF {
				break
			}
			if err != nil {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: fmt.Sprintf("Failed to read form part: %v", err)})
				return
			}

			if part.FormName() != "file" || part.FileName() == "" {
				part.Close()
				continue
			}

			originalName := part.FileName()
			sanitizedName := sanitizeFileName(originalName)
			systemName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), sanitizedName)

			// 3. Sniff first 512 bytes to determine actual MIME type (security check)
			sniffBuf := make([]byte, 512)
			n, readErr := io.ReadFull(part, sniffBuf)
			if readErr != nil && readErr != io.EOF && readErr != io.ErrUnexpectedEOF {
				part.Close()
				failed = append(failed, uploadFailure{FileName: originalName, Reason: "Failed to scan file headers"})
				continue
			}
			sniffBuf = sniffBuf[:n]

			mimeType := http.DetectContentType(sniffBuf)
			if parsedMime, _, mimeErr := mime.ParseMediaType(mimeType); mimeErr == nil {
				mimeType = parsedMime
			}

			if !allowedMimeTypes[mimeType] {
				part.Close()
				failed = append(failed, uploadFailure{FileName: originalName, Reason: fmt.Sprintf("Disallowed file type: %s", mimeType)})
				continue
			}

			// 4. Construct MultiReader to combine sniffed bytes and remaining network stream
			fullReader := io.MultiReader(bytes.NewReader(sniffBuf), part)

			// Wrap in LimitReader to prevent disk-exhaustion attacks (max size + 1 to detect limit overrun)
			limitedReader := io.LimitReader(fullReader, MaxUploadSize+1)

			// Stream directly into storage engine
			written, saveErr := engine.Save(r.Context(), systemName, limitedReader)
			part.Close()

			if saveErr != nil {
				failed = append(failed, uploadFailure{FileName: originalName, Reason: "Failed to write to storage engine"})
				continue
			}

			// Validate file size limit
			if written > MaxUploadSize {
				// Delete the oversized file from disk
				_ = engine.Delete(r.Context(), systemName)
				failed = append(failed, uploadFailure{FileName: originalName, Reason: fmt.Sprintf("File size exceeds limit of %d MB", MaxUploadSize/(1024*1024))})
				continue
			}

			meta := database.FileMetadata{
				SystemName:   systemName,
				OriginalName: originalName,
				MimeType:     mimeType,
				Size:         written,
				FolderID:     folderID,
				UploadedAt:   time.Now(),
			}
			if err := metaStore.SaveFileMetadata(r.Context(), meta); err != nil {
				_ = engine.Delete(r.Context(), systemName)
				log.Printf("Failed to save metadata to DB for %s: %v", meta.SystemName, err)
				failed = append(failed, uploadFailure{FileName: originalName, Reason: "Failed to save file metadata"})
				continue
			}

			uploaded = append(uploaded, meta)
		}

		if len(uploaded) == 0 && len(failed) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Form field 'file' is missing"})
			return
		}

		summary := uploadSummary{
			UploadedCount: len(uploaded),
			FailedCount:   len(failed),
			UploadedFiles: uploaded,
			FailedFiles:   failed,
		}

		if len(uploaded) == 0 {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{
				Status:  "error",
				Message: fmt.Sprintf("0 file uploaded, %d failed", len(failed)),
				Data:    summary,
			})
			return
		}

		if len(failed) > 0 {
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(Response{
				Status:  "success",
				Message: fmt.Sprintf("%d file(s) uploaded, %d failed", len(uploaded), len(failed)),
				Data:    summary,
			})
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(Response{
			Status:  "success",
			Message: fmt.Sprintf("%d file(s) successfully uploaded", len(uploaded)),
			Data:    summary,
		})
	}
}

// MakeListFilesHandler lists metadata of all uploaded files.
func MakeListFilesHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		rawFolderID := r.URL.Query().Get("folderId")
		rawLimit := r.URL.Query().Get("limit")
		rawOffset := r.URL.Query().Get("offset")

		// Folder-specific query — return all files for that folder (no pagination).
		if rawFolderID != "" {
			folderID, parseErr := strconv.ParseInt(rawFolderID, 10, 64)
			if parseErr != nil || folderID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid folderId query parameter"})
				return
			}
			list, err := metaStore.ListFilesByFolder(r.Context(), folderID)
			if err != nil {
				log.Printf("Failed to list files from DB: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to list files"})
				return
			}
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(Response{Status: "success", Data: list})
			return
		}

		// Paginated query.
		if rawLimit != "" {
			limit, parseErr := strconv.ParseInt(rawLimit, 10, 64)
			if parseErr != nil || limit <= 0 || limit > 500 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid limit parameter (1-500)"})
				return
			}
			offset := int64(0)
			if rawOffset != "" {
				var offsetErr error
				offset, offsetErr = strconv.ParseInt(rawOffset, 10, 64)
				if offsetErr != nil || offset < 0 {
					w.WriteHeader(http.StatusBadRequest)
					json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid offset parameter"})
					return
				}
			}
			files, total, err := metaStore.ListFilesPaginated(r.Context(), limit, offset)
			if err != nil {
				log.Printf("Failed to list paginated files from DB: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to list files"})
				return
			}
			type pagedResponse struct {
				Files  []database.FileMetadata `json:"files"`
				Total  int64                   `json:"total"`
				Limit  int64                   `json:"limit"`
				Offset int64                   `json:"offset"`
			}
			if files == nil {
				files = []database.FileMetadata{}
			}
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(Response{Status: "success", Data: pagedResponse{
				Files:  files,
				Total:  total,
				Limit:  limit,
				Offset: offset,
			}})
			return
		}

		// No limit — return all files (backward compat, used by starred/shared sections).
		list, err := metaStore.ListFiles(r.Context())
		if err != nil {
			log.Printf("Failed to list files from DB: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to list files"})
			return
		}
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Data: list})
	}
}

// MakeCountSharedFilesHandler returns total active files that have been shared at least once.
func MakeCountSharedFilesHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		total, err := metaStore.CountSharedFiles(r.Context())
		if err != nil {
			log.Printf("Failed to count shared files from DB: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to count shared files"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Data: map[string]int64{"count": total}})
	}
}

// MakeCountStarredFilesHandler returns total active files currently starred.
func MakeCountStarredFilesHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		total, err := metaStore.CountStarredFiles(r.Context())
		if err != nil {
			log.Printf("Failed to count starred files from DB: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to count starred files"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Data: map[string]int64{"count": total}})
	}
}

// MakeToggleFileStarHandler toggles starred state for an active file.
func MakeToggleFileStarHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		systemName := r.PathValue("systemName")
		if systemName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "systemName path parameter is required"})
			return
		}

		var req struct {
			Starred *bool `json:"starred"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Starred == nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "starred boolean is required"})
			return
		}

		if err := metaStore.SetFileStarred(r.Context(), systemName, *req.Starred); err != nil {
			log.Printf("Failed to set starred state for %s: %v", systemName, err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "File not found or already deleted"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Message: "Starred state updated"})
	}
}

// MakeListTrashFilesHandler lists metadata of all soft-deleted files.
func MakeListTrashFilesHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		list, err := metaStore.ListTrashFiles(r.Context())
		if err != nil {
			log.Printf("Failed to list trash files from DB: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to list trash files"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Data: list})
	}
}

// MakeListFoldersHandler lists root-level folders.
func MakeListFoldersHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		list, err := metaStore.ListFolders(r.Context())
		if err != nil {
			log.Printf("Failed to list folders from DB: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to list folders"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Data: list})
	}
}

// MakeCreateFolderHandler creates a new root-level folder.
func MakeCreateFolderHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid request body"})
			return
		}

		if req.Name == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "name is required"})
			return
		}

		folder, err := metaStore.CreateFolder(r.Context(), req.Name, nil)
		if err != nil {
			log.Printf("Failed to create folder: %v", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to create folder"})
			return
		}

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(Response{Status: "success", Data: folder})
	}
}

// MakeMoveFileToFolderHandler updates folder assignment for an active file.
func MakeMoveFileToFolderHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		systemName := r.PathValue("systemName")
		if systemName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "systemName path parameter is required"})
			return
		}

		var req struct {
			FolderID *int64 `json:"folderId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid request body"})
			return
		}

		if req.FolderID != nil {
			if *req.FolderID <= 0 {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "folderId must be a positive integer or null"})
				return
			}

			folders, err := metaStore.ListFolders(r.Context())
			if err != nil {
				log.Printf("Failed to list folders for move validation: %v", err)
				w.WriteHeader(http.StatusInternalServerError)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to validate folder"})
				return
			}
			found := false
			for _, folder := range folders {
				if folder.ID == *req.FolderID {
					found = true
					break
				}
			}
			if !found {
				w.WriteHeader(http.StatusNotFound)
				json.NewEncoder(w).Encode(Response{Status: "error", Message: "Folder not found"})
				return
			}
		}

		if err := metaStore.MoveFileToFolder(r.Context(), systemName, req.FolderID); err != nil {
			log.Printf("Failed to move file %s to folder: %v", systemName, err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "File not found or already deleted"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Message: "File moved successfully"})
	}
}

type TokenRequest struct {
	SystemName string `json:"systemName"`
}

type TokenResponse struct {
	Token       string `json:"token"`
	DownloadURL string `json:"downloadUrl"`
	ExpiresAt   int64  `json:"expiresAtMilli"`
}

// MakeTokenGenHandler generates a short-lived download token.
func MakeTokenGenHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req TokenRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Invalid request body"})
			return
		}

		if req.SystemName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "systemName is required"})
			return
		}

		_, err := metaStore.GetFileMetadata(r.Context(), req.SystemName)
		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "File not found"})
			return
		}

		if err := metaStore.IncrementShareCount(r.Context(), req.SystemName); err != nil {
			log.Printf("Failed to increment share count for %s: %v", req.SystemName, err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Failed to generate token"})
			return
		}

		// Create token valid for 5 minutes
		validity := 5 * time.Minute
		token := security.GenerateDownloadToken(req.SystemName, validity)
		downloadURL := fmt.Sprintf("/download?token=%s", token)

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{
			Status: "success",
			Data: TokenResponse{
				Token:       token,
				DownloadURL: downloadURL,
				ExpiresAt:   time.Now().Add(validity).UnixMilli(),
			},
		})
	}
}

// MakeDownloadHandler streams the file back to client using the signed token.
func MakeDownloadHandler(engine storage.StorageEngine, metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "Forbidden: Missing download token", http.StatusForbidden)
			return
		}

		systemName, err := security.VerifyDownloadToken(token)
		if err != nil {
			http.Error(w, fmt.Sprintf("Forbidden: %v", err), http.StatusForbidden)
			return
		}

		meta, err := metaStore.GetFileMetadata(r.Context(), systemName)
		if err != nil {
			// Fallback metadata if mapping doesn't exist but file is present on disk
			meta = database.FileMetadata{
				SystemName:   systemName,
				OriginalName: filepath.Base(systemName),
				MimeType:     "application/octet-stream",
			}
		}

		stream, err := engine.Retrieve(r.Context(), systemName)
		if err != nil {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		defer stream.Close()

		if err := metaStore.IncrementDownloadCount(r.Context(), systemName); err != nil {
			log.Printf("Warning: failed to increment download count for %s: %v", systemName, err)
		}

		// Stream content headers
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", meta.OriginalName))
		w.Header().Set("Content-Type", meta.MimeType)
		if meta.Size > 0 {
			w.Header().Set("Content-Length", fmt.Sprintf("%d", meta.Size))
		}

		// Perform memory-efficient chunked copy
		_, copyErr := io.Copy(w, stream)
		if copyErr != nil {
			log.Printf("File streaming failed: %v", copyErr)
		}
	}
}

// MakeDeleteFileHandler soft-deletes the metadata only.
func MakeDeleteFileHandler(_ storage.StorageEngine, metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		// Extract {systemName} from URL path: /api/files/{systemName}
		systemName := r.PathValue("systemName")
		if systemName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "systemName path parameter is required"})
			return
		}

		// Remove from metadata store first
		if err := metaStore.DeleteFileMetadata(r.Context(), systemName); err != nil {
			log.Printf("Failed to delete metadata for %s: %v", systemName, err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "File not found or already deleted"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Message: "File moved to trash"})
	}
}

// MakeHardDeleteFileHandler permanently removes soft-deleted metadata and physical file.
func MakeHardDeleteFileHandler(engine storage.StorageEngine, metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		systemName := r.PathValue("systemName")
		if systemName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "systemName path parameter is required"})
			return
		}

		if err := metaStore.HardDeleteFileMetadata(r.Context(), systemName); err != nil {
			log.Printf("Failed to hard-delete metadata for %s: %v", systemName, err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Trash file not found"})
			return
		}

		if err := engine.Delete(r.Context(), systemName); err != nil {
			log.Printf("Warning: hard-delete metadata succeeded but physical removal failed for %s: %v", systemName, err)
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Message: "File permanently deleted"})
	}
}

// MakeRestoreTrashFileHandler restores a soft-deleted file metadata back to active files.
func MakeRestoreTrashFileHandler(metaStore database.MetadataStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		systemName := r.PathValue("systemName")
		if systemName == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "systemName path parameter is required"})
			return
		}

		if err := metaStore.RestoreFileMetadata(r.Context(), systemName); err != nil {
			log.Printf("Failed to restore metadata for %s: %v", systemName, err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "Trash file not found"})
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Message: "File restored"})
	}
}

// MakeLoginHandler handles POST /api/login.
// It validates username/password against the AuthStore and returns the user info.
func MakeLoginHandler(authStore database.AuthStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "username and password are required"})
			return
		}

		user, hash, err := authStore.GetUserByUsername(r.Context(), req.Username)
		if err != nil {
			// Use same response for "not found" vs "wrong password" to avoid enumeration
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "invalid credentials"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "invalid credentials"})
			return
		}

		sessionToken := security.GenerateSessionToken(
			fmt.Sprintf("%d", user.ID),
			user.Username,
			user.Role,
			12*time.Hour,
		)
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookieName,
			Value:    sessionToken,
			Path:     "/",
			HttpOnly: true,
			Secure:   r.TLS != nil,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   int((12 * time.Hour).Seconds()),
		})

		csrfToken := generateCSRFToken()
		http.SetCookie(w, &http.Cookie{
			Name:     csrfCookieName,
			Value:    csrfToken,
			Path:     "/",
			HttpOnly: false,
			Secure:   r.TLS != nil,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   int((12 * time.Hour).Seconds()),
		})

		json.NewEncoder(w).Encode(Response{
			Status: "success",
			Data: map[string]interface{}{
				"id":   fmt.Sprintf("%d", user.ID),
				"name": user.Username,
				"role": user.Role,
			},
		})
	}
}

// MakeSessionHandler validates session cookie and returns the current user.
func MakeSessionHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || cookie.Value == "" {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "unauthorized"})
			return
		}

		claims, err := security.VerifySessionToken(cookie.Value)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(Response{Status: "error", Message: "unauthorized"})
			return
		}

		if csrfCookie, csrfErr := r.Cookie(csrfCookieName); csrfErr != nil || csrfCookie.Value == "" {
			http.SetCookie(w, &http.Cookie{
				Name:     csrfCookieName,
				Value:    generateCSRFToken(),
				Path:     "/",
				HttpOnly: false,
				Secure:   r.TLS != nil,
				SameSite: http.SameSiteLaxMode,
				MaxAge:   int((12 * time.Hour).Seconds()),
			})
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{
			Status: "success",
			Data: map[string]interface{}{
				"id":   claims.UserID,
				"name": claims.Name,
				"role": claims.Role,
			},
		})
	}
}

// MakeLogoutHandler clears session cookie.
func MakeLogoutHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   r.TLS != nil,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
		http.SetCookie(w, &http.Cookie{
			Name:     csrfCookieName,
			Value:    "",
			Path:     "/",
			HttpOnly: false,
			Secure:   r.TLS != nil,
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(Response{Status: "success", Message: "signed out"})
	}
}
