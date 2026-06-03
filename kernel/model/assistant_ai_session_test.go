package model

import (
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/kernel/util"
)

func withAssistantAISessionTestDB(t *testing.T) {
	t.Helper()

	oldDataDir := util.DataDir
	assistantAIDBLock.Lock()
	oldDB := assistantAIDB
	assistantAIDB = nil
	assistantAIDBLock.Unlock()

	util.DataDir = t.TempDir()
	t.Cleanup(func() {
		assistantAIDBLock.Lock()
		if assistantAIDB != nil {
			if err := assistantAIDB.Close(); err != nil {
				t.Errorf("close assistant AI test DB: %s", err)
			}
		}
		assistantAIDB = oldDB
		assistantAIDBLock.Unlock()
		util.DataDir = oldDataDir
	})
}

func TestAssistantAISessionPinningSortsAndPersists(t *testing.T) {
	withAssistantAISessionTestDB(t)

	profile, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		Model:    "sourceflow-fake-chat",
	})
	if err != nil {
		t.Fatalf("save fake profile: %s", err)
	}

	first, err := CreateAssistantAISession(profile.ID, "chat", "First")
	if err != nil {
		t.Fatalf("create first session: %s", err)
	}
	time.Sleep(2 * time.Millisecond)
	second, err := CreateAssistantAISession(profile.ID, "chat", "Second")
	if err != nil {
		t.Fatalf("create second session: %s", err)
	}

	if err = SetAssistantAISessionPinned(first.ID, true); err != nil {
		t.Fatalf("pin first session: %s", err)
	}
	sessions, err := ListAssistantAISessions()
	if err != nil {
		t.Fatalf("list sessions after pin: %s", err)
	}
	if len(sessions) != 2 {
		t.Fatalf("sessions length = %d, want 2", len(sessions))
	}
	if sessions[0].ID != first.ID {
		t.Fatalf("pinned session should sort first, got %s", sessions[0].ID)
	}
	if sessions[0].PinnedAt <= 0 {
		t.Fatal("pinned session should expose pinnedAt")
	}
	firstPinnedAt := sessions[0].PinnedAt

	if err = SetAssistantAISessionPinned(first.ID, true); err != nil {
		t.Fatalf("pin first session again: %s", err)
	}
	pinnedAgain, err := GetAssistantAISession(first.ID)
	if err != nil {
		t.Fatalf("read pinned session again: %s", err)
	}
	if pinnedAgain.PinnedAt != firstPinnedAt {
		t.Fatalf("repeated pin should be idempotent, got pinnedAt %d want %d", pinnedAgain.PinnedAt, firstPinnedAt)
	}

	if err = SetAssistantAISessionPinned(first.ID, false); err != nil {
		t.Fatalf("unpin first session: %s", err)
	}
	sessions, err = ListAssistantAISessions()
	if err != nil {
		t.Fatalf("list sessions after unpin: %s", err)
	}
	if sessions[0].ID != second.ID {
		t.Fatalf("unpinned sessions should return to update order, got %s", sessions[0].ID)
	}
}

func TestAssistantAIProfileSanitizeAndBlankSavePreservesAPIKey(t *testing.T) {
	withAssistantAISessionTestDB(t)

	created, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:     "Fake",
		Provider: AssistantAIProviderFake,
		BaseURL:  "sourceflow://fake",
		APIKey:   "secret-key",
		Model:    "sourceflow-fake-chat",
	})
	if err != nil {
		t.Fatalf("save profile with API key: %s", err)
	}

	views := SanitizeAssistantAIProfiles([]*AssistantAIProfile{created})
	if len(views) != 1 {
		t.Fatalf("sanitized profile length = %d, want 1", len(views))
	}
	if views[0].APIKey != "" {
		t.Fatalf("sanitized profile should hide API key, got %q", views[0].APIKey)
	}
	if !views[0].HasAPIKey {
		t.Fatal("sanitized profile should expose hasAPIKey")
	}

	updated, err := SaveAssistantAIProfile(&AssistantAIProfile{
		ID:        created.ID,
		Name:      "Fake Updated",
		Provider:  AssistantAIProviderFake,
		BaseURL:   "sourceflow://fake",
		APIKey:    "",
		Model:     "sourceflow-fake-chat",
		IsDefault: created.IsDefault,
		Settings:  created.Settings,
	})
	if err != nil {
		t.Fatalf("save profile with blank API key: %s", err)
	}
	if updated.APIKey != "secret-key" {
		t.Fatalf("blank API key save should preserve existing key, got %q", updated.APIKey)
	}

	loaded, err := GetAssistantAIProfile(created.ID)
	if err != nil {
		t.Fatalf("load profile: %s", err)
	}
	if loaded.APIKey != "secret-key" {
		t.Fatalf("stored API key should be preserved, got %q", loaded.APIKey)
	}
}
