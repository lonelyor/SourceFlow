package model

import (
	dbsql "database/sql"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

type AssistantTerminalProfile struct {
	ID        string            `json:"id"`
	Name      string            `json:"name"`
	Shell     string            `json:"shell"`
	Args      []string          `json:"args"`
	Cwd       string            `json:"cwd"`
	Env       map[string]string `json:"env"`
	IsDefault bool              `json:"isDefault"`
	CreatedAt int64             `json:"createdAt"`
	UpdatedAt int64             `json:"updatedAt"`
}

type AssistantTerminalSession struct {
	ID        string   `json:"id"`
	ProfileID string   `json:"profileId"`
	Title     string   `json:"title"`
	Shell     string   `json:"shell"`
	Cwd       string   `json:"cwd"`
	Args      []string `json:"args"`
	Status    string   `json:"status"`
	StartedAt int64    `json:"startedAt"`
	EndedAt   int64    `json:"endedAt"`
	CreatedAt int64    `json:"createdAt"`
	UpdatedAt int64    `json:"updatedAt"`
}

func ListAssistantTerminalProfiles() (ret []*AssistantTerminalProfile, err error) {
	ret = []*AssistantTerminalProfile{}
	db, err := getAssistantTerminalDB()
	if err != nil {
		return nil, err
	}
	if err = bootstrapAssistantTerminalProfiles(db); err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT id, name, shell, args_json, cwd, env_json, is_default, created_at, updated_at
        FROM terminal_profiles ORDER BY is_default DESC, updated_at DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		profile, scanErr := scanAssistantTerminalProfile(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, profile)
	}
	return ret, rows.Err()
}

func GetAssistantTerminalProfile(id string) (ret *AssistantTerminalProfile, err error) {
	db, err := getAssistantTerminalDB()
	if err != nil {
		return nil, err
	}
	if err = bootstrapAssistantTerminalProfiles(db); err != nil {
		return nil, err
	}

	query := `SELECT id, name, shell, args_json, cwd, env_json, is_default, created_at, updated_at FROM terminal_profiles `
	args := []interface{}{}
	id = strings.TrimSpace(id)
	if "" != id {
		query += `WHERE id = ? LIMIT 1`
		args = append(args, id)
	} else {
		query += `ORDER BY is_default DESC, updated_at DESC, created_at DESC LIMIT 1`
	}
	row := db.QueryRow(query, args...)
	ret, err = scanAssistantTerminalProfile(row)
	if err == dbsql.ErrNoRows {
		return nil, fmt.Errorf("assistant terminal profile not found")
	}
	return ret, err
}

func ListAssistantTerminalSessions() (ret []*AssistantTerminalSession, err error) {
	ret = []*AssistantTerminalSession{}
	db, err := getAssistantTerminalDB()
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT id, profile_id, title, shell, cwd, args_json, status, started_at, ended_at, created_at, updated_at
        FROM terminal_sessions ORDER BY updated_at DESC, created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		session, scanErr := scanAssistantTerminalSession(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, session)
	}
	return ret, rows.Err()
}

func GetAssistantTerminalSession(id string) (ret *AssistantTerminalSession, err error) {
	db, err := getAssistantTerminalDB()
	if err != nil {
		return nil, err
	}
	row := db.QueryRow(`SELECT id, profile_id, title, shell, cwd, args_json, status, started_at, ended_at, created_at, updated_at
        FROM terminal_sessions WHERE id = ? LIMIT 1`, strings.TrimSpace(id))
	ret, err = scanAssistantTerminalSession(row)
	if err == dbsql.ErrNoRows {
		return nil, fmt.Errorf("assistant terminal session not found")
	}
	return ret, err
}

func CreateAssistantTerminalSession(profileID string) (ret *AssistantTerminalSession, err error) {
	profile, err := GetAssistantTerminalProfile(profileID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UnixMilli()
	ret = &AssistantTerminalSession{
		ID:        ast.NewNodeID(),
		ProfileID: profile.ID,
		Title:     profile.Name,
		Shell:     profile.Shell,
		Cwd:       normalizeAssistantTerminalCwd(profile.Cwd),
		Args:      append([]string{}, profile.Args...),
		Status:    "idle",
		CreatedAt: now,
		UpdatedAt: now,
	}

	db, err := getAssistantTerminalDB()
	if err != nil {
		return nil, err
	}
	argsJSON, err := json.Marshal(ret.Args)
	if err != nil {
		return nil, err
	}

	tx, err := db.Begin()
	if err != nil {
		return nil, err
	}
	defer rollbackAssistantTerminalTx(tx)

	if _, err = tx.Exec(`INSERT INTO terminal_sessions (id, profile_id, title, shell, cwd, args_json, status, started_at, ended_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
		ret.ID, ret.ProfileID, ret.Title, ret.Shell, ret.Cwd, string(argsJSON), ret.Status, ret.CreatedAt, ret.UpdatedAt); err != nil {
		return nil, err
	}
	if _, err = tx.Exec(`INSERT INTO terminal_tabs (id, session_id, title, sort, is_active, created_at, updated_at)
        VALUES (?, ?, ?, 0, 1, ?, ?)`, ret.ID, ret.ID, ret.Title, now, now); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return ret, nil
}

func DeleteAssistantTerminalSession(id string) (err error) {
	db, err := getAssistantTerminalDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM terminal_sessions WHERE id = ?`, strings.TrimSpace(id))
	return err
}

func UpdateAssistantTerminalSessionStatus(id, status string, startedAt, endedAt int64) (err error) {
	db, err := getAssistantTerminalDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE terminal_sessions SET status = ?, started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?`,
		strings.TrimSpace(status), startedAt, endedAt, time.Now().UnixMilli(), strings.TrimSpace(id))
	return err
}

func RecordAssistantTerminalCommand(sessionID, command string) (err error) {
	command = strings.TrimSpace(command)
	if "" == command {
		return nil
	}
	db, err := getAssistantTerminalDB()
	if err != nil {
		return err
	}
	now := time.Now().UnixMilli()
	_, err = db.Exec(`INSERT INTO terminal_commands (id, session_id, tab_id, command, exit_code, started_at, ended_at, created_at)
        VALUES (?, ?, ?, ?, 0, ?, 0, ?)`, ast.NewNodeID(), strings.TrimSpace(sessionID), strings.TrimSpace(sessionID), command, now, now)
	return err
}

func bootstrapAssistantTerminalProfiles(db *dbsql.DB) (err error) {
	rows, err := db.Query(`SELECT name, shell FROM terminal_profiles`)
	if err != nil {
		return err
	}
	defer rows.Close()

	existingNames := map[string]struct{}{}
	existingShells := map[string]struct{}{}
	for rows.Next() {
		var name, shell string
		if err = rows.Scan(&name, &shell); err != nil {
			return err
		}
		existingNames[normalizeAssistantTerminalProfileName(name)] = struct{}{}
		if shellKey := normalizeAssistantTerminalProfileShell(shell); "" != shellKey {
			existingShells[shellKey] = struct{}{}
		}
	}
	if err = rows.Err(); err != nil {
		return err
	}

	now := time.Now().UnixMilli()
	defaults := getAssistantTerminalDefaultProfiles(now)
	for _, profile := range defaults {
		nameKey := normalizeAssistantTerminalProfileName(profile.Name)
		shellKey := normalizeAssistantTerminalProfileShell(profile.Shell)
		if _, ok := existingNames[nameKey]; ok {
			continue
		}
		if "" != shellKey {
			if _, ok := existingShells[shellKey]; ok {
				continue
			}
		}
		argsJSON, marshalErr := json.Marshal(profile.Args)
		if marshalErr != nil {
			return marshalErr
		}
		envJSON, marshalErr := json.Marshal(profile.Env)
		if marshalErr != nil {
			return marshalErr
		}
		if _, err = db.Exec(`INSERT INTO terminal_profiles (id, name, shell, args_json, cwd, env_json, is_default, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			profile.ID, profile.Name, profile.Shell, string(argsJSON), profile.Cwd, string(envJSON), boolToInt(profile.IsDefault), profile.CreatedAt, profile.UpdatedAt); err != nil {
			return err
		}
		existingNames[nameKey] = struct{}{}
		if "" != shellKey {
			existingShells[shellKey] = struct{}{}
		}
	}
	return nil
}

func getAssistantTerminalDefaultProfiles(now int64) (ret []*AssistantTerminalProfile) {
	cwd := normalizeAssistantTerminalCwd(util.WorkingDir)
	if runtime.GOOS == "windows" {
		ret = append(ret, &AssistantTerminalProfile{
			ID:        ast.NewNodeID(),
			Name:      "PowerShell",
			Shell:     firstAssistantTerminalLookup("pwsh.exe", "powershell.exe"),
			Args:      []string{"-NoLogo"},
			Cwd:       cwd,
			Env:       map[string]string{},
			IsDefault: true,
			CreatedAt: now,
			UpdatedAt: now,
		})
		ret = append(ret, &AssistantTerminalProfile{
			ID:        ast.NewNodeID(),
			Name:      "Command Prompt",
			Shell:     firstAssistantTerminalLookup("cmd.exe"),
			Args:      []string{},
			Cwd:       cwd,
			Env:       map[string]string{},
			CreatedAt: now,
			UpdatedAt: now,
		})
		if wslShell := firstAssistantTerminalLookup("wsl.exe"); "" != wslShell {
			ret = append(ret, &AssistantTerminalProfile{
				ID:        ast.NewNodeID(),
				Name:      "WSL",
				Shell:     wslShell,
				Args:      []string{},
				Cwd:       cwd,
				Env:       map[string]string{},
				CreatedAt: now,
				UpdatedAt: now,
			})
		}
		return ret
	}

	ret = append(ret, &AssistantTerminalProfile{
		ID:        ast.NewNodeID(),
		Name:      "Shell",
		Shell:     firstAssistantTerminalLookup("bash", "zsh", "sh"),
		Args:      []string{"-l"},
		Cwd:       cwd,
		Env:       map[string]string{},
		IsDefault: true,
		CreatedAt: now,
		UpdatedAt: now,
	})
	return ret
}

func scanAssistantTerminalProfile(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantTerminalProfile, err error) {
	ret = &AssistantTerminalProfile{}
	var argsJSON, envJSON string
	var isDefault int
	if err = scanner.Scan(&ret.ID, &ret.Name, &ret.Shell, &argsJSON, &ret.Cwd, &envJSON, &isDefault, &ret.CreatedAt, &ret.UpdatedAt); err != nil {
		return nil, err
	}
	ret.IsDefault = 1 == isDefault
	if err = json.Unmarshal([]byte(firstAssistantTerminalNonEmpty(argsJSON, "[]")), &ret.Args); err != nil {
		return nil, err
	}
	if err = json.Unmarshal([]byte(firstAssistantTerminalNonEmpty(envJSON, "{}")), &ret.Env); err != nil {
		return nil, err
	}
	ret.Cwd = normalizeAssistantTerminalCwd(ret.Cwd)
	if nil == ret.Args {
		ret.Args = []string{}
	}
	if nil == ret.Env {
		ret.Env = map[string]string{}
	}
	return ret, nil
}

func scanAssistantTerminalSession(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantTerminalSession, err error) {
	ret = &AssistantTerminalSession{}
	var argsJSON string
	if err = scanner.Scan(&ret.ID, &ret.ProfileID, &ret.Title, &ret.Shell, &ret.Cwd, &argsJSON, &ret.Status, &ret.StartedAt, &ret.EndedAt, &ret.CreatedAt, &ret.UpdatedAt); err != nil {
		return nil, err
	}
	if err = json.Unmarshal([]byte(firstAssistantTerminalNonEmpty(argsJSON, "[]")), &ret.Args); err != nil {
		return nil, err
	}
	ret.Cwd = normalizeAssistantTerminalCwd(ret.Cwd)
	if nil == ret.Args {
		ret.Args = []string{}
	}
	return ret, nil
}

func rollbackAssistantTerminalTx(tx *dbsql.Tx) {
	if nil != tx {
		_ = tx.Rollback()
	}
}

func firstAssistantTerminalLookup(names ...string) string {
	for _, name := range names {
		if path, err := exec.LookPath(name); err == nil && strings.TrimSpace(path) != "" {
			return path
		}
		if runtime.GOOS == "windows" {
			if windir := strings.TrimSpace(os.Getenv("WINDIR")); "" != windir {
				candidates := []string{
					filepath.Join(windir, "System32", name),
					filepath.Join(windir, "Sysnative", name),
				}
				for _, candidate := range candidates {
					if stat, statErr := os.Stat(candidate); statErr == nil && !stat.IsDir() {
						return candidate
					}
				}
			}
		}
	}
	if 0 < len(names) {
		return names[0]
	}
	return ""
}

func firstAssistantTerminalNonEmpty(values ...string) string {
	for _, value := range values {
		if "" != strings.TrimSpace(value) {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizeAssistantTerminalCwd(values ...string) string {
	candidates := append([]string{}, values...)
	candidates = append(candidates, util.WorkingDir, util.WorkspaceDir, util.DataDir, util.HomeDir, os.TempDir())
	for _, value := range candidates {
		dir := strings.TrimSpace(value)
		if "" == dir {
			continue
		}
		if stat, err := os.Stat(dir); nil == err && stat.IsDir() {
			return dir
		}
	}
	return "."
}

func normalizeAssistantTerminalProfileName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func normalizeAssistantTerminalProfileShell(shell string) string {
	shell = strings.TrimSpace(shell)
	if "" == shell {
		return ""
	}
	shell = strings.Trim(shell, `"`)
	return strings.ToLower(filepath.Base(shell))
}
