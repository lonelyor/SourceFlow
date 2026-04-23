module github.com/lonelyor/sourceflow/third_party/go/logging

go 1.24.0

toolchain go1.24.9

require github.com/lonelyor/sourceflow/third_party/go/gulu v1.2.3-0.20251107023402-569f52804e3b

require (
	golang.org/x/sys v0.40.0 // indirect
	golang.org/x/text v0.33.0 // indirect
)

replace github.com/lonelyor/sourceflow/third_party/go/gulu => ../gulu
