package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/lonelyor/sourceflow/kernel/model"
	"github.com/lonelyor/sourceflow/third_party/go/gulu"
)

// assistantRulesRun 把「规则 + 目标文档列表」提交为一次规则运行：编译为 Agent 任务，
// 复用既有任务队列与 lease；Move 能力关闭等安全拒绝时任务整批暂停并说明原因。
func assistantRulesRun(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantRuleRunRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	result, err := model.RunAssistantRule(req)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = result
}

// assistantRulesValidate 是规则运行的 dryRun 预览：返回每个 target 将执行的动作摘要，不产生任何写入。
func assistantRulesValidate(c *gin.Context) {
	ret := gulu.Ret.NewResult()
	defer c.JSON(http.StatusOK, ret)

	req := &model.AssistantRuleRunRequest{}
	if err := c.ShouldBindJSON(req); err != nil {
		ret.Code = -1
		ret.Msg = "invalid request"
		return
	}
	result, err := model.ValidateAssistantRule(req)
	if nil != err {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
	ret.Data = result
}
