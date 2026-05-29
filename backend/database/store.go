package database

import (
	"context"
	"time"
)

// User represents an authenticated user in the system.
type User struct {
	ID       int
	Username string
	Role     string
}

// AuthStore defines the interface for user authentication.
type AuthStore interface {
	// GetUserByUsername retrieves a user + their bcrypt password_hash by username.
	GetUserByUsername(ctx context.Context, username string) (User, string, error)
}

// FileMetadata represents the information we store about each file.
type FileMetadata struct {
	SystemName    string     `json:"systemName"`
	OriginalName  string     `json:"originalName"`
	MimeType      string     `json:"mimeType"`
	Size          int64      `json:"size"`
	FolderID      *int64     `json:"folderId,omitempty"`
	UploadedAt    time.Time  `json:"uploadedAt"`
	DeletedAt     *time.Time `json:"deletedAt,omitempty"`
	DownloadCount int64      `json:"downloadCount"`
	ShareCount    int64      `json:"shareCount"`
	Starred       bool       `json:"starred"`
}

// Folder represents a virtual folder in the drive.
type Folder struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	ParentID  *int64    `json:"parentId,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// MetadataStore defines the interface for persisting and retrieving file metadata.
// This allows us to easily switch between an in-memory mock during development
// and a real MySQL database in production.
type MetadataStore interface {
	// SaveFileMetadata stores the metadata for a newly uploaded file.
	SaveFileMetadata(ctx context.Context, meta FileMetadata) error

	// GetFileMetadata retrieves the metadata for a specific file by its system name.
	GetFileMetadata(ctx context.Context, systemName string) (FileMetadata, error)

	// ListFiles returns all active (non-deleted) files in the system.
	ListFiles(ctx context.Context) ([]FileMetadata, error)

	// ListFilesPaginated returns a page of active files ordered by upload date desc,
	// together with the total count of all active files.
	ListFilesPaginated(ctx context.Context, limit, offset int64) (files []FileMetadata, total int64, err error)

	// ListFilesByFolder returns all active files in a specific folder.
	ListFilesByFolder(ctx context.Context, folderID int64) ([]FileMetadata, error)

	// ListTrashFiles returns all soft-deleted files.
	ListTrashFiles(ctx context.Context) ([]FileMetadata, error)

	// DeleteFileMetadata removes the metadata entry for a file by its system name.
	DeleteFileMetadata(ctx context.Context, systemName string) error

	// HardDeleteFileMetadata permanently removes metadata entry for a file.
	HardDeleteFileMetadata(ctx context.Context, systemName string) error

	// RestoreFileMetadata restores a soft-deleted file metadata back to active files.
	RestoreFileMetadata(ctx context.Context, systemName string) error

	// IncrementDownloadCount increments download counter for an active file.
	IncrementDownloadCount(ctx context.Context, systemName string) error

	// IncrementShareCount increments share-link generation counter for an active file.
	IncrementShareCount(ctx context.Context, systemName string) error

	// CountSharedFiles returns total active files that have been shared at least once.
	CountSharedFiles(ctx context.Context) (int64, error)

	// SetFileStarred sets starred state for an active file.
	SetFileStarred(ctx context.Context, systemName string, starred bool) error

	// CountStarredFiles returns total active files currently starred.
	CountStarredFiles(ctx context.Context) (int64, error)

	// MoveFileToFolder updates active file folder association. Nil folderID moves file to root.
	MoveFileToFolder(ctx context.Context, systemName string, folderID *int64) error

	// CreateFolder creates a new folder.
	CreateFolder(ctx context.Context, name string, parentID *int64) (Folder, error)

	// ListFolders returns all active root-level folders.
	ListFolders(ctx context.Context) ([]Folder, error)
}
