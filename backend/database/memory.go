package database

import (
	"context"
	"fmt"
	"sort"
	"sync"
	"time"
)

// InMemoryStore implements the MetadataStore and AuthStore interfaces using maps.
// This is used for local development when a MySQL database is not available.
type InMemoryStore struct {
	mu           sync.RWMutex
	files        map[string]FileMetadata
	trash        map[string]FileMetadata
	folders      map[int64]Folder
	nextFolderID int64
}

// Default dev credentials: admin / admin
// In-memory bcrypt hash of "admin" generated offline.
const devAdminHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

// NewInMemoryStore creates a new instance of InMemoryStore.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		files:        make(map[string]FileMetadata),
		trash:        make(map[string]FileMetadata),
		folders:      make(map[int64]Folder),
		nextFolderID: 1,
	}
}

// GetUserByUsername returns a hardcoded admin user for local development.
func (s *InMemoryStore) GetUserByUsername(_ context.Context, username string) (User, string, error) {
	if username == "admin" {
		return User{ID: 1, Username: "admin", Role: "admin"}, devAdminHash, nil
	}
	return User{}, "", fmt.Errorf("user not found: %s", username)
}

func (s *InMemoryStore) SaveFileMetadata(ctx context.Context, meta FileMetadata) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	meta.DeletedAt = nil
	s.files[meta.SystemName] = meta
	delete(s.trash, meta.SystemName)
	return nil
}

func (s *InMemoryStore) GetFileMetadata(ctx context.Context, systemName string) (FileMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	meta, exists := s.files[systemName]
	if !exists {
		meta, exists = s.trash[systemName]
		if !exists {
			return FileMetadata{}, fmt.Errorf("file metadata not found for %s", systemName)
		}
	}
	return meta, nil
}

func (s *InMemoryStore) ListFiles(ctx context.Context) ([]FileMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]FileMetadata, 0, len(s.files))
	for _, v := range s.files {
		list = append(list, v)
	}
	return list, nil
}

func (s *InMemoryStore) ListPublicFiles(ctx context.Context) ([]FileMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]FileMetadata, 0)
	for _, v := range s.files {
		if v.IsPublic {
			list = append(list, v)
		}
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].UploadedAt.After(list[j].UploadedAt)
	})

	return list, nil
}

func (s *InMemoryStore) ListFilesPaginated(ctx context.Context, limit, offset int64) ([]FileMetadata, int64, error) {
	all, err := s.ListFiles(ctx)
	if err != nil {
		return nil, 0, err
	}
	// Sort by uploadedAt DESC to match MySQL ordering.
	sort.Slice(all, func(i, j int) bool {
		return all[i].UploadedAt.After(all[j].UploadedAt)
	})
	total := int64(len(all))
	if offset >= total {
		return nil, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return all[offset:end], total, nil
}

func (s *InMemoryStore) ListFilesByFolder(ctx context.Context, folderID int64) ([]FileMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]FileMetadata, 0)
	for _, meta := range s.files {
		if meta.DeletedAt != nil {
			continue
		}
		if meta.FolderID == nil || *meta.FolderID != folderID {
			continue
		}
		list = append(list, meta)
	}

	return list, nil
}

func (s *InMemoryStore) ListTrashFiles(ctx context.Context) ([]FileMetadata, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	list := make([]FileMetadata, 0, len(s.trash))
	for _, v := range s.trash {
		list = append(list, v)
	}
	return list, nil
}

func (s *InMemoryStore) DeleteFileMetadata(ctx context.Context, systemName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	meta, exists := s.files[systemName]
	if !exists {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	now := time.Now()
	meta.DeletedAt = &now
	s.trash[systemName] = meta
	delete(s.files, systemName)
	return nil
}

func (s *InMemoryStore) HardDeleteFileMetadata(ctx context.Context, systemName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.trash[systemName]; !exists {
		return fmt.Errorf("trash metadata not found for %s", systemName)
	}
	delete(s.trash, systemName)
	return nil
}

func (s *InMemoryStore) RestoreFileMetadata(ctx context.Context, systemName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, exists := s.trash[systemName]
	if !exists {
		return fmt.Errorf("trash metadata not found for %s", systemName)
	}
	meta.DeletedAt = nil
	s.files[systemName] = meta
	delete(s.trash, systemName)
	return nil
}

func (s *InMemoryStore) IncrementDownloadCount(ctx context.Context, systemName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, exists := s.files[systemName]
	if !exists {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	meta.DownloadCount += 1
	s.files[systemName] = meta
	return nil
}

func (s *InMemoryStore) IncrementShareCount(ctx context.Context, systemName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, exists := s.files[systemName]
	if !exists {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	meta.ShareCount += 1
	s.files[systemName] = meta
	return nil
}

func (s *InMemoryStore) CountSharedFiles(ctx context.Context) (int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := int64(0)
	for _, meta := range s.files {
		if meta.ShareCount > 0 {
			total += 1
		}
	}
	return total, nil
}

func (s *InMemoryStore) SetFileStarred(ctx context.Context, systemName string, starred bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, exists := s.files[systemName]
	if !exists {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	meta.Starred = starred
	s.files[systemName] = meta
	return nil
}

func (s *InMemoryStore) SetFilePublic(ctx context.Context, systemName string, isPublic bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, exists := s.files[systemName]
	if !exists {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	meta.IsPublic = isPublic
	s.files[systemName] = meta
	return nil
}

func (s *InMemoryStore) CountStarredFiles(ctx context.Context) (int64, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	total := int64(0)
	for _, meta := range s.files {
		if meta.Starred {
			total += 1
		}
	}
	return total, nil
}

func (s *InMemoryStore) MoveFileToFolder(ctx context.Context, systemName string, folderID *int64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	meta, exists := s.files[systemName]
	if !exists {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	meta.FolderID = folderID
	s.files[systemName] = meta
	return nil
}

func (s *InMemoryStore) CreateFolder(ctx context.Context, name string, parentID *int64) (Folder, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	f := Folder{
		ID:        s.nextFolderID,
		Name:      name,
		ParentID:  parentID,
		CreatedAt: time.Now(),
	}
	s.folders[f.ID] = f
	s.nextFolderID += 1
	return f, nil
}

func (s *InMemoryStore) ListFolders(ctx context.Context) ([]Folder, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]Folder, 0, len(s.folders))
	for _, f := range s.folders {
		if f.ParentID == nil {
			list = append(list, f)
		}
	}
	return list, nil
}
