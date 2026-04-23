package model

import (
	"errors"
	stdhtml "html"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/lonelyor/sourceflow/kernel/sql"
	"github.com/lonelyor/sourceflow/kernel/util"
)

const (
	WorkbenchAttrType       = "custom-workbench-type"
	WorkbenchAttrStatus     = "custom-workbench-status"
	WorkbenchAttrInbox      = "custom-workbench-inbox"
	WorkbenchAttrProject    = "custom-workbench-project"
	WorkbenchAttrDueDate    = "custom-workbench-due-date"
	WorkbenchAttrEventTime  = "custom-workbench-event-time"
	WorkbenchAttrLocation   = "custom-workbench-location"
	WorkbenchAttrSourceURL  = "custom-workbench-source-url"
	WorkbenchAttrCapturedAt = "custom-workbench-captured-at"
	WorkbenchAttrTitle      = "custom-workbench-title"
	WorkbenchAttrGoal       = "custom-workbench-goal"
	WorkbenchAttrNextStep   = "custom-workbench-next-step"
	WorkbenchViewAttrEnable = "custom-workbench-view-enabled"
)

var workbenchTypes = map[string]bool{
	"doc":        true,
	"note":       true,
	"url":        true,
	"task":       true,
	"event":      true,
	"project":    true,
	"attachment": true,
}

var workbenchQueryTokenRegexp = regexp.MustCompile(`"[^"]+"|\S+`)
var workbenchIALKVRegexp = regexp.MustCompile(`([[:alnum:]_:-]+)="([^"]*)"`)

var workbenchManagedAttrs = []string{
	WorkbenchAttrType,
	WorkbenchAttrStatus,
	WorkbenchAttrInbox,
	WorkbenchAttrProject,
	WorkbenchAttrDueDate,
	WorkbenchAttrEventTime,
	WorkbenchAttrLocation,
	WorkbenchAttrSourceURL,
	WorkbenchAttrCapturedAt,
	WorkbenchAttrTitle,
	WorkbenchAttrGoal,
	WorkbenchAttrNextStep,
	"tags",
}

var workbenchListCache = struct {
	sync.Mutex
	expiresAt time.Time
	limit     int
	items     []*WorkbenchItem
}{}

var workbenchQueryCache = struct {
	sync.Mutex
	entries map[string]*workbenchQueryCacheEntry
}{
	entries: map[string]*workbenchQueryCacheEntry{},
}

type workbenchQueryCacheEntry struct {
	expiresAt time.Time
	result    *WorkbenchQueryResult
}

type WorkbenchItem struct {
	ID           string   `json:"id"`
	EntityKind   string   `json:"entityKind"`
	RootID       string   `json:"rootID"`
	ParentID     string   `json:"parentID"`
	Box          string   `json:"box"`
	Notebook     string   `json:"notebook"`
	Path         string   `json:"path"`
	HPath        string   `json:"hPath"`
	Title        string   `json:"title"`
	Preview      string   `json:"preview"`
	Type         string   `json:"type"`
	Status       string   `json:"status"`
	Project      string   `json:"project"`
	DueDate      string   `json:"dueDate"`
	EventTime    string   `json:"eventTime"`
	Location     string   `json:"location"`
	SourceURL    string   `json:"sourceURL"`
	CapturedAt   string   `json:"capturedAt"`
	Goal         string   `json:"goal"`
	NextStep     string   `json:"nextStep"`
	Tags         []string `json:"tags"`
	Inbox        bool     `json:"inbox"`
	Created      string   `json:"created"`
	Updated      string   `json:"updated"`
	CreatedAt    int64    `json:"createdAt"`
	UpdatedAt    int64    `json:"updatedAt"`
	DueAt        int64    `json:"dueAt"`
	EventAt      int64    `json:"eventAt"`
	CapturedTs   int64    `json:"capturedTs"`
	RefCount     int      `json:"refCount"`
	AssetCount   int      `json:"assetCount"`
	SubFileCount int      `json:"subFileCount"`
	HasBoundView bool     `json:"hasBoundView"`
}

type WorkbenchSummary struct {
	Total        int               `json:"total"`
	Filtered     int               `json:"filtered"`
	DocCount     int               `json:"docCount"`
	ViewCount    int               `json:"viewCount"`
	InboxCount   int               `json:"inboxCount"`
	TaskCount    int               `json:"taskCount"`
	EventCount   int               `json:"eventCount"`
	ProjectCount int               `json:"projectCount"`
	ReviewCount  int               `json:"reviewCount"`
	TypeCounts   map[string]int    `json:"typeCounts"`
	StatusCounts map[string]int    `json:"statusCounts"`
	Notebooks    []*WorkbenchFacet `json:"notebooks"`
	Projects     []*WorkbenchFacet `json:"projects"`
	Tags         []*WorkbenchFacet `json:"tags"`
	QuickFilters []*WorkbenchFacet `json:"quickFilters"`
	RefTotal     int               `json:"refTotal"`
	AssetTotal   int               `json:"assetTotal"`
	SubFileTotal int               `json:"subFileTotal"`
}

type WorkbenchFacet struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	Token string `json:"token"`
}

type WorkbenchQueryResult struct {
	Items    []*WorkbenchItem  `json:"items"`
	AllItems []*WorkbenchItem  `json:"allItems"`
	Summary  *WorkbenchSummary `json:"summary"`
}

type parsedWorkbenchQuery struct {
	text    []string
	filters map[string][]string
}

func ListWorkbenchItems(limit int) (ret []*WorkbenchItem) {
	if 1 > limit || 4096 < limit {
		limit = 1024
	}

	if cached := getCachedWorkbenchItems(limit); nil != cached {
		return cached
	}

	seen := map[string]bool{}
	blocks := sql.QueryRecentRootBlocks(limit)
	for _, block := range blocks {
		attrs := parseWorkbenchIALAttrs(block.IAL)
		item := buildWorkbenchItem(block, attrs)
		if nil != item {
			seen[item.ID] = true
			ret = append(ret, item)
		}
	}

	attrBlocks := sql.QueryRecentBlocksByIALFragments(limit, "custom-workbench-")
	for _, block := range attrBlocks {
		if seen[block.ID] {
			continue
		}
		item := buildWorkbenchItem(block, parseWorkbenchIALAttrs(block.IAL))
		if nil == item {
			continue
		}
		seen[item.ID] = true
		ret = append(ret, item)
	}

	decorateWorkbenchStructure(ret)

	sort.Slice(ret, func(i, j int) bool {
		if ret[i].CapturedTs == ret[j].CapturedTs {
			return ret[i].UpdatedAt > ret[j].UpdatedAt
		}
		return ret[i].CapturedTs > ret[j].CapturedTs
	})
	if len(ret) > limit {
		ret = ret[:limit]
	}
	cacheWorkbenchItems(limit, ret)
	return
}

func SaveWorkbenchItem(id, title string, attrs map[string]string) (err error) {
	tree, err := LoadTreeByBlockID(id)
	if nil != err {
		return
	}
	if nil == tree || nil == tree.Root {
		return errors.New("workbench item not found")
	}

	targetID := id
	currentAttrs := sql.GetBlockAttrs(targetID)
	normalizedAttrs := map[string]string{}
	for _, key := range workbenchManagedAttrs {
		normalizedAttrs[key] = strings.TrimSpace(attrs[key])
	}

	normalizedAttrs[WorkbenchAttrType] = normalizeWorkbenchType(normalizedAttrs[WorkbenchAttrType], currentAttrs[WorkbenchAttrType])
	normalizedAttrs[WorkbenchAttrStatus] = normalizeWorkbenchStatus(normalizedAttrs[WorkbenchAttrType], normalizedAttrs[WorkbenchAttrStatus], currentAttrs[WorkbenchAttrStatus])
	normalizedAttrs[WorkbenchAttrInbox] = normalizeWorkbenchInbox(normalizedAttrs[WorkbenchAttrInbox], currentAttrs[WorkbenchAttrInbox])
	normalizedAttrs[WorkbenchAttrTitle] = strings.TrimSpace(normalizedAttrs[WorkbenchAttrTitle])
	if "" == normalizedAttrs[WorkbenchAttrCapturedAt] {
		normalizedAttrs[WorkbenchAttrCapturedAt] = strings.TrimSpace(currentAttrs[WorkbenchAttrCapturedAt])
		if "" == normalizedAttrs[WorkbenchAttrCapturedAt] && "doc" != normalizedAttrs[WorkbenchAttrType] {
			normalizedAttrs[WorkbenchAttrCapturedAt] = time.Now().Format(time.RFC3339)
		}
	}

	title = strings.TrimSpace(title)
	if targetID == tree.Root.ID && title != strings.TrimSpace(tree.Root.IALAttr("title")) {
		if err = RenameDoc(tree.Box, tree.Path, title); nil != err {
			return
		}
	} else if targetID != tree.Root.ID {
		normalizedAttrs[WorkbenchAttrTitle] = title
	}

	err = SetBlockAttrs(targetID, normalizedAttrs)
	return
}

func QueryWorkbenchItems(query, activeTab, sortBy, sortOrder string, limit int) *WorkbenchQueryResult {
	cacheKey := strings.Join([]string{
		strconv.Itoa(limit),
		strings.TrimSpace(activeTab),
		strings.TrimSpace(sortBy),
		strings.TrimSpace(sortOrder),
		strings.TrimSpace(query),
	}, "\x00")
	if cached := getCachedWorkbenchQueryResult(cacheKey); nil != cached {
		return cached
	}
	allItems := ListWorkbenchItems(limit)
	items := filterWorkbenchItems(allItems, activeTab, query)
	sortWorkbenchItems(items, sortBy, sortOrder)
	ret := &WorkbenchQueryResult{
		Items:    items,
		AllItems: allItems,
		Summary:  buildWorkbenchSummary(allItems, items),
	}
	cacheWorkbenchQueryResult(cacheKey, ret)
	return ret
}

func defaultWorkbenchStatus(typ, current string) string {
	current = strings.TrimSpace(current)
	if "" != current {
		return current
	}
	switch typ {
	case "task":
		return "todo"
	case "event":
		return "scheduled"
	case "project":
		return "active"
	default:
		return "open"
	}
}

func splitWorkbenchTags(tags string) (ret []string) {
	for _, part := range strings.Split(strings.ReplaceAll(tags, "，", ","), ",") {
		part = strings.TrimSpace(part)
		if "" == part {
			continue
		}
		ret = append(ret, part)
	}
	return
}

func parseWorkbenchQuery(query string) *parsedWorkbenchQuery {
	ret := &parsedWorkbenchQuery{
		text:    []string{},
		filters: map[string][]string{},
	}
	for _, raw := range workbenchQueryTokenRegexp.FindAllString(query, -1) {
		token := strings.TrimSpace(strings.Trim(raw, "\""))
		if "" == token {
			continue
		}
		index := strings.Index(token, ":")
		if 0 < index {
			key := strings.ToLower(strings.TrimSpace(token[:index]))
			value := strings.ToLower(strings.TrimSpace(token[index+1:]))
			if "" != value && ("type" == key || "kind" == key || "status" == key || "project" == key || "tag" == key || "notebook" == key || "inbox" == key || "before" == key || "after" == key || "has" == key || "flag" == key) {
				ret.filters[key] = append(ret.filters[key], value)
				continue
			}
		}
		ret.text = append(ret.text, strings.ToLower(token))
	}
	return ret
}

func filterWorkbenchItems(items []*WorkbenchItem, activeTab, query string) (ret []*WorkbenchItem) {
	parsed := parseWorkbenchQuery(query)
	for _, item := range items {
		if "inbox" == activeTab && !item.Inbox {
			continue
		}
		if "library" == activeTab && "doc" != item.Type {
			continue
		}
		if "task" == activeTab && "task" != item.Type {
			continue
		}
		if "calendar" == activeTab && "event" != item.Type && !("task" == item.Type && 0 < item.DueAt) {
			continue
		}
		if "project" == activeTab && "project" != item.Type {
			continue
		}
		if !matchWorkbenchQueryItem(item, parsed) {
			continue
		}
		ret = append(ret, item)
	}
	return
}

func matchWorkbenchQueryItem(item *WorkbenchItem, parsed *parsedWorkbenchQuery) bool {
	if 0 < len(parsed.filters["kind"]) && !containsWorkbenchValue(parsed.filters["kind"], strings.ToLower(item.EntityKind)) {
		return false
	}
	if 0 < len(parsed.filters["type"]) && !containsWorkbenchValue(parsed.filters["type"], strings.ToLower(item.Type)) {
		return false
	}
	if 0 < len(parsed.filters["status"]) && !containsWorkbenchValue(parsed.filters["status"], strings.ToLower(item.Status)) {
		return false
	}
	if 0 < len(parsed.filters["project"]) && !containsWorkbenchPartial(parsed.filters["project"], item.Project) {
		return false
	}
	if 0 < len(parsed.filters["notebook"]) && !containsWorkbenchPartial(parsed.filters["notebook"], item.Notebook) {
		return false
	}
	if 0 < len(parsed.filters["tag"]) && !containsWorkbenchAllTags(parsed.filters["tag"], item.Tags) {
		return false
	}
	if 0 < len(parsed.filters["inbox"]) {
		expected := false
		for _, value := range parsed.filters["inbox"] {
			if "true" == value || "1" == value || "yes" == value {
				expected = true
				break
			}
		}
		if item.Inbox != expected {
			return false
		}
	}
	if !matchWorkbenchTimeFilter(item, parsed.filters["after"], true) || !matchWorkbenchTimeFilter(item, parsed.filters["before"], false) {
		return false
	}
	if !matchWorkbenchHasFilters(item, parsed.filters["has"]) {
		return false
	}
	if !matchWorkbenchFlagFilters(item, parsed.filters["flag"]) {
		return false
	}
	if 1 > len(parsed.text) {
		return true
	}
	haystack := strings.ToLower(strings.Join([]string{
		item.Title,
		item.Preview,
		item.Project,
		item.Location,
		item.SourceURL,
		item.HPath,
		strings.Join(item.Tags, " "),
	}, "\n"))
	for _, value := range parsed.text {
		if !strings.Contains(haystack, value) {
			return false
		}
	}
	return true
}

func matchWorkbenchHasFilters(item *WorkbenchItem, values []string) bool {
	for _, value := range values {
		switch value {
		case "due":
			if 1 > item.DueAt {
				return false
			}
		case "event":
			if 1 > item.EventAt {
				return false
			}
		case "project":
			if "" == strings.TrimSpace(item.Project) {
				return false
			}
		case "tag":
			if 1 > len(item.Tags) {
				return false
			}
		case "url":
			if "" == strings.TrimSpace(item.SourceURL) {
				return false
			}
		case "location":
			if "" == strings.TrimSpace(item.Location) {
				return false
			}
		case "ref":
			if 1 > item.RefCount {
				return false
			}
		case "asset":
			if 1 > item.AssetCount {
				return false
			}
		case "subdoc":
			if 1 > item.SubFileCount {
				return false
			}
		case "view":
			if !item.HasBoundView {
				return false
			}
		}
	}
	return true
}

func matchWorkbenchFlagFilters(item *WorkbenchItem, values []string) bool {
	now := time.Now()
	nextWeek := now.Add(7 * 24 * time.Hour)
	lastWeek := now.Add(-7 * 24 * time.Hour)
	for _, value := range values {
		switch value {
		case "overdue":
			if !("task" == item.Type && "done" != item.Status && 0 < item.DueAt && item.DueAt < now.UnixMilli()) {
				return false
			}
		case "upcoming":
			current := getWorkbenchPrimaryTime(item)
			if !(0 < current && current >= now.UnixMilli() && current <= nextWeek.UnixMilli()) {
				return false
			}
		case "today":
			current := getWorkbenchPrimaryTime(item)
			if 1 > current {
				return false
			}
			t := time.UnixMilli(current)
			if t.Year() != now.Year() || t.YearDay() != now.YearDay() {
				return false
			}
		case "stale":
			current := getWorkbenchPrimaryTime(item)
			if !(item.Inbox && 0 < current && current < lastWeek.UnixMilli()) {
				return false
			}
		case "unprojected":
			if "" != strings.TrimSpace(item.Project) {
				return false
			}
		case "untagged":
			if 0 < len(item.Tags) {
				return false
			}
		}
	}
	return true
}

func containsWorkbenchValue(values []string, current string) bool {
	for _, value := range values {
		if value == current {
			return true
		}
	}
	return false
}

func containsWorkbenchPartial(values []string, current string) bool {
	current = strings.ToLower(current)
	for _, value := range values {
		if strings.Contains(current, value) {
			return true
		}
	}
	return false
}

func containsWorkbenchAllTags(values []string, tags []string) bool {
	lowerTags := make([]string, 0, len(tags))
	for _, tag := range tags {
		lowerTags = append(lowerTags, strings.ToLower(tag))
	}
	for _, value := range values {
		found := false
		for _, tag := range lowerTags {
			if strings.Contains(tag, value) {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func matchWorkbenchTimeFilter(item *WorkbenchItem, values []string, isAfter bool) bool {
	if 1 > len(values) {
		return true
	}
	current := getWorkbenchPrimaryTime(item)
	if 0 == current {
		return false
	}
	for _, value := range values {
		target := parseWorkbenchTime(value).UnixMilli()
		if 0 == target {
			continue
		}
		if isAfter && current < target {
			return false
		}
		if !isAfter && current > target {
			return false
		}
	}
	return true
}

func getWorkbenchPrimaryTime(item *WorkbenchItem) int64 {
	if 0 < item.EventAt {
		return item.EventAt
	}
	if 0 < item.DueAt {
		return item.DueAt
	}
	if 0 < item.CapturedTs {
		return item.CapturedTs
	}
	return item.UpdatedAt
}

func sortWorkbenchItems(items []*WorkbenchItem, sortBy, sortOrder string) {
	sortBy = strings.ToLower(strings.TrimSpace(sortBy))
	sortOrder = strings.ToLower(strings.TrimSpace(sortOrder))
	if "" == sortBy {
		sortBy = "captured"
	}
	desc := "asc" != sortOrder
	sort.Slice(items, func(i, j int) bool {
		left := items[i]
		right := items[j]
		if "title" == sortBy {
			lv := strings.ToLower(left.Title)
			rv := strings.ToLower(right.Title)
			if lv == rv {
				if desc {
					return left.UpdatedAt > right.UpdatedAt
				}
				return left.UpdatedAt < right.UpdatedAt
			}
			if desc {
				return lv > rv
			}
			return lv < rv
		}

		lv := getWorkbenchSortTime(left, sortBy)
		rv := getWorkbenchSortTime(right, sortBy)
		if lv == rv {
			if desc {
				return left.UpdatedAt > right.UpdatedAt
			}
			return left.UpdatedAt < right.UpdatedAt
		}
		if desc {
			return lv > rv
		}
		return lv < rv
	})
}

func getWorkbenchSortTime(item *WorkbenchItem, sortBy string) int64 {
	switch sortBy {
	case "updated":
		return item.UpdatedAt
	case "created":
		return item.CreatedAt
	case "due":
		if 0 < item.DueAt {
			return item.DueAt
		}
		return item.UpdatedAt
	case "event":
		if 0 < item.EventAt {
			return item.EventAt
		}
		return item.UpdatedAt
	default:
		if 0 < item.CapturedTs {
			return item.CapturedTs
		}
		return item.UpdatedAt
	}
}

func buildWorkbenchSummary(allItems, filteredItems []*WorkbenchItem) *WorkbenchSummary {
	ret := &WorkbenchSummary{
		Total:        len(allItems),
		Filtered:     len(filteredItems),
		TypeCounts:   map[string]int{},
		StatusCounts: map[string]int{},
		Notebooks:    []*WorkbenchFacet{},
		Projects:     []*WorkbenchFacet{},
		Tags:         []*WorkbenchFacet{},
		QuickFilters: []*WorkbenchFacet{},
	}
	notebookCounts := map[string]int{}
	projectCounts := map[string]int{}
	tagCounts := map[string]int{}
	quickCounts := map[string]int{
		"flag:overdue":     0,
		"flag:upcoming":    0,
		"flag:today":       0,
		"flag:stale":       0,
		"flag:unprojected": 0,
		"flag:untagged":    0,
		"has:ref":          0,
		"has:asset":        0,
		"has:subdoc":       0,
		"has:view":         0,
	}
	now := time.Now()
	nextWeek := now.Add(7 * 24 * time.Hour).UnixMilli()
	lastWeek := now.Add(-7 * 24 * time.Hour).UnixMilli()
	for _, item := range allItems {
		if "doc" == item.Type {
			ret.DocCount++
		}
		if item.HasBoundView {
			ret.ViewCount++
		}
		if item.Inbox {
			ret.InboxCount++
		}
		if "task" == item.Type && "done" != item.Status {
			ret.TaskCount++
		}
		if "event" == item.Type {
			ret.EventCount++
		}
		if "project" == item.Type {
			ret.ProjectCount++
		}
		if item.Inbox || ("task" == item.Type && "done" != item.Status) {
			ret.ReviewCount++
		}
	}
	for _, item := range filteredItems {
		ret.TypeCounts[item.Type]++
		ret.StatusCounts[item.Status]++
		ret.RefTotal += item.RefCount
		ret.AssetTotal += item.AssetCount
		ret.SubFileTotal += item.SubFileCount
		if "" != strings.TrimSpace(item.Notebook) {
			notebookCounts[item.Notebook]++
		}
		if "" != strings.TrimSpace(item.Project) {
			projectCounts[item.Project]++
		} else {
			quickCounts["flag:unprojected"]++
		}
		if 1 > len(item.Tags) {
			quickCounts["flag:untagged"]++
		} else {
			for _, tag := range item.Tags {
				if "" != strings.TrimSpace(tag) {
					tagCounts[tag]++
				}
			}
		}
		primaryTime := getWorkbenchPrimaryTime(item)
		if "task" == item.Type && "done" != item.Status && 0 < item.DueAt && item.DueAt < now.UnixMilli() {
			quickCounts["flag:overdue"]++
		}
		if 0 < primaryTime && primaryTime >= now.UnixMilli() && primaryTime <= nextWeek {
			quickCounts["flag:upcoming"]++
			primaryDate := time.UnixMilli(primaryTime)
			if primaryDate.Year() == now.Year() && primaryDate.YearDay() == now.YearDay() {
				quickCounts["flag:today"]++
			}
		}
		if item.Inbox && 0 < primaryTime && primaryTime < lastWeek {
			quickCounts["flag:stale"]++
		}
		if 0 < item.RefCount {
			quickCounts["has:ref"]++
		}
		if 0 < item.AssetCount {
			quickCounts["has:asset"]++
		}
		if 0 < item.SubFileCount {
			quickCounts["has:subdoc"]++
		}
		if item.HasBoundView {
			quickCounts["has:view"]++
		}
	}
	ret.Notebooks = buildWorkbenchFacets(notebookCounts, "notebook")
	ret.Projects = buildWorkbenchFacets(projectCounts, "project")
	ret.Tags = buildWorkbenchFacets(tagCounts, "tag")
	ret.QuickFilters = buildWorkbenchQuickFacets(quickCounts)
	return ret
}

func buildWorkbenchFacets(counts map[string]int, key string) (ret []*WorkbenchFacet) {
	for name, count := range counts {
		if 1 > count {
			continue
		}
		ret = append(ret, &WorkbenchFacet{
			Name:  name,
			Count: count,
			Token: buildWorkbenchFacetToken(key, name),
		})
	}
	sort.Slice(ret, func(i, j int) bool {
		if ret[i].Count == ret[j].Count {
			return strings.ToLower(ret[i].Name) < strings.ToLower(ret[j].Name)
		}
		return ret[i].Count > ret[j].Count
	})
	if 12 < len(ret) {
		ret = ret[:12]
	}
	return
}

func buildWorkbenchQuickFacets(counts map[string]int) (ret []*WorkbenchFacet) {
	definitions := []struct {
		token string
		name  string
	}{
		{token: "flag:overdue", name: "Overdue"},
		{token: "flag:upcoming", name: "Upcoming"},
		{token: "flag:today", name: "Today"},
		{token: "flag:stale", name: "Stale"},
		{token: "flag:unprojected", name: "No project"},
		{token: "flag:untagged", name: "No tag"},
		{token: "has:ref", name: "Has backlinks"},
		{token: "has:asset", name: "Has assets"},
		{token: "has:subdoc", name: "Has subdocs"},
		{token: "has:view", name: "Has saved view"},
	}
	for _, item := range definitions {
		if count := counts[item.token]; 0 < count {
			ret = append(ret, &WorkbenchFacet{
				Name:  item.name,
				Count: count,
				Token: item.token,
			})
		}
	}
	return
}

func buildWorkbenchFacetToken(key, value string) string {
	value = strings.TrimSpace(value)
	if "" == value {
		return ""
	}
	if strings.ContainsAny(value, " :\"") {
		return key + ":\"" + strings.ReplaceAll(value, "\"", "\\\"") + "\""
	}
	return key + ":" + value
}

func buildWorkbenchItem(block *sql.Block, attrs map[string]string) *WorkbenchItem {
	typ := strings.TrimSpace(attrs[WorkbenchAttrType])
	if "" == typ {
		if "d" == block.Type {
			typ = "doc"
		} else {
			typ = "note"
		}
	}
	entityKind := "doc"
	if "d" != block.Type {
		entityKind = "block"
	}

	box := Conf.Box(block.Box)
	notebook := block.Box
	if nil != box {
		notebook = box.Name
	}

	title := strings.TrimSpace(attrs[WorkbenchAttrTitle])
	if "" == title {
		if "doc" == entityKind {
			title = strings.TrimSpace(block.Content)
		} else {
			title = truncateWorkbenchText(block.Content, 80)
		}
	}
	if "" == title {
		title = "Untitled"
	}

	hPath := block.HPath
	if "block" == entityKind {
		suffix := truncateWorkbenchText(block.Content, 40)
		if "" != suffix {
			hPath = strings.TrimSuffix(block.HPath, "/")
			if "" != hPath {
				hPath += " / "
			}
			hPath += suffix
		}
	}

	tags := splitWorkbenchTags(strings.TrimSpace(attrs["tags"]))
	if 1 > len(tags) {
		tags = splitWorkbenchTags(block.Tag)
	}

	item := &WorkbenchItem{
		ID:           block.ID,
		EntityKind:   entityKind,
		RootID:       block.RootID,
		ParentID:     block.ParentID,
		Box:          block.Box,
		Notebook:     notebook,
		Path:         block.Path,
		HPath:        hPath,
		Title:        title,
		Preview:      buildWorkbenchPreview(block, attrs),
		Type:         typ,
		Status:       defaultWorkbenchStatus(typ, attrs[WorkbenchAttrStatus]),
		Project:      strings.TrimSpace(attrs[WorkbenchAttrProject]),
		DueDate:      strings.TrimSpace(attrs[WorkbenchAttrDueDate]),
		EventTime:    strings.TrimSpace(attrs[WorkbenchAttrEventTime]),
		Location:     strings.TrimSpace(attrs[WorkbenchAttrLocation]),
		SourceURL:    strings.TrimSpace(attrs[WorkbenchAttrSourceURL]),
		CapturedAt:   strings.TrimSpace(attrs[WorkbenchAttrCapturedAt]),
		Goal:         strings.TrimSpace(attrs[WorkbenchAttrGoal]),
		NextStep:     strings.TrimSpace(attrs[WorkbenchAttrNextStep]),
		Tags:         tags,
		Inbox:        defaultWorkbenchInbox(typ, attrs[WorkbenchAttrInbox]),
		Created:      block.Created,
		Updated:      block.Updated,
		HasBoundView: "true" == strings.TrimSpace(attrs[WorkbenchViewAttrEnable]),
	}
	item.CreatedAt = parseWorkbenchTime(block.Created).UnixMilli()
	item.UpdatedAt = parseWorkbenchTime(block.Updated).UnixMilli()
	item.DueAt = parseWorkbenchTime(item.DueDate).UnixMilli()
	item.EventAt = parseWorkbenchTime(item.EventTime).UnixMilli()
	item.CapturedTs = parseWorkbenchTime(item.CapturedAt).UnixMilli()
	if 0 == item.CapturedTs {
		item.CapturedTs = item.UpdatedAt
	}
	if "" == item.RootID {
		item.RootID = item.ID
	}
	return item
}

func decorateWorkbenchStructure(items []*WorkbenchItem) {
	if 1 > len(items) {
		return
	}

	rootIDs := make([]string, 0, len(items))
	seenRoots := map[string]bool{}
	for _, item := range items {
		rootID := item.RootID
		if "" == rootID {
			rootID = item.ID
		}
		if seenRoots[rootID] {
			continue
		}
		seenRoots[rootID] = true
		rootIDs = append(rootIDs, rootID)
	}
	refCounts := sql.QueryRootBlockRefCount()
	assetCounts := sql.QueryRootAssetCount(rootIDs)
	subdocCounts := queryWorkbenchSubFileCount(items)
	for _, item := range items {
		rootID := item.RootID
		if "" == rootID {
			rootID = item.ID
		}
		item.RefCount = refCounts[rootID]
		item.AssetCount = assetCounts[rootID]
		item.SubFileCount = subdocCounts[rootID]
	}
}

func queryWorkbenchSubFileCount(items []*WorkbenchItem) (ret map[string]int) {
	ret = map[string]int{}
	for _, item := range items {
		rootID := item.RootID
		if "" == rootID {
			rootID = item.ID
		}
		if 0 < ret[rootID] {
			continue
		}
		folder := filepath.Join(util.DataDir, item.Box, strings.TrimSuffix(item.Path, ".sf"))
		subFiles, err := os.ReadDir(folder)
		if nil != err {
			continue
		}
		for _, subFile := range subFiles {
			if strings.HasSuffix(subFile.Name(), ".sf") {
				ret[rootID]++
			}
		}
	}
	return
}

func normalizeWorkbenchType(candidate, current string) string {
	candidate = strings.ToLower(strings.TrimSpace(candidate))
	if workbenchTypes[candidate] {
		return candidate
	}
	current = strings.ToLower(strings.TrimSpace(current))
	if workbenchTypes[current] {
		return current
	}
	return "note"
}

func normalizeWorkbenchStatus(typ, candidate, current string) string {
	candidate = strings.ToLower(strings.TrimSpace(candidate))
	if "" != candidate {
		return candidate
	}
	return defaultWorkbenchStatus(typ, current)
}

func normalizeWorkbenchInbox(candidate, current string) string {
	candidate = strings.ToLower(strings.TrimSpace(candidate))
	switch candidate {
	case "false", "0", "no":
		return "false"
	case "true", "1", "yes":
		return "true"
	}
	current = strings.ToLower(strings.TrimSpace(current))
	if "false" == current {
		return "false"
	}
	return "true"
}

func defaultWorkbenchInbox(typ, current string) bool {
	current = strings.ToLower(strings.TrimSpace(current))
	switch current {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	}
	return "doc" != typ
}

func buildWorkbenchPreview(block *sql.Block, attrs map[string]string) string {
	var preview string
	switch attrs[WorkbenchAttrType] {
	case "project":
		preview = strings.TrimSpace(attrs[WorkbenchAttrGoal])
		if "" == preview {
			preview = strings.TrimSpace(attrs[WorkbenchAttrNextStep])
		}
	default:
		preview = strings.TrimSpace(block.FContent)
		if preview == strings.TrimSpace(block.Content) {
			preview = strings.TrimSpace(block.Markdown)
		}
	}
	return truncateWorkbenchText(preview, 140)
}

func truncateWorkbenchText(text string, limit int) string {
	text = strings.TrimSpace(strings.ReplaceAll(text, "\r", ""))
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.Join(strings.Fields(text), " ")
	if "" == text {
		return ""
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "..."
}

func parseWorkbenchIALAttrs(ial string) (ret map[string]string) {
	ret = map[string]string{}
	if "" == strings.TrimSpace(ial) {
		return
	}
	for _, match := range workbenchIALKVRegexp.FindAllStringSubmatch(ial, -1) {
		if len(match) < 3 {
			continue
		}
		ret[match[1]] = stdhtml.UnescapeString(match[2])
	}
	return
}

func getCachedWorkbenchItems(limit int) []*WorkbenchItem {
	workbenchListCache.Lock()
	defer workbenchListCache.Unlock()
	if workbenchListCache.expiresAt.Before(time.Now()) || 1 > len(workbenchListCache.items) || workbenchListCache.limit < limit {
		return nil
	}
	if limit > len(workbenchListCache.items) {
		limit = len(workbenchListCache.items)
	}
	ret := make([]*WorkbenchItem, 0, limit)
	ret = append(ret, workbenchListCache.items[:limit]...)
	return ret
}

func cacheWorkbenchItems(limit int, items []*WorkbenchItem) {
	workbenchListCache.Lock()
	defer workbenchListCache.Unlock()
	workbenchListCache.limit = limit
	workbenchListCache.items = append([]*WorkbenchItem(nil), items...)
	workbenchListCache.expiresAt = time.Now().Add(3 * time.Second)
}

func invalidateWorkbenchListCache() {
	workbenchListCache.Lock()
	defer workbenchListCache.Unlock()
	workbenchListCache.limit = 0
	workbenchListCache.items = nil
	workbenchListCache.expiresAt = time.Time{}
	invalidateWorkbenchQueryCache()
}

func getCachedWorkbenchQueryResult(key string) *WorkbenchQueryResult {
	workbenchQueryCache.Lock()
	defer workbenchQueryCache.Unlock()
	entry := workbenchQueryCache.entries[key]
	if nil == entry || time.Now().After(entry.expiresAt) {
		delete(workbenchQueryCache.entries, key)
		return nil
	}
	return entry.result
}

func cacheWorkbenchQueryResult(key string, result *WorkbenchQueryResult) {
	workbenchQueryCache.Lock()
	defer workbenchQueryCache.Unlock()
	workbenchQueryCache.entries[key] = &workbenchQueryCacheEntry{
		expiresAt: time.Now().Add(12 * time.Second),
		result:    result,
	}
}

func invalidateWorkbenchQueryCache() {
	workbenchQueryCache.Lock()
	defer workbenchQueryCache.Unlock()
	workbenchQueryCache.entries = map[string]*workbenchQueryCacheEntry{}
}

func parseWorkbenchTime(value string) time.Time {
	value = strings.TrimSpace(value)
	if "" == value {
		return time.Time{}
	}

	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
		"2006-01-02 15:04:05",
		"2006-01-02 15:04",
		"2006-01-02",
		"20060102150405",
		"20060102",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, value, time.Local); nil == err {
			return t
		}
	}
	return time.Time{}
}
