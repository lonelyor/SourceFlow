package cache

import "testing"

func TestTreeCacheCopiesRawData(t *testing.T) {
	ClearTreeCache()
	defer ClearTreeCache()

	raw := []byte(`{"Type":"NodeDocument"}`)
	SetTreeData("20260601120000-abcdefg", raw)
	treeCache.Wait()
	raw[0] = '['

	cached, ok := GetTreeData("20260601120000-abcdefg")
	if !ok {
		t.Fatal("expected cached tree data")
	}
	if string(cached) != `{"Type":"NodeDocument"}` {
		t.Fatalf("cached data was mutated by caller: %s", cached)
	}

	cached[0] = '['
	cachedAgain, ok := GetTreeData("20260601120000-abcdefg")
	if !ok {
		t.Fatal("expected cached tree data on second read")
	}
	if string(cachedAgain) != `{"Type":"NodeDocument"}` {
		t.Fatalf("cache returned shared data: %s", cachedAgain)
	}
}
