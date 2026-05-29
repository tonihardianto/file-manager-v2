package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// MySQLStore implements the MetadataStore interface using a MySQL database.
type MySQLStore struct {
	db *sql.DB
}

// NewMySQLStore creates a new MySQL database connection and returns a MySQLStore.
// The dsn should be in the format: username:password@tcp(host:port)/dbname?parseTime=true
func NewMySQLStore(dsn string) (*MySQLStore, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open mysql connection: %w", err)
	}

	// Verify connection is valid
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping mysql database: %w", err)
	}

	return &MySQLStore{db: db}, nil
}

func (s *MySQLStore) SaveFileMetadata(ctx context.Context, meta FileMetadata) error {
	query := `
		INSERT INTO files (nama_file_asli, nama_file_sistem, path, ukuran, mime_type, folder_id, waktu_diunggah)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	// Note: in a real implementation, path might be different from systemName,
	// but here we just store systemName as path for simplicity since local storage uses it directly.
	_, err := s.db.ExecContext(ctx, query,
		meta.OriginalName,
		meta.SystemName,
		meta.SystemName, // Using SystemName for path for now
		meta.Size,
		meta.MimeType,
		meta.FolderID,
		meta.UploadedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to insert file metadata: %w", err)
	}
	return nil
}

func (s *MySQLStore) GetFileMetadata(ctx context.Context, systemName string) (FileMetadata, error) {
	query := `
		SELECT nama_file_asli, nama_file_sistem, ukuran, mime_type, folder_id, waktu_diunggah, jumlah_download, jumlah_share, is_starred
		FROM files
		WHERE nama_file_sistem = ? AND waktu_dihapus IS NULL
	`
	var meta FileMetadata
	var folder sql.NullInt64
	err := s.db.QueryRowContext(ctx, query, systemName).Scan(
		&meta.OriginalName,
		&meta.SystemName,
		&meta.Size,
		&meta.MimeType,
		&folder,
		&meta.UploadedAt,
		&meta.DownloadCount,
		&meta.ShareCount,
		&meta.Starred,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return FileMetadata{}, fmt.Errorf("file metadata not found for %s", systemName)
		}
		return FileMetadata{}, fmt.Errorf("failed to query file metadata: %w", err)
	}
	if folder.Valid {
		meta.FolderID = &folder.Int64
	}
	return meta, nil
}

func (s *MySQLStore) ListFiles(ctx context.Context) ([]FileMetadata, error) {
	query := `
		SELECT nama_file_asli, nama_file_sistem, ukuran, mime_type, folder_id, waktu_diunggah, jumlah_download, jumlah_share, is_starred
		FROM files
		WHERE waktu_dihapus IS NULL
		ORDER BY waktu_diunggah DESC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}
	defer rows.Close()

	var list []FileMetadata
	for rows.Next() {
		var meta FileMetadata
		var folder sql.NullInt64
		if err := rows.Scan(
			&meta.OriginalName,
			&meta.SystemName,
			&meta.Size,
			&meta.MimeType,
			&folder,
			&meta.UploadedAt,
			&meta.DownloadCount,
			&meta.ShareCount,
			&meta.Starred,
		); err != nil {
			return nil, fmt.Errorf("failed to scan file row: %w", err)
		}
		if folder.Valid {
			meta.FolderID = &folder.Int64
		}
		list = append(list, meta)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating file rows: %w", err)
	}

	return list, nil
}

func (s *MySQLStore) ListFilesPaginated(ctx context.Context, limit, offset int64) ([]FileMetadata, int64, error) {
	var total int64
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM files WHERE waktu_dihapus IS NULL").Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count files: %w", err)
	}

	query := `
		SELECT nama_file_asli, nama_file_sistem, ukuran, mime_type, folder_id, waktu_diunggah, jumlah_download, jumlah_share, is_starred
		FROM files
		WHERE waktu_dihapus IS NULL
		ORDER BY waktu_diunggah DESC
		LIMIT ? OFFSET ?
	`
	rows, err := s.db.QueryContext(ctx, query, limit, offset)
	if err != nil {
		return nil, total, fmt.Errorf("failed to list files paginated: %w", err)
	}
	defer rows.Close()

	var list []FileMetadata
	for rows.Next() {
		var meta FileMetadata
		var folder sql.NullInt64
		if err := rows.Scan(
			&meta.OriginalName,
			&meta.SystemName,
			&meta.Size,
			&meta.MimeType,
			&folder,
			&meta.UploadedAt,
			&meta.DownloadCount,
			&meta.ShareCount,
			&meta.Starred,
		); err != nil {
			return nil, total, fmt.Errorf("failed to scan file row: %w", err)
		}
		if folder.Valid {
			meta.FolderID = &folder.Int64
		}
		list = append(list, meta)
	}

	if err := rows.Err(); err != nil {
		return nil, total, fmt.Errorf("error iterating paginated file rows: %w", err)
	}

	return list, total, nil
}

func (s *MySQLStore) ListFilesByFolder(ctx context.Context, folderID int64) ([]FileMetadata, error) {
	query := `
		SELECT nama_file_asli, nama_file_sistem, ukuran, mime_type, folder_id, waktu_diunggah, jumlah_download, jumlah_share, is_starred
		FROM files
		WHERE waktu_dihapus IS NULL AND folder_id = ?
		ORDER BY waktu_diunggah DESC
	`
	rows, err := s.db.QueryContext(ctx, query, folderID)
	if err != nil {
		return nil, fmt.Errorf("failed to list files by folder: %w", err)
	}
	defer rows.Close()

	var list []FileMetadata
	for rows.Next() {
		var meta FileMetadata
		var folder sql.NullInt64
		if err := rows.Scan(
			&meta.OriginalName,
			&meta.SystemName,
			&meta.Size,
			&meta.MimeType,
			&folder,
			&meta.UploadedAt,
			&meta.DownloadCount,
			&meta.ShareCount,
			&meta.Starred,
		); err != nil {
			return nil, fmt.Errorf("failed to scan file row: %w", err)
		}
		if folder.Valid {
			meta.FolderID = &folder.Int64
		}
		list = append(list, meta)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating file rows: %w", err)
	}

	return list, nil
}

func (s *MySQLStore) ListTrashFiles(ctx context.Context) ([]FileMetadata, error) {
	query := `
		SELECT nama_file_asli, nama_file_sistem, ukuran, mime_type, folder_id, waktu_diunggah, waktu_dihapus, jumlah_download, jumlah_share, is_starred
		FROM files
		WHERE waktu_dihapus IS NOT NULL
		ORDER BY waktu_dihapus DESC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list trash files: %w", err)
	}
	defer rows.Close()

	var list []FileMetadata
	for rows.Next() {
		var meta FileMetadata
		var deletedAt sql.NullTime
		var folder sql.NullInt64
		if err := rows.Scan(
			&meta.OriginalName,
			&meta.SystemName,
			&meta.Size,
			&meta.MimeType,
			&folder,
			&meta.UploadedAt,
			&deletedAt,
			&meta.DownloadCount,
			&meta.ShareCount,
			&meta.Starred,
		); err != nil {
			return nil, fmt.Errorf("failed to scan trash row: %w", err)
		}
		if folder.Valid {
			meta.FolderID = &folder.Int64
		}
		if deletedAt.Valid {
			meta.DeletedAt = &deletedAt.Time
		}
		list = append(list, meta)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating trash rows: %w", err)
	}

	return list, nil
}

// GetUserByUsername queries the users table and returns the user + password_hash.
func (s *MySQLStore) GetUserByUsername(ctx context.Context, username string) (User, string, error) {
	var u User
	var hash string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, username, role, password_hash FROM users WHERE username = ? LIMIT 1`,
		username,
	).Scan(&u.ID, &u.Username, &u.Role, &hash)
	if err != nil {
		if err == sql.ErrNoRows {
			return User{}, "", fmt.Errorf("user not found")
		}
		return User{}, "", fmt.Errorf("failed to query user: %w", err)
	}
	return u, hash, nil
}

func (s *MySQLStore) DeleteFileMetadata(ctx context.Context, systemName string) error {
	query := `UPDATE files SET waktu_dihapus = NOW() WHERE nama_file_sistem = ? AND waktu_dihapus IS NULL`
	res, err := s.db.ExecContext(ctx, query, systemName)
	if err != nil {
		return fmt.Errorf("failed to soft-delete file metadata: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) HardDeleteFileMetadata(ctx context.Context, systemName string) error {
	query := `DELETE FROM files WHERE nama_file_sistem = ? AND waktu_dihapus IS NOT NULL`
	res, err := s.db.ExecContext(ctx, query, systemName)
	if err != nil {
		return fmt.Errorf("failed to hard-delete file metadata: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("trash metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) RestoreFileMetadata(ctx context.Context, systemName string) error {
	query := `UPDATE files SET waktu_dihapus = NULL WHERE nama_file_sistem = ? AND waktu_dihapus IS NOT NULL`
	res, err := s.db.ExecContext(ctx, query, systemName)
	if err != nil {
		return fmt.Errorf("failed to restore file metadata: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("trash metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) IncrementDownloadCount(ctx context.Context, systemName string) error {
	query := `UPDATE files SET jumlah_download = jumlah_download + 1 WHERE nama_file_sistem = ? AND waktu_dihapus IS NULL`
	res, err := s.db.ExecContext(ctx, query, systemName)
	if err != nil {
		return fmt.Errorf("failed to increment download count: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) IncrementShareCount(ctx context.Context, systemName string) error {
	query := `UPDATE files SET jumlah_share = jumlah_share + 1 WHERE nama_file_sistem = ? AND waktu_dihapus IS NULL`
	res, err := s.db.ExecContext(ctx, query, systemName)
	if err != nil {
		return fmt.Errorf("failed to increment share count: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) CountSharedFiles(ctx context.Context) (int64, error) {
	var total int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM files WHERE waktu_dihapus IS NULL AND jumlah_share > 0`).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("failed to count shared files: %w", err)
	}
	return total, nil
}

func (s *MySQLStore) SetFileStarred(ctx context.Context, systemName string, starred bool) error {
	query := `UPDATE files SET is_starred = ? WHERE nama_file_sistem = ? AND waktu_dihapus IS NULL`
	res, err := s.db.ExecContext(ctx, query, starred, systemName)
	if err != nil {
		return fmt.Errorf("failed to set starred state: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) CountStarredFiles(ctx context.Context) (int64, error) {
	var total int64
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM files WHERE waktu_dihapus IS NULL AND is_starred = 1`).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("failed to count starred files: %w", err)
	}
	return total, nil
}

func (s *MySQLStore) MoveFileToFolder(ctx context.Context, systemName string, folderID *int64) error {
	query := `UPDATE files SET folder_id = ? WHERE nama_file_sistem = ? AND waktu_dihapus IS NULL`
	res, err := s.db.ExecContext(ctx, query, folderID, systemName)
	if err != nil {
		return fmt.Errorf("failed to move file to folder: %w", err)
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("file metadata not found for %s", systemName)
	}
	return nil
}

func (s *MySQLStore) CreateFolder(ctx context.Context, name string, parentID *int64) (Folder, error) {
	query := `INSERT INTO folders (name, parent_id) VALUES (?, ?)`
	res, err := s.db.ExecContext(ctx, query, name, parentID)
	if err != nil {
		return Folder{}, fmt.Errorf("failed to create folder: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return Folder{}, fmt.Errorf("failed to get inserted folder id: %w", err)
	}

	var createdAt time.Time
	err = s.db.QueryRowContext(ctx, `SELECT created_at FROM folders WHERE id = ?`, id).Scan(&createdAt)
	if err != nil {
		return Folder{}, fmt.Errorf("failed to read created folder: %w", err)
	}

	return Folder{
		ID:        id,
		Name:      name,
		ParentID:  parentID,
		CreatedAt: createdAt,
	}, nil
}

func (s *MySQLStore) ListFolders(ctx context.Context) ([]Folder, error) {
	query := `
		SELECT id, name, parent_id, created_at
		FROM folders
		WHERE deleted_at IS NULL AND parent_id IS NULL
		ORDER BY created_at DESC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list folders: %w", err)
	}
	defer rows.Close()

	var list []Folder
	for rows.Next() {
		var f Folder
		var parent sql.NullInt64
		if err := rows.Scan(&f.ID, &f.Name, &parent, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan folder row: %w", err)
		}
		if parent.Valid {
			f.ParentID = &parent.Int64
		}
		list = append(list, f)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating folder rows: %w", err)
	}

	return list, nil
}
