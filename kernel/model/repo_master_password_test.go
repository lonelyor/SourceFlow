package model

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
)

func TestRepoMasterPasswordEnvelopeRoundTrip(t *testing.T) {
	repoKey := bytes.Repeat([]byte{0x42}, 32)
	envelope, err := wrapRepoKey(repoKey, "correct horse battery staple")
	if nil != err {
		t.Fatal(err)
	}
	if "" == envelope.Ciphertext || "" == envelope.Salt {
		t.Fatal("encrypted envelope metadata is incomplete")
	}
	decrypted, err := unwrapRepoKey(envelope, "correct horse battery staple")
	if nil != err {
		t.Fatal(err)
	}
	if !bytes.Equal(repoKey, decrypted) {
		t.Fatal("unwrapped repository key does not match")
	}
	if _, err = unwrapRepoKey(envelope, "wrong password"); nil == err {
		t.Fatal("wrong master password must not unlock the repository key")
	}
}

func TestSyncBackupProfileContainsNoPlaintextSecrets(t *testing.T) {
	previous := Conf
	defer func() { Conf = previous }()
	Conf = &AppConf{
		Sync: &conf.Sync{Provider: conf.ProviderWebDAV, CloudName: "main", WebDAV: &conf.WebDAV{
			Endpoint: "https://nas.example.test:5006/sourceflow", Username: "backup-user", Password: "plain-webdav-password",
		}},
		Repo: &conf.Repo{Key: bytes.Repeat([]byte{0x24}, 32), KeyEnvelope: &conf.RepoKeyEnvelope{
			Version: 1, KDF: "scrypt-32768-8-1", Salt: "safe-salt", Ciphertext: "encrypted-key-envelope",
		}},
	}
	data, err := json.Marshal(newSyncBackupProfile())
	if nil != err {
		t.Fatal(err)
	}
	serialized := string(data)
	for _, forbidden := range []string{"plain-webdav-password", `"repoKey":`} {
		if strings.Contains(serialized, forbidden) {
			t.Fatalf("recovery profile leaked plaintext secret: %s", forbidden)
		}
	}
	if !strings.Contains(serialized, `"containsSecrets":false`) || !strings.Contains(serialized, `"repoKeyEnvelope"`) {
		t.Fatalf("recovery profile is missing safe key metadata: %s", serialized)
	}
	persisted, err := json.Marshal(Conf.cloneForSave())
	if nil != err {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"plain-webdav-password", base64.StdEncoding.EncodeToString(Conf.Repo.Key)} {
		if strings.Contains(string(persisted), forbidden) {
			t.Fatalf("workspace config leaked plaintext secret: %s", forbidden)
		}
	}
}
