-- Internal File Manager Database Schema

CREATE DATABASE IF NOT EXISTS filemanager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE filemanager;

-- Table for internal authentication
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table for virtual directory structure
CREATE TABLE IF NOT EXISTS folders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    parent_id INT DEFAULT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Table for file metadata
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nama_file_asli VARCHAR(255) NOT NULL,
    nama_file_sistem VARCHAR(255) NOT NULL UNIQUE,
    path VARCHAR(500) NOT NULL,
    ukuran BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    jumlah_download BIGINT NOT NULL DEFAULT 0,
    jumlah_share BIGINT NOT NULL DEFAULT 0,
    is_starred TINYINT(1) NOT NULL DEFAULT 0,
    folder_id INT DEFAULT NULL,
    id_pengunggah INT DEFAULT NULL,
    waktu_diunggah TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    waktu_dihapus TIMESTAMP NULL DEFAULT NULL, -- untuk soft-delete
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE,
    FOREIGN KEY (id_pengunggah) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert a default admin user (password should be changed)
-- password_hash is just a placeholder here, it should be generated securely (e.g. bcrypt)
INSERT IGNORE INTO users (username, password_hash, role) VALUES ('admin', '$2a$10$xyz...', 'admin');
