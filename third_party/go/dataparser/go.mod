module github.com/lonelyor/sourceflow/third_party/go/dataparser

go 1.24.4

require (
	github.com/goccy/go-json v0.10.5
	github.com/lonelyor/sourceflow/third_party/go/gulu v1.2.3-0.20251208021445-f93f2666eaac
	github.com/lonelyor/sourceflow/third_party/go/lute v1.7.7-0.20260114095037-49a2cce7593f
)

require (
	golang.org/x/sys v0.40.0 // indirect
	golang.org/x/text v0.33.0 // indirect
)

replace github.com/lonelyor/sourceflow/third_party/go/lute => ../lute

replace github.com/lonelyor/sourceflow/third_party/go/gulu => ../gulu
