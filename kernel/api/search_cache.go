package api

import (
	"encoding/json"
	"sort"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/kernel/model"
)

const (
	fullTextSearchBlockCacheTTL        = 2 * time.Second
	fullTextSearchBlockCacheMaxEntries = 64
)

type fullTextSearchBlockCacheEntry struct {
	blocks            []*model.Block
	matchedBlockCount int
	matchedRootCount  int
	pageCount         int
	docMode           bool
	cachedAt          time.Time
}

type fullTextSearchBlockCacheStore struct {
	lock  sync.Mutex
	items map[string]fullTextSearchBlockCacheEntry
}

var searchBlockCache = &fullTextSearchBlockCacheStore{
	items: map[string]fullTextSearchBlockCacheEntry{},
}

type fullTextSearchBlockCacheKey struct {
	Page     int      `json:"page"`
	PageSize int      `json:"pageSize"`
	Query    string   `json:"query"`
	Paths    []string `json:"paths"`
	Boxes    []string `json:"boxes"`
	Types    []string `json:"types"`
	Method   int      `json:"method"`
	OrderBy  int      `json:"orderBy"`
	GroupBy  int      `json:"groupBy"`
}

func buildFullTextSearchBlockCacheKey(query string, boxes, paths []string, types map[string]bool, method, orderBy, groupBy, page, pageSize int) string {
	typeKeys := make([]string, 0, len(types))
	for key, enabled := range types {
		if enabled {
			typeKeys = append(typeKeys, key)
		}
	}
	sort.Strings(typeKeys)

	cacheKey := fullTextSearchBlockCacheKey{
		Page:     page,
		PageSize: pageSize,
		Query:    query,
		Paths:    append([]string{}, paths...),
		Boxes:    append([]string{}, boxes...),
		Types:    typeKeys,
		Method:   method,
		OrderBy:  orderBy,
		GroupBy:  groupBy,
	}
	data, _ := json.Marshal(cacheKey)
	return string(data)
}

func getCachedFullTextSearchBlock(key string) (entry fullTextSearchBlockCacheEntry, ok bool) {
	now := time.Now()
	searchBlockCache.lock.Lock()
	defer searchBlockCache.lock.Unlock()

	cached, exists := searchBlockCache.items[key]
	if !exists {
		return fullTextSearchBlockCacheEntry{}, false
	}
	if now.Sub(cached.cachedAt) > fullTextSearchBlockCacheTTL {
		delete(searchBlockCache.items, key)
		return fullTextSearchBlockCacheEntry{}, false
	}
	return cached, true
}

func setCachedFullTextSearchBlock(key string, entry fullTextSearchBlockCacheEntry) {
	now := time.Now()
	searchBlockCache.lock.Lock()
	defer searchBlockCache.lock.Unlock()

	if len(searchBlockCache.items) >= fullTextSearchBlockCacheMaxEntries {
		for cacheKey, cached := range searchBlockCache.items {
			if now.Sub(cached.cachedAt) > fullTextSearchBlockCacheTTL {
				delete(searchBlockCache.items, cacheKey)
			}
		}
		if len(searchBlockCache.items) >= fullTextSearchBlockCacheMaxEntries {
			oldestKey := ""
			var oldestTime time.Time
			for cacheKey, cached := range searchBlockCache.items {
				if oldestKey == "" || cached.cachedAt.Before(oldestTime) {
					oldestKey = cacheKey
					oldestTime = cached.cachedAt
				}
			}
			if oldestKey != "" {
				delete(searchBlockCache.items, oldestKey)
			}
		}
	}

	entry.cachedAt = now
	searchBlockCache.items[key] = entry
}
