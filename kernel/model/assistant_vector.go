package model

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"sort"
	"sync"

	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/lonelyor/sourceflow/third_party/go/filelock"
	"github.com/lonelyor/sourceflow/third_party/go/logging"
)

type AssistantNoteVector struct {
	RootID    string    `json:"rootID"`
	Vector    []float64 `json:"vector"`
	UpdatedAt int64     `json:"updatedAt"`
	Title     string    `json:"title"`
	HPath     string    `json:"hPath"`
}

var (
	vectorStore     = make(map[string]*AssistantNoteVector)
	vectorStoreLock sync.RWMutex
	vectorLoaded    bool
)

const vectorFileMaxLen = 2000
const vectorSearchMaxLimit = 50

func vectorFilePath() string {
	return filepath.Join(util.DataDir, "storage", "assistant_vectors.json")
}

func LoadVectors() {
	vectorStoreLock.Lock()
	defer vectorStoreLock.Unlock()
	if vectorLoaded {
		return
	}
	vectorLoaded = true

	p := vectorFilePath()
	data, err := os.ReadFile(p)
	if err != nil {
		return
	}
	var loaded map[string]*AssistantNoteVector
	if err := json.Unmarshal(data, &loaded); err != nil {
		logging.LogWarnf("parse vectors file: %s", err)
		return
	}
	if loaded != nil {
		vectorStore = loaded
	}
	logging.LogInfof("loaded %d note vectors", len(vectorStore))
}

func persistVectorsLocked() {
	p := vectorFilePath()
	data, err := json.Marshal(vectorStore)
	if err != nil {
		logging.LogErrorf("marshal vectors: %s", err)
		return
	}
	dir := filepath.Dir(p)
	if err := os.MkdirAll(dir, 0755); err != nil {
		logging.LogErrorf("create vectors dir [%s] failed: %s", dir, err)
		return
	}
	if err := filelock.WriteFile(p, data); err != nil {
		logging.LogErrorf("write vectors file: %s", err)
	}
}

func StoreNoteVector(rootID string, vector []float64, title, hPath string) {
	LoadVectors()

	vectorStoreLock.Lock()
	defer vectorStoreLock.Unlock()

	vectorStore[rootID] = &AssistantNoteVector{
		RootID:    rootID,
		Vector:    cloneVector(vector),
		UpdatedAt: util.CurrentTimeMillis(),
		Title:     title,
		HPath:     hPath,
	}
	persistVectorsLocked()
}

func RemoveNoteVectors(rootIDs []string) {
	if 1 > len(rootIDs) {
		return
	}

	LoadVectors()

	vectorStoreLock.Lock()
	defer vectorStoreLock.Unlock()

	changed := false
	for _, rootID := range rootIDs {
		if "" == rootID {
			continue
		}
		if _, ok := vectorStore[rootID]; ok {
			delete(vectorStore, rootID)
			changed = true
		}
	}
	if changed {
		persistVectorsLocked()
	}
}

func SearchSimilarNotes(queryVector []float64, limit int) []*AssistantNoteVector {
	LoadVectors()

	vectorStoreLock.RLock()
	defer vectorStoreLock.RUnlock()

	if limit <= 0 {
		limit = 10
	} else if vectorSearchMaxLimit < limit {
		limit = vectorSearchMaxLimit
	}

	type scored struct {
		vec   *AssistantNoteVector
		score float64
	}
	var results []scored
	for _, nv := range vectorStore {
		if len(nv.Vector) == 0 {
			continue
		}
		if nil == sql.GetBlock(nv.RootID) {
			continue
		}
		sim := cosineSimilarity(queryVector, nv.Vector)
		results = append(results, scored{vec: nv, score: sim})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].score > results[j].score
	})

	if len(results) > limit {
		results = results[:limit]
	}

	ret := make([]*AssistantNoteVector, 0, len(results))
	for _, r := range results {
		vecCopy := *r.vec
		vecCopy.Vector = nil
		ret = append(ret, &vecCopy)
	}
	return ret
}

func cosineSimilarity(a, b []float64) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return dot / (math.Sqrt(normA) * math.Sqrt(normB))
}

func IndexNote(rootID string) error {
	cfg := GetAssistantEmbeddingConfig()
	if cfg == nil || !cfg.Enabled {
		return fmtEmbeddingDisabled()
	}

	kramdown := GetBlockKramdown(rootID, "md")
	if kramdown == "" {
		return fmt.Errorf("note %s not found or empty", rootID)
	}

	text := kramdown
	text = truncateVectorText(text, vectorFileMaxLen)

	vector, err := GenerateEmbedding(text, cfg)
	if err != nil {
		return fmt.Errorf("generate embedding for %s: %w", rootID, err)
	}

	block := sql.GetBlock(rootID)
	title := ""
	hPath := ""
	if block != nil {
		title = block.Content
		hPath = block.HPath
	}

	StoreNoteVector(rootID, vector, title, hPath)
	return nil
}

func IndexAllNotes() (indexed int, total int, err error) {
	cfg := GetAssistantEmbeddingConfig()
	if cfg == nil || !cfg.Enabled {
		return 0, 0, fmtEmbeddingDisabled()
	}

	results, queryErr := sql.QueryNoLimit("SELECT id, content, hpath FROM blocks WHERE type = 'd'")
	if queryErr != nil {
		return 0, 0, fmt.Errorf("query all docs: %w", queryErr)
	}

	total = len(results)
	for _, row := range results {
		id, _ := row["id"].(string)
		if id == "" {
			continue
		}
		if indexErr := IndexNote(id); indexErr != nil {
			logging.LogWarnf("index note %s failed: %s", id, indexErr)
			continue
		}
		indexed++
	}
	return indexed, total, nil
}

func GetVectorCount() int {
	LoadVectors()

	vectorStoreLock.RLock()
	defer vectorStoreLock.RUnlock()
	return len(vectorStore)
}

func cloneVector(vector []float64) []float64 {
	if nil == vector {
		return nil
	}
	ret := make([]float64, len(vector))
	copy(ret, vector)
	return ret
}

func truncateVectorText(text string, maxLen int) string {
	if maxLen <= 0 {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= maxLen {
		return text
	}
	return string(runes[:maxLen])
}

func fmtEmbeddingDisabled() error {
	return fmt.Errorf("embedding is not enabled")
}
