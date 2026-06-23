package model

import (
	dbsql "database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lonelyor/sourceflow/third_party/go/lute/ast"
)

func ListAssistantAISessions() (ret []*AssistantAISession, err error) {
	ret = []*AssistantAISession{}
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}

	rows, err := db.Query(`SELECT ` + assistantAISessionSelectClause + `
        FROM ai_sessions s
        LEFT JOIN ai_session_stats st ON st.session_id = s.id
        ORDER BY ` + assistantAISessionOrderClause)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		session, scanErr := scanAssistantAISession(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, session)
	}
	return ret, rows.Err()
}

func CreateAssistantAISession(profileID, mode, title string) (ret *AssistantAISession, err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return createAssistantAISession0(db, strings.TrimSpace(profileID), strings.TrimSpace(mode), strings.TrimSpace(title))
}

func GetAssistantAISession(id string) (ret *AssistantAISession, err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return getAssistantAISession0(db, strings.TrimSpace(id))
}

func RenameAssistantAISession(id, title string) (err error) {
	id = strings.TrimSpace(id)
	title = strings.TrimSpace(title)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}
	if "" == title {
		return fmt.Errorf("assistant AI session title is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`UPDATE ai_sessions SET title = ?, updated_at = ? WHERE id = ?`, title, time.Now().UnixMilli(), id)
	return err
}

func SetAssistantAISessionPinned(id string, pinned bool) (err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}
	pinnedAt := int64(0)
	query := `UPDATE ai_sessions SET pinned_at = ? WHERE id = ?`
	args := []interface{}{pinnedAt, id}
	if pinned {
		pinnedAt = time.Now().UnixMilli()
		query = `UPDATE ai_sessions SET pinned_at = CASE WHEN pinned_at > 0 THEN pinned_at ELSE ? END WHERE id = ?`
		args[0] = pinnedAt
	}
	result, err := db.Exec(query, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return fmt.Errorf("assistant AI session not found")
	}
	return nil
}

func DeleteAssistantAISession(id string) (err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}
	_, err = db.Exec(`DELETE FROM ai_sessions WHERE id = ?`, id)
	return err
}

func ClearAssistantAISession(id string) (err error) {
	id = strings.TrimSpace(id)
	if "" == id {
		return fmt.Errorf("assistant AI session ID is required")
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer rollbackAssistantAITx(tx)

	if _, err = tx.Exec(`DELETE FROM ai_messages WHERE session_id = ?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_session_stats WHERE session_id = ?`, id); err != nil {
		return err
	}
	if _, err = tx.Exec(`UPDATE ai_sessions SET updated_at = ? WHERE id = ?`, time.Now().UnixMilli(), id); err != nil {
		return err
	}
	return tx.Commit()
}

func ClearAllAssistantAISessions() (err error) {
	db, err := getAssistantAIDB()
	if err != nil {
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer rollbackAssistantAITx(tx)

	if _, err = tx.Exec(`DELETE FROM ai_messages`); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_session_stats`); err != nil {
		return err
	}
	if _, err = tx.Exec(`DELETE FROM ai_sessions`); err != nil {
		return err
	}
	return tx.Commit()
}

func GetAssistantAISessionMessages(sessionID string) (ret []*AssistantAIMessage, err error) {
	sessionID = strings.TrimSpace(sessionID)
	if "" == sessionID {
		return []*AssistantAIMessage{}, nil
	}

	db, err := getAssistantAIDB()
	if err != nil {
		return nil, err
	}
	return listAssistantAISessionMessages(db, sessionID, 0)
}

func createAssistantAISession0(db *dbsql.DB, profileID, mode, title string) (ret *AssistantAISession, err error) {
	if "" == profileID {
		if profile, profileErr := getAssistantAIProfile0(db, ""); nil == profileErr && nil != profile {
			profileID = profile.ID
		}
	}
	if "" == mode {
		mode = "chat"
	}
	if "" == title {
		title = "New Chat"
	}

	now := time.Now().UnixMilli()
	ret = &AssistantAISession{
		ID:        ast.NewNodeID(),
		ProfileID: profileID,
		Mode:      mode,
		Title:     title,
		Summary:   "",
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err = db.Exec(`INSERT INTO ai_sessions (id, profile_id, mode, title, summary, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, ?)`,
		ret.ID, ret.ProfileID, ret.Mode, ret.Title, ret.CreatedAt, ret.UpdatedAt)
	return ret, err
}

func getAssistantAIProfile0(db *dbsql.DB, id string) (ret *AssistantAIProfile, err error) {
	query := `SELECT id, name, provider, base_url, api_key, model, user_agent, proxy, version, is_default, settings, created_at, updated_at FROM ai_profiles `
	args := []interface{}{}
	if "" != id {
		query += `WHERE id = ? LIMIT 1`
		args = append(args, id)
	} else {
		query += `ORDER BY is_default DESC, updated_at DESC, created_at DESC LIMIT 1`
	}

	row := db.QueryRow(query, args...)
	ret, err = scanAssistantAIProfile(row)
	if err == dbsql.ErrNoRows {
		return nil, fmt.Errorf("assistant AI profile not found")
	}
	return ret, err
}

func getAssistantAISession0(db *dbsql.DB, id string) (ret *AssistantAISession, err error) {
	row := db.QueryRow(`SELECT `+assistantAISessionSelectClause+`
        FROM ai_sessions s LEFT JOIN ai_session_stats st ON st.session_id = s.id WHERE s.id = ? LIMIT 1`, id)
	ret, err = scanAssistantAISession(row)
	if err == dbsql.ErrNoRows {
		return nil, fmt.Errorf("assistant AI session not found")
	}
	return ret, err
}

func scanAssistantAISession(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantAISession, err error) {
	ret = &AssistantAISession{}
	err = scanner.Scan(&ret.ID, &ret.ProfileID, &ret.Mode, &ret.Title, &ret.Summary, &ret.PinnedAt, &ret.CreatedAt, &ret.UpdatedAt, &ret.MessageCount, &ret.UserMessageCount, &ret.AssistantMessageCount, &ret.LastMessageAt)
	return ret, err
}

func insertAssistantAIMessageTx(tx *dbsql.Tx, msg *AssistantAIMessage) (err error) {
	metadataJSON, err := marshalAssistantAIMap(msg.Metadata)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO ai_messages (id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		msg.ID, msg.SessionID, msg.Role, msg.Content, msg.ProviderMessageID, msg.InputTokens, msg.OutputTokens, string(metadataJSON), msg.CreatedAt)
	return err
}

func updateAssistantAIMessageTx(tx *dbsql.Tx, msg *AssistantAIMessage) (err error) {
	metadataJSON, err := marshalAssistantAIMap(msg.Metadata)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE ai_messages
        SET content = ?, provider_message_id = ?, input_tokens = ?, output_tokens = ?, metadata = ?, created_at = ?
        WHERE id = ?`,
		msg.Content, msg.ProviderMessageID, msg.InputTokens, msg.OutputTokens, string(metadataJSON), msg.CreatedAt, msg.ID)
	return err
}

func syncAssistantAISessionStatsTx(tx *dbsql.Tx, sessionID string) (err error) {
	var messageCount, userMessageCount, assistantMessageCount int
	var lastMessageAt int64
	if err = tx.QueryRow(`SELECT COUNT(1),
        COALESCE(SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END), 0),
        COALESCE(MAX(created_at), 0)
        FROM ai_messages WHERE session_id = ?`, sessionID).Scan(&messageCount, &userMessageCount, &assistantMessageCount, &lastMessageAt); err != nil {
		return err
	}
	_, err = tx.Exec(`INSERT INTO ai_session_stats (session_id, message_count, user_message_count, assistant_message_count, last_message_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
            message_count = excluded.message_count,
            user_message_count = excluded.user_message_count,
            assistant_message_count = excluded.assistant_message_count,
            last_message_at = excluded.last_message_at`,
		sessionID, messageCount, userMessageCount, assistantMessageCount, lastMessageAt)
	if err != nil {
		return err
	}
	_, err = tx.Exec(`UPDATE ai_sessions SET updated_at = ? WHERE id = ?`, maxAssistantAIInt64(lastMessageAt, time.Now().UnixMilli()), sessionID)
	return err
}

func listAssistantAISessionMessages(db *dbsql.DB, sessionID string, limit int) (ret []*AssistantAIMessage, err error) {
	ret = []*AssistantAIMessage{}
	query := `SELECT id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at
        FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC, rowid ASC`
	args := []interface{}{sessionID}
	if 0 < limit {
		query = `SELECT id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at
            FROM (
                SELECT id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at, rowid
                FROM ai_messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?
            ) ORDER BY created_at ASC, rowid ASC`
		args = append(args, limit)
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		msg, scanErr := scanAssistantAIMessage(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		ret = append(ret, msg)
	}
	return ret, rows.Err()
}

func deleteAssistantAISessionMessagesAfterTx(tx *dbsql.Tx, sessionID string, createdAt, rowID int64) (err error) {
	if nil == tx {
		return nil
	}
	_, err = tx.Exec(`DELETE FROM ai_messages
        WHERE session_id = ? AND (created_at > ? OR (created_at = ? AND rowid > ?))`,
		sessionID, createdAt, createdAt, rowID)
	return err
}

func deleteAssistantAIToolAuditsAfterTx(tx *dbsql.Tx, sessionID string, createdAt int64) (err error) {
	if nil == tx {
		return nil
	}
	_, err = tx.Exec(`DELETE FROM ai_tool_audits WHERE session_id = ? AND created_at >= ?`, sessionID, createdAt)
	return err
}

func getAssistantAIMessagePosition0(db *dbsql.DB, sessionID, messageID string) (ret *AssistantAIMessage, rowID int64, err error) {
	row := db.QueryRow(`SELECT rowid, id, session_id, role, content, provider_message_id, input_tokens, output_tokens, metadata, created_at
        FROM ai_messages WHERE session_id = ? AND id = ? LIMIT 1`, sessionID, messageID)
	ret = &AssistantAIMessage{}
	var metadataJSON string
	if err = row.Scan(&rowID, &ret.ID, &ret.SessionID, &ret.Role, &ret.Content, &ret.ProviderMessageID, &ret.InputTokens, &ret.OutputTokens, &metadataJSON, &ret.CreatedAt); err != nil {
		if err == dbsql.ErrNoRows {
			return nil, 0, fmt.Errorf("assistant AI message not found")
		}
		return nil, 0, err
	}
	ret.Metadata = map[string]interface{}{}
	if "" != strings.TrimSpace(metadataJSON) {
		if err = json.Unmarshal([]byte(metadataJSON), &ret.Metadata); err != nil {
			return nil, 0, err
		}
	}
	if nil == ret.Metadata {
		ret.Metadata = map[string]interface{}{}
	}
	return ret, rowID, nil
}

func scanAssistantAIMessage(scanner interface {
	Scan(dest ...interface{}) error
}) (ret *AssistantAIMessage, err error) {
	ret = &AssistantAIMessage{}
	var metadataJSON string
	if err = scanner.Scan(&ret.ID, &ret.SessionID, &ret.Role, &ret.Content, &ret.ProviderMessageID, &ret.InputTokens, &ret.OutputTokens, &metadataJSON, &ret.CreatedAt); err != nil {
		return nil, err
	}
	ret.Metadata = map[string]interface{}{}
	if "" != strings.TrimSpace(metadataJSON) {
		if err = json.Unmarshal([]byte(metadataJSON), &ret.Metadata); err != nil {
			return nil, err
		}
	}
	if nil == ret.Metadata {
		ret.Metadata = map[string]interface{}{}
	}
	return ret, nil
}

func rollbackAssistantAITx(tx *dbsql.Tx) {
	if nil != tx {
		_ = tx.Rollback()
	}
}

func buildAssistantAISessionTitle(text string) string {
	text = strings.Join(strings.Fields(strings.ReplaceAll(strings.TrimSpace(text), "\n", " ")), " ")
	if "" == text {
		return "New Chat"
	}
	title := []rune(text)
	if 48 < len(title) {
		return string(title[:48])
	}
	return string(title)
}

func updateAssistantAISessionProfileTx(tx *dbsql.Tx, session *AssistantAISession, profile *AssistantAIProfile) (err error) {
	if nil == tx || nil == session || nil == profile || profile.ID == session.ProfileID {
		return nil
	}
	if _, err = tx.Exec(`UPDATE ai_sessions SET profile_id = ?, updated_at = ? WHERE id = ?`, profile.ID, time.Now().UnixMilli(), session.ID); err != nil {
		return err
	}
	session.ProfileID = profile.ID
	return nil
}

func maxAssistantAIInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
