package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/conf"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

func TestSyncSettingHandlersRejectInvalidArgumentsWithoutPanicking(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name    string
		handler gin.HandlerFunc
		body    string
	}{
		{name: "generate conflict doc missing enabled", handler: setSyncGenerateConflictDoc, body: `{}`},
		{name: "perform sync wrong mobile switch type", handler: performSync, body: `{"mobileSwitch":"false"}`},
		{name: "sync enable wrong type", handler: setSyncEnable, body: `{"enabled":"true"}`},
		{name: "perception null", handler: setSyncPerception, body: `{"enabled":null}`},
		{name: "mode wrong type", handler: setSyncMode, body: `{"mode":"1"}`},
		{name: "provider missing", handler: setSyncProvider, body: `{}`},
		{name: "S3 null", handler: setSyncProviderS3, body: `{"s3":null}`},
		{name: "S3 test array", handler: testSyncProviderS3, body: `{"s3":[]}`},
		{name: "WebDAV missing", handler: setSyncProviderWebDAV, body: `{}`},
		{name: "WebDAV test null", handler: testSyncProviderWebDAV, body: `{"webdav":null}`},
		{name: "local wrong type", handler: setSyncProviderLocal, body: `{"local":"/backup"}`},
		{name: "cloud directory wrong type", handler: setCloudSyncDir, body: `{"name":1}`},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := callAPIHandler(t, test.handler, test.body)
			if 0 <= response.Code {
				t.Fatalf("invalid request returned code %d, want a negative error code", response.Code)
			}
			if "" == response.Msg {
				t.Fatal("invalid request returned an empty error message")
			}
		})
	}
}

func TestPerformSyncRejectsInvalidManualDirectionWithoutPanicking(t *testing.T) {
	oldConf := model.Conf
	model.Conf = model.NewAppConf()
	model.Conf.Sync = conf.NewSync()
	model.Conf.Sync.Mode = 3
	t.Cleanup(func() { model.Conf = oldConf })

	response := callAPIHandler(t, performSync, `{"upload":"true"}`)
	if 0 <= response.Code || "" == response.Msg {
		t.Fatalf("invalid manual direction returned code=%d msg=%q", response.Code, response.Msg)
	}
}

func callAPIHandler(t *testing.T, handler gin.HandlerFunc, body string) *gulu.Result {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")

	handler(context)

	result := &gulu.Result{}
	if err := json.Unmarshal(recorder.Body.Bytes(), result); nil != err {
		t.Fatalf("decode response failed: %v; body=%s", err, recorder.Body.String())
	}
	return result
}
