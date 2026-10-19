package api

import (
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSettingHandlersRejectInvalidArgumentsWithoutPanicking(t *testing.T) {
	gin.SetMode(gin.TestMode)
	tests := []struct {
		name    string
		handler gin.HandlerFunc
		body    string
	}{
		{name: "editor readonly missing", handler: setEditorReadOnly, body: `{}`},
		{name: "emoji wrong container", handler: setEmoji, body: `{"emoji":"smile"}`},
		{name: "emoji wrong element", handler: setEmoji, body: `{"emoji":["smile",1]}`},
		{name: "API token wrong type", handler: setAPIToken, body: `{"token":true}`},
		{name: "access auth code wrong type", handler: setAccessAuthCode, body: `{"accessAuthCode":1}`},
		{name: "lock screen mode missing", handler: setFollowSystemLockScreen, body: `{}`},
		{name: "appearance mode wrong type", handler: setAppearanceMode, body: `{"mode":"0"}`},
		{name: "network serve null", handler: setNetworkServe, body: `{"networkServe":null}`},
		{name: "network TLS wrong type", handler: setNetworkServeTLS, body: `{"networkServeTLS":1}`},
		{name: "auto launch wrong type", handler: setAutoLaunch, body: `{"autoLaunch":false}`},
		{name: "download package missing", handler: setDownloadInstallPkg, body: `{}`},
		{name: "network proxy missing port", handler: setNetworkProxy, body: `{"scheme":"http","host":"localhost"}`},
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
