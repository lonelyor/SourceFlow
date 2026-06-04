package model

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"
)

const aiSecurityEscalationTokenTTL = 5 * time.Minute

type AISecurityEscalationScope struct {
	Kind              string
	Mode              AISecurityMode
	Risk              AISecurityRiskLevel
	TargetType        string
	TargetIDs         []string
	SessionBatchCount int
	Capability        string
	ToolID            string
	PatchID           string
	OperationID       string
	OperationType     string
	OperationDigest   string
}

type aiSecurityEscalationGrant struct {
	Fingerprint string
	ExpiresAt   time.Time
}

var (
	aiSecurityEscalationLock   sync.Mutex
	aiSecurityEscalationGrants = map[string]aiSecurityEscalationGrant{}
)

func issueAISecurityEscalationToken(scope *AISecurityEscalationScope) (token string, expiresAt int64, err error) {
	fingerprint, err := fingerprintAISecurityEscalationScope(scope)
	if nil != err {
		return "", 0, err
	}
	token, err = newAISecurityEscalationToken()
	if nil != err {
		return "", 0, err
	}
	expiry := time.Now().Add(aiSecurityEscalationTokenTTL)

	aiSecurityEscalationLock.Lock()
	defer aiSecurityEscalationLock.Unlock()
	cleanupExpiredAISecurityEscalationsLocked(time.Now())
	aiSecurityEscalationGrants[token] = aiSecurityEscalationGrant{
		Fingerprint: fingerprint,
		ExpiresAt:   expiry,
	}
	return token, expiry.UnixMilli(), nil
}

func consumeAISecurityEscalationToken(token string, scope *AISecurityEscalationScope) bool {
	token = strings.TrimSpace(token)
	if "" == token {
		return false
	}
	fingerprint, err := fingerprintAISecurityEscalationScope(scope)
	if nil != err {
		return false
	}

	aiSecurityEscalationLock.Lock()
	defer aiSecurityEscalationLock.Unlock()
	now := time.Now()
	cleanupExpiredAISecurityEscalationsLocked(now)
	grant, exists := aiSecurityEscalationGrants[token]
	if !exists {
		return false
	}
	if grant.ExpiresAt.Before(now) {
		delete(aiSecurityEscalationGrants, token)
		return false
	}
	if grant.Fingerprint != fingerprint {
		return false
	}
	delete(aiSecurityEscalationGrants, token)
	return true
}

func fingerprintAISecurityEscalationScope(scope *AISecurityEscalationScope) (string, error) {
	if nil == scope {
		return "", fmt.Errorf("AI security escalation scope is required")
	}
	normalized := *scope
	normalized.Kind = strings.TrimSpace(normalized.Kind)
	normalized.TargetType = strings.TrimSpace(normalized.TargetType)
	normalized.TargetIDs = normalizeAISecurityTargetIDs(normalized.TargetIDs)
	sort.Strings(normalized.TargetIDs)
	normalized.Capability = strings.TrimSpace(normalized.Capability)
	normalized.ToolID = strings.TrimSpace(normalized.ToolID)
	normalized.PatchID = strings.TrimSpace(normalized.PatchID)
	normalized.OperationID = strings.TrimSpace(normalized.OperationID)
	normalized.OperationType = strings.TrimSpace(normalized.OperationType)
	normalized.OperationDigest = strings.TrimSpace(normalized.OperationDigest)
	data, err := json.Marshal(normalized)
	if nil != err {
		return "", fmt.Errorf("marshal AI security escalation scope: %w", err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func cleanupExpiredAISecurityEscalationsLocked(now time.Time) {
	for token, grant := range aiSecurityEscalationGrants {
		if grant.ExpiresAt.Before(now) {
			delete(aiSecurityEscalationGrants, token)
		}
	}
}

func newAISecurityEscalationToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); nil != err {
		return "", fmt.Errorf("generate AI security escalation token: %w", err)
	}
	return hex.EncodeToString(buf), nil
}
