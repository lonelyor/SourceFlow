package model

import (
	"encoding/json"
	"sort"
	"sync"
	"time"
)

const (
	searchPerfCacheTTL        = 2 * time.Second
	searchPerfCacheMaxEntries = 64
)

type searchDocsCacheEntry struct {
	results  []map[string]string
	cachedAt time.Time
}

type assetContentSearchCacheEntry struct {
	results           []*AssetContent
	matchedAssetCount int
	pageCount         int
	cachedAt          time.Time
}

type searchDocsCacheKey struct {
	Keyword    string   `json:"keyword"`
	Flashcard  bool     `json:"flashcard"`
	ExcludeIDs []string `json:"excludeIDs"`
}

type assetContentSearchCacheKey struct {
	Query    string   `json:"query"`
	Types    []string `json:"types"`
	Method   int      `json:"method"`
	OrderBy  int      `json:"orderBy"`
	Page     int      `json:"page"`
	PageSize int      `json:"pageSize"`
}

var (
	searchDocsCache = struct {
		lock  sync.Mutex
		items map[string]searchDocsCacheEntry
	}{
		items: map[string]searchDocsCacheEntry{},
	}
	assetContentSearchCache = struct {
		lock  sync.Mutex
		items map[string]assetContentSearchCacheEntry
	}{
		items: map[string]assetContentSearchCacheEntry{},
	}
)

func buildSearchDocsCacheKey(keyword string, flashcard bool, excludeIDs []string) string {
	sortedExcludeIDs := append([]string{}, excludeIDs...)
	sort.Strings(sortedExcludeIDs)
	data, _ := json.Marshal(searchDocsCacheKey{
		Keyword:    keyword,
		Flashcard:  flashcard,
		ExcludeIDs: sortedExcludeIDs,
	})
	return string(data)
}

func getCachedSearchDocs(key string) (ret []map[string]string, ok bool) {
	now := time.Now()
	searchDocsCache.lock.Lock()
	defer searchDocsCache.lock.Unlock()

	cached, exists := searchDocsCache.items[key]
	if !exists {
		return nil, false
	}
	if now.Sub(cached.cachedAt) > searchPerfCacheTTL {
		delete(searchDocsCache.items, key)
		return nil, false
	}
	return cloneSearchDocsResult(cached.results), true
}

func setCachedSearchDocs(key string, ret []map[string]string) {
	searchDocsCache.lock.Lock()
	defer searchDocsCache.lock.Unlock()

	cleanupSearchDocsCacheLocked(time.Now())
	searchDocsCache.items[key] = searchDocsCacheEntry{
		results:  cloneSearchDocsResult(ret),
		cachedAt: time.Now(),
	}
}

func cleanupSearchDocsCacheLocked(now time.Time) {
	if len(searchDocsCache.items) < searchPerfCacheMaxEntries {
		return
	}
	for key, cached := range searchDocsCache.items {
		if now.Sub(cached.cachedAt) > searchPerfCacheTTL {
			delete(searchDocsCache.items, key)
		}
	}
	if len(searchDocsCache.items) < searchPerfCacheMaxEntries {
		return
	}
	oldestKey := ""
	var oldestTime time.Time
	for key, cached := range searchDocsCache.items {
		if oldestKey == "" || cached.cachedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = cached.cachedAt
		}
	}
	if oldestKey != "" {
		delete(searchDocsCache.items, oldestKey)
	}
}

func cloneSearchDocsResult(ret []map[string]string) []map[string]string {
	if 1 > len(ret) {
		return []map[string]string{}
	}

	cloned := make([]map[string]string, 0, len(ret))
	for _, item := range ret {
		copied := map[string]string{}
		for key, value := range item {
			copied[key] = value
		}
		cloned = append(cloned, copied)
	}
	return cloned
}

func buildAssetContentSearchCacheKey(query string, types map[string]bool, method, orderBy, page, pageSize int) string {
	typeKeys := make([]string, 0, len(types))
	for key, enabled := range types {
		if enabled {
			typeKeys = append(typeKeys, key)
		}
	}
	sort.Strings(typeKeys)
	data, _ := json.Marshal(assetContentSearchCacheKey{
		Query:    query,
		Types:    typeKeys,
		Method:   method,
		OrderBy:  orderBy,
		Page:     page,
		PageSize: pageSize,
	})
	return string(data)
}

func getCachedAssetContentSearch(key string) (ret []*AssetContent, matchedAssetCount, pageCount int, ok bool) {
	now := time.Now()
	assetContentSearchCache.lock.Lock()
	defer assetContentSearchCache.lock.Unlock()

	cached, exists := assetContentSearchCache.items[key]
	if !exists {
		return nil, 0, 0, false
	}
	if now.Sub(cached.cachedAt) > searchPerfCacheTTL {
		delete(assetContentSearchCache.items, key)
		return nil, 0, 0, false
	}
	return cloneAssetContentResults(cached.results), cached.matchedAssetCount, cached.pageCount, true
}

func setCachedAssetContentSearch(key string, ret []*AssetContent, matchedAssetCount, pageCount int) {
	assetContentSearchCache.lock.Lock()
	defer assetContentSearchCache.lock.Unlock()

	cleanupAssetContentSearchCacheLocked(time.Now())
	assetContentSearchCache.items[key] = assetContentSearchCacheEntry{
		results:           cloneAssetContentResults(ret),
		matchedAssetCount: matchedAssetCount,
		pageCount:         pageCount,
		cachedAt:          time.Now(),
	}
}

func cleanupAssetContentSearchCacheLocked(now time.Time) {
	if len(assetContentSearchCache.items) < searchPerfCacheMaxEntries {
		return
	}
	for key, cached := range assetContentSearchCache.items {
		if now.Sub(cached.cachedAt) > searchPerfCacheTTL {
			delete(assetContentSearchCache.items, key)
		}
	}
	if len(assetContentSearchCache.items) < searchPerfCacheMaxEntries {
		return
	}
	oldestKey := ""
	var oldestTime time.Time
	for key, cached := range assetContentSearchCache.items {
		if oldestKey == "" || cached.cachedAt.Before(oldestTime) {
			oldestKey = key
			oldestTime = cached.cachedAt
		}
	}
	if oldestKey != "" {
		delete(assetContentSearchCache.items, oldestKey)
	}
}

func cloneAssetContentResults(ret []*AssetContent) []*AssetContent {
	if 1 > len(ret) {
		return []*AssetContent{}
	}

	cloned := make([]*AssetContent, 0, len(ret))
	for _, item := range ret {
		if nil == item {
			continue
		}
		copied := *item
		cloned = append(cloned, &copied)
	}
	return cloned
}
