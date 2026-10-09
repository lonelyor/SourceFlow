// SourceFlow - Make knowledge flow
// Copyright (c) 2020-present, SourceFlow contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>.

package model

import (
	"strings"
	"testing"

	"github.com/lonelyor/sourceflow/kernel/conf"
)

func newValidS3TestConfig() *conf.S3 {
	return &conf.S3{
		Endpoint:       "https://oss-cn-hangzhou.aliyuncs.com/",
		AccessKey:      "test-access-key",
		SecretKey:      "test-secret-key",
		Bucket:         "sourceflow-test-bucket",
		Region:         "cn-hangzhou",
		PathStyle:      false,
		SkipTlsVerify:  false,
		Timeout:        30,
		ConcurrentReqs: 4,
	}
}

// TestValidateS3ConnectionTestConfigRejectsEmptyFields 验证连接测试配置校验：
// 任一必填项为空时都应返回明确的错误。
func TestValidateS3ConnectionTestConfigRejectsEmptyFields(t *testing.T) {
	cases := []struct {
		name    string
		mutate  func(s3 *conf.S3)
		wantErr string
	}{
		{"empty endpoint", func(s3 *conf.S3) { s3.Endpoint = "" }, "endpoint is empty"},
		{"empty access key", func(s3 *conf.S3) { s3.AccessKey = "" }, "access key is empty"},
		{"empty secret key", func(s3 *conf.S3) { s3.SecretKey = "" }, "secret key is empty"},
		{"empty bucket", func(s3 *conf.S3) { s3.Bucket = "" }, "bucket is empty"},
		{"invalid bucket name", func(s3 *conf.S3) { s3.Bucket = "invalid bucket/name" }, "invalid bucket name"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s3 := newValidS3TestConfig()
			c.mutate(s3)
			err := validateS3ConnectionTestConfig(s3)
			if nil == err {
				t.Fatalf("validateS3ConnectionTestConfig returned nil, want error [%s]", c.wantErr)
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("error [%s] does not contain [%s]", err.Error(), c.wantErr)
			}
		})
	}
}

// TestValidateS3ConnectionTestConfigAcceptsProviders 验证常见 S3 兼容服务商的
// bucket 命名（含 Cloudflare R2、腾讯 COS 的 APPID 后缀）均可通过校验。
func TestValidateS3ConnectionTestConfigAcceptsProviders(t *testing.T) {
	cases := []struct {
		name     string
		endpoint string
		bucket   string
	}{
		{"cloudflare r2", "https://accountid.r2.cloudflarestorage.com/", "sourceflow"},
		{"aliyun oss", "https://oss-cn-hangzhou.aliyuncs.com/", "sourceflow-notes"},
		{"tencent cos", "https://cos.ap-guangzhou.myqcloud.com/", "sourceflow-1250000000"},
		{"minio path style", "http://192.168.1.10:9000/", "sourceflow"},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			s3 := newValidS3TestConfig()
			s3.Endpoint = c.endpoint
			s3.Bucket = c.bucket
			if err := validateS3ConnectionTestConfig(s3); nil != err {
				t.Fatalf("validateS3ConnectionTestConfig returned error [%s], want nil", err)
			}
		})
	}
}

// TestTestSyncProviderS3NilConfig 验证空配置不会导致 panic。
func TestTestSyncProviderS3NilConfig(t *testing.T) {
	if err := TestSyncProviderS3(nil); nil == err {
		t.Fatal("TestSyncProviderS3(nil) returned nil, want error")
	}
}
