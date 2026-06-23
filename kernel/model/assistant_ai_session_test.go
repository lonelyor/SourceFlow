package model

import (
	"testing"
	"time"

	"github.com/lonelyor/sourceflow/kernel/conf"
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

func TestAssistantAIProfileAPIKeyActions(t *testing.T) {
	withAssistantAISessionTestDB(t)

	created, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:         "Fake",
		Provider:     AssistantAIProviderFake,
		BaseURL:      "sourceflow://fake",
		APIKey:       "secret-key",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "sourceflow-fake-chat",
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
		ID:           created.ID,
		Name:         "Fake Updated",
		Provider:     AssistantAIProviderFake,
		BaseURL:      "sourceflow://fake",
		APIKey:       "",
		APIKeyAction: AssistantAPIKeyActionKeep,
		Model:        "sourceflow-fake-chat",
		IsDefault:    created.IsDefault,
		Settings:     created.Settings,
	})
	if err != nil {
		t.Fatalf("save profile with keep API key action: %s", err)
	}
	if updated.APIKey != "secret-key" {
		t.Fatalf("keep API key action should preserve existing key, got %q", updated.APIKey)
	}

	cleared, err := SaveAssistantAIProfile(&AssistantAIProfile{
		ID:           created.ID,
		Name:         "Fake Cleared",
		Provider:     AssistantAIProviderFake,
		BaseURL:      "sourceflow://fake",
		APIKey:       "",
		APIKeyAction: AssistantAPIKeyActionClear,
		Model:        "sourceflow-fake-chat",
		IsDefault:    updated.IsDefault,
		Settings:     updated.Settings,
	})
	if err != nil {
		t.Fatalf("clear profile API key: %s", err)
	}
	if cleared.APIKey != "" || cleared.HasAPIKey {
		t.Fatalf("clear API key action should remove stored key, got key %q has %v", cleared.APIKey, cleared.HasAPIKey)
	}

	replaced, err := SaveAssistantAIProfile(&AssistantAIProfile{
		ID:           created.ID,
		Name:         "Fake Replaced",
		Provider:     AssistantAIProviderFake,
		BaseURL:      "sourceflow://fake",
		APIKey:       "new-secret",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "sourceflow-fake-chat",
		IsDefault:    cleared.IsDefault,
		Settings:     cleared.Settings,
	})
	if err != nil {
		t.Fatalf("replace profile API key: %s", err)
	}
	if replaced.APIKey != "new-secret" || !replaced.HasAPIKey {
		t.Fatalf("replace API key action should store new key, got key %q has %v", replaced.APIKey, replaced.HasAPIKey)
	}

	loaded, err := GetAssistantAIProfile(created.ID)
	if err != nil {
		t.Fatalf("load profile: %s", err)
	}
	if loaded.APIKey != "new-secret" {
		t.Fatalf("stored API key should be replaced, got %q", loaded.APIKey)
	}

	if _, err = SaveAssistantAIProfile(&AssistantAIProfile{
		ID:           created.ID,
		Name:         "Fake Invalid",
		Provider:     AssistantAIProviderFake,
		BaseURL:      "sourceflow://fake",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "sourceflow-fake-chat",
		IsDefault:    loaded.IsDefault,
		Settings:     loaded.Settings,
	}); err == nil {
		t.Fatal("replace API key action with blank key should fail")
	}
}

func TestAssistantAIProfileDoesNotSyncLegacyOpenAIConfig(t *testing.T) {
	withAssistantAISessionTestDB(t)
	oldConf := Conf
	Conf = &AppConf{AI: conf.NewAI()}
	Conf.AI.OpenAI.APIKey = "legacy-key"
	Conf.AI.OpenAI.APIModel = "legacy-model"
	t.Cleanup(func() {
		Conf = oldConf
	})

	if _, err := SaveAssistantAIProfile(&AssistantAIProfile{
		Name:         "Fake",
		Provider:     AssistantAIProviderFake,
		BaseURL:      "sourceflow://fake",
		APIKey:       "profile-key",
		APIKeyAction: AssistantAPIKeyActionReplace,
		Model:        "sourceflow-fake-chat",
	}); err != nil {
		t.Fatalf("save profile: %s", err)
	}

	if Conf.AI.OpenAI.APIKey != "legacy-key" {
		t.Fatalf("legacy OpenAI API key should not be synced from ai_profiles, got %q", Conf.AI.OpenAI.APIKey)
	}
	if Conf.AI.OpenAI.APIModel != "legacy-model" {
		t.Fatalf("legacy OpenAI model should not be synced from ai_profiles, got %q", Conf.AI.OpenAI.APIModel)
	}
}

func TestAssistantAIProfilesDoNotBootstrapFromLegacyOpenAIConfig(t *testing.T) {
	withAssistantAISessionTestDB(t)
	oldConf := Conf
	Conf = &AppConf{AI: conf.NewAI()}
	Conf.AI.OpenAI.APIKey = "legacy-key"
	Conf.AI.OpenAI.APIModel = "legacy-model"
	Conf.AI.OpenAI.APIBaseURL = "https://legacy.example.com/v1"
	t.Cleanup(func() {
		Conf = oldConf
	})

	profiles, err := ListAssistantAIProfiles()
	if err != nil {
		t.Fatalf("list profiles: %s", err)
	}
	if 0 != len(profiles) {
		t.Fatalf("legacy OpenAI config must not bootstrap assistant AI profiles, got %d", len(profiles))
	}
}
