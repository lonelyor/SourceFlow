package model

import (
	dbsql "database/sql"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
)

var (
	assistantTerminalDB     *dbsql.DB
	assistantTerminalDBLock sync.Mutex
)

func EnsureAssistantTerminalStore() error {
	_, err := getAssistantTerminalDB()
	return err
}

func getAssistantTerminalDB() (ret *dbsql.DB, err error) {
	assistantTerminalDBLock.Lock()
	defer assistantTerminalDBLock.Unlock()

	if nil != assistantTerminalDB {
		return assistantTerminalDB, nil
	}

	storageDir := filepath.Join(util.DataDir, "storage")
	if err = os.MkdirAll(storageDir, 0755); err != nil {
		return nil, err
	}
	dbPath := filepath.Join(storageDir, "assistant_terminal.db")
	util.LogDatabaseSize(dbPath)

	dsn := dbPath + "?_journal_mode=WAL" +
		"&_synchronous=NORMAL" +
		"&_busy_timeout=7000" +
		"&_foreign_keys=ON" +
		"&_temp_store=MEMORY"
	db, err := dbsql.Open("sqlite3_extended", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxIdleConns(4)
	db.SetMaxOpenConns(4)
	db.SetConnMaxLifetime(365 * 24 * time.Hour)

	if err = initAssistantTerminalTables(db); err != nil {
		_ = db.Close()
		return nil, err
	}

	assistantTerminalDB = db
	return assistantTerminalDB, nil
}

func initAssistantTerminalTables(db *dbsql.DB) (err error) {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS terminal_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            shell TEXT NOT NULL,
            args_json TEXT NOT NULL DEFAULT '[]',
            cwd TEXT NOT NULL DEFAULT '',
            env_json TEXT NOT NULL DEFAULT '{}',
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )`,
		`CREATE TABLE IF NOT EXISTS terminal_sessions (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL,
            shell TEXT NOT NULL,
            cwd TEXT NOT NULL DEFAULT '',
            args_json TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'idle',
            started_at INTEGER NOT NULL DEFAULT 0,
            ended_at INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(profile_id) REFERENCES terminal_profiles(id) ON DELETE SET DEFAULT
        )`,
		`CREATE INDEX IF NOT EXISTS idx_terminal_sessions_updated_at ON terminal_sessions(updated_at DESC)`,
		`CREATE TABLE IF NOT EXISTS terminal_tabs (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            title TEXT NOT NULL,
            sort INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
        )`,
		`CREATE INDEX IF NOT EXISTS idx_terminal_tabs_session_sort ON terminal_tabs(session_id, sort)`,
		`CREATE TABLE IF NOT EXISTS terminal_commands (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            tab_id TEXT NOT NULL DEFAULT '',
            command TEXT NOT NULL,
            exit_code INTEGER NOT NULL DEFAULT 0,
            started_at INTEGER NOT NULL DEFAULT 0,
            ended_at INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            FOREIGN KEY(session_id) REFERENCES terminal_sessions(id) ON DELETE CASCADE
        )`,
		`CREATE INDEX IF NOT EXISTS idx_terminal_commands_session_created_at ON terminal_commands(session_id, created_at DESC)`,
	}
	for _, stmt := range statements {
		if _, err = db.Exec(stmt); err != nil {
			return err
		}
	}
	return nil
}
