// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors

package model

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"

	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/third_party/go/encryption"
)

const repoKeyEnvelopeVersion = 1

func SetRepoMasterPassword(password string) (keyBase64 string, err error) {
	password = strings.TrimSpace(password)
	if len([]rune(password)) < 8 {
		return "", errors.New("master password must contain at least 8 characters")
	}
	if nil == Conf || nil == Conf.Repo {
		return "", errors.New("repository configuration is unavailable")
	}
	newKey := false
	if 32 != len(Conf.Repo.Key) {
		Conf.Repo.Key = make([]byte, 32)
		if _, err = rand.Read(Conf.Repo.Key); nil != err {
			return "", err
		}
		newKey = true
	}
	Conf.Repo.KeyEnvelope, err = wrapRepoKey(Conf.Repo.Key, password)
	if nil != err {
		return "", err
	}
	Conf.Save()
	if newKey {
		initDataRepo()
	}
	return base64.StdEncoding.EncodeToString(Conf.Repo.Key), nil
}

func UnlockRepoWithMasterPassword(password string) (keyBase64 string, err error) {
	if nil == Conf || nil == Conf.Repo || nil == Conf.Repo.KeyEnvelope {
		return "", errors.New("master password has not been configured")
	}
	key, err := unwrapRepoKey(Conf.Repo.KeyEnvelope, password)
	if nil != err {
		return "", err
	}
	Conf.Repo.Key = key
	Conf.Repo.KeyConfigured = true
	return base64.StdEncoding.EncodeToString(key), nil
}

func wrapRepoKey(repoKey []byte, password string) (envelope *conf.RepoKeyEnvelope, err error) {
	salt := make([]byte, 16)
	if _, err = rand.Read(salt); nil != err {
		return
	}
	saltBase64 := base64.StdEncoding.EncodeToString(salt)
	wrappingKey, err := encryption.KDF(password, saltBase64)
	if nil != err {
		return nil, err
	}
	ciphertext, err := encryption.AesEncrypt(repoKey, wrappingKey)
	if nil != err {
		return nil, err
	}
	envelope = &conf.RepoKeyEnvelope{Version: repoKeyEnvelopeVersion, KDF: "scrypt-32768-8-1", Salt: saltBase64, Ciphertext: base64.StdEncoding.EncodeToString(ciphertext)}
	verified, err := unwrapRepoKey(envelope, password)
	if nil != err || string(verified) != string(repoKey) {
		return nil, errors.New("master password envelope verification failed")
	}
	return
}

func unwrapRepoKey(envelope *conf.RepoKeyEnvelope, password string) (key []byte, err error) {
	if nil == envelope {
		return nil, errors.New("master password has not been configured")
	}
	if repoKeyEnvelopeVersion != envelope.Version || "scrypt-32768-8-1" != envelope.KDF {
		return nil, errors.New("unsupported repository key envelope")
	}
	ciphertext, decodeErr := base64.StdEncoding.DecodeString(envelope.Ciphertext)
	if nil != decodeErr || 28 > len(ciphertext) {
		return nil, errors.New("invalid repository key envelope")
	}
	wrappingKey, err := encryption.KDF(strings.TrimSpace(password), envelope.Salt)
	if nil != err {
		return nil, err
	}
	key, err = encryption.AesDecrypt(ciphertext, wrappingKey)
	if nil != err || 32 != len(key) {
		return nil, errors.New("master password is incorrect")
	}
	return key, nil
}
