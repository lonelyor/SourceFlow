package cmd

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/kernel/util"
)

type assistantTerminalOpen struct{ *BaseCmd }
type assistantTerminalInput struct{ *BaseCmd }
type assistantTerminalResize struct{ *BaseCmd }
type assistantTerminalClose struct{ *BaseCmd }

func (cmd *assistantTerminalOpen) Exec() {
	sessionID := cmd.stringParam("sessionId")
	width := cmd.intParam("width")
	height := cmd.intParam("height")
	session, err := model.OpenAssistantTerminalRuntime(sessionID, width, height, cmd.session)
	if err != nil {
		cmd.writeError("assistantTerminalOpen", err)
		return
	}
	cmd.writeOK("assistantTerminalOpen", session)
}

func (cmd *assistantTerminalOpen) Name() string { return "assistantTerminalOpen" }
func (cmd *assistantTerminalOpen) IsRead() bool { return false }

func (cmd *assistantTerminalInput) Exec() {
	sessionID := cmd.stringParam("sessionId")
	data := cmd.rawStringParam("data")
	commandText := cmd.stringParam("commandText")
	if err := model.InputAssistantTerminalRuntime(sessionID, data, commandText); err != nil {
		cmd.writeError("assistantTerminalInput", err)
		return
	}
	cmd.writeOK("assistantTerminalInput", map[string]interface{}{"sessionId": sessionID})
}

func (cmd *assistantTerminalInput) Name() string { return "assistantTerminalInput" }
func (cmd *assistantTerminalInput) IsRead() bool { return false }

func (cmd *assistantTerminalResize) Exec() {
	sessionID := cmd.stringParam("sessionId")
	width := cmd.intParam("width")
	height := cmd.intParam("height")
	if err := model.ResizeAssistantTerminalRuntime(sessionID, width, height); err != nil {
		cmd.writeError("assistantTerminalResize", err)
		return
	}
	cmd.writeOK("assistantTerminalResize", map[string]interface{}{"sessionId": sessionID, "width": width, "height": height})
}

func (cmd *assistantTerminalResize) Name() string { return "assistantTerminalResize" }
func (cmd *assistantTerminalResize) IsRead() bool { return true }

func (cmd *assistantTerminalClose) Exec() {
	sessionID := cmd.stringParam("sessionId")
	if err := model.CloseAssistantTerminalRuntime(sessionID); err != nil {
		cmd.writeError("assistantTerminalClose", err)
		return
	}
	cmd.writeOK("assistantTerminalClose", map[string]interface{}{"sessionId": sessionID})
}

func (cmd *assistantTerminalClose) Name() string { return "assistantTerminalClose" }
func (cmd *assistantTerminalClose) IsRead() bool { return false }

func (cmd *BaseCmd) writeOK(name string, data interface{}) {
	result := util.NewCmdResult(name, cmd.id, util.PushModeSingleSelf)
	if appID, ok := cmd.session.Get("app"); ok {
		result.AppId = appID.(string)
	}
	if sid, ok := cmd.session.Get("id"); ok {
		result.SessionId = sid.(string)
	}
	result.Data = data
	_ = cmd.session.Write(result.Bytes())
}

func (cmd *BaseCmd) writeError(name string, err error) {
	result := util.NewCmdResult(name, cmd.id, util.PushModeSingleSelf)
	result.Code = -1
	result.Msg = err.Error()
	if appID, ok := cmd.session.Get("app"); ok {
		result.AppId = appID.(string)
	}
	if sid, ok := cmd.session.Get("id"); ok {
		result.SessionId = sid.(string)
	}
	_ = cmd.session.Write(result.Bytes())
}

func (cmd *BaseCmd) stringParam(key string) string {
	if value, ok := cmd.param[key]; ok && nil != value {
		switch v := value.(type) {
		case string:
			return strings.TrimSpace(v)
		case fmt.Stringer:
			return strings.TrimSpace(v.String())
		}
	}
	return ""
}

func (cmd *BaseCmd) rawStringParam(key string) string {
	if value, ok := cmd.param[key]; ok && nil != value {
		switch v := value.(type) {
		case string:
			return v
		case fmt.Stringer:
			return v.String()
		}
	}
	return ""
}

func (cmd *BaseCmd) intParam(key string) int {
	if value, ok := cmd.param[key]; ok && nil != value {
		switch v := value.(type) {
		case float64:
			return int(v)
		case int:
			return v
		case string:
			parsed, _ := strconv.Atoi(strings.TrimSpace(v))
			return parsed
		}
	}
	return 0
}
