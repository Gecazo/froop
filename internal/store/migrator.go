package store

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

func (s *Store) runMigrations(ctx context.Context) error {
	createMigrationsTable := `CREATE TABLE IF NOT EXISTS schema_migrations (
		version TEXT PRIMARY KEY,
		applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
	);`
	if _, err := s.db.ExecContext(ctx, createMigrationsTable); err != nil {
		return err
	}

	entries, err := fs.ReadDir(migrationFS, "migrations")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)

	for _, name := range names {
		applied, err := s.isMigrationApplied(ctx, name)
		if err != nil {
			return err
		}
		if applied {
			continue
		}
		content, err := fs.ReadFile(migrationFS, "migrations/"+name)
		if err != nil {
			return err
		}
		section := migrationSection(string(content), s.dialect)
		if strings.TrimSpace(section) == "" {
			return fmt.Errorf("migration %s has no %s section", name, s.dialect)
		}
		if err := s.execStatements(ctx, section); err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
		if _, err := s.db.ExecContext(ctx, rebind(`INSERT INTO schema_migrations(version) VALUES (?)`, s.dialect), name); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) isMigrationApplied(ctx context.Context, version string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx, rebind(`SELECT COUNT(1) FROM schema_migrations WHERE version = ?`, s.dialect), version).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func migrationSection(content string, dialect Dialect) string {
	current := ""
	collecting := false
	var b strings.Builder
	for _, line := range strings.Split(content, "\n") {
		trim := strings.TrimSpace(line)
		if strings.HasPrefix(trim, "-- +") {
			marker := strings.TrimPrefix(trim, "-- +")
			current = strings.TrimSpace(marker)
			collecting = current == string(dialect)
			continue
		}
		if collecting {
			b.WriteString(line)
			b.WriteByte('\n')
		}
	}
	return b.String()
}

func (s *Store) execStatements(ctx context.Context, section string) error {
	for _, stmt := range strings.Split(section, ";") {
		q := strings.TrimSpace(stmt)
		if q == "" {
			continue
		}
		if _, err := s.db.ExecContext(ctx, q); err != nil {
			msg := strings.ToLower(err.Error())
			if strings.Contains(msg, "duplicate column") ||
				strings.Contains(msg, "already exists") ||
				strings.Contains(msg, "duplicate key") {
				continue
			}
			return err
		}
	}
	return nil
}
