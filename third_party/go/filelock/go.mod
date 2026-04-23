module github.com/lonelyor/sourceflow/third_party/go/filelock

go 1.25.0

require (
	github.com/lonelyor/sourceflow/third_party/go/gulu v1.2.3-0.20260124101918-98654a7ca98a
	github.com/lonelyor/sourceflow/third_party/go/httpclient v0.0.0-20260115093840-2754d8028f22
	github.com/lonelyor/sourceflow/third_party/go/logging v0.0.0-20260117134552-88b424dfe7f1
)

require (
	github.com/andybalholm/brotli v1.2.0 // indirect
	github.com/google/go-querystring v1.2.0 // indirect
	github.com/icholy/digest v1.1.0 // indirect
	github.com/imroc/req/v3 v3.57.0 // indirect
	github.com/klauspost/compress v1.18.4 // indirect
	github.com/quic-go/qpack v0.6.0 // indirect
	github.com/quic-go/quic-go v0.58.0 // indirect
	github.com/refraction-networking/utls v1.8.2 // indirect
	golang.org/x/crypto v0.49.0 // indirect
	golang.org/x/net v0.52.0 // indirect
	golang.org/x/sys v0.42.0 // indirect
	golang.org/x/text v0.35.0 // indirect
)

replace github.com/lonelyor/sourceflow/third_party/go/httpclient => ../httpclient

replace github.com/lonelyor/sourceflow/third_party/go/logging => ../logging

replace github.com/lonelyor/sourceflow/third_party/go/gulu => ../gulu
