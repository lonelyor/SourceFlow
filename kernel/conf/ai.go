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

package conf

import (
	"strconv"

	"github.com/lonelyor/sourceflow/kernel/util"
	"github.com/sashabaranov/go-openai"
)

type AI struct {
	OpenAI *OpenAI `json:"openAI"`
}

type OpenAI struct {
	APIKey         string  `json:"apiKey"`
	APITimeout     int     `json:"apiTimeout"`
	APIProxy       string  `json:"apiProxy"`
	APIModel       string  `json:"apiModel"`
	APIMaxTokens   int     `json:"apiMaxTokens"`
	APITemperature float64 `json:"apiTemperature"`
	APIMaxContexts int     `json:"apiMaxContexts"`
	APIBaseURL     string  `json:"apiBaseURL"`
	APIUserAgent   string  `json:"apiUserAgent"`
	APIProvider    string  `json:"apiProvider"` // OpenAI, Azure
	APIVersion     string  `json:"apiVersion"`  // Azure API version
}

func NewAI() *AI {
	openAI := &OpenAI{
		APITemperature: 1.0,
		APIMaxContexts: 7,
		APITimeout:     30,
		APIModel:       openai.GPT3Dot5Turbo,
		APIBaseURL:     "https://api.openai.com/v1",
		APIProvider:    "OpenAI",
	}

	openAI.APIKey = util.GetEnv(util.OpenAIAPIKeyEnv)

	if timeout := util.GetEnv(util.OpenAIAPITimeoutEnv); "" != timeout {
		timeoutInt, err := strconv.Atoi(timeout)
		if err == nil {
			openAI.APITimeout = timeoutInt
		}
	}

	if proxy := util.GetEnv(util.OpenAIAPIProxyEnv); "" != proxy {
		openAI.APIProxy = proxy
	}

	if maxTokens := util.GetEnv(util.OpenAIAPIMaxTokensEnv); "" != maxTokens {
		maxTokensInt, err := strconv.Atoi(maxTokens)
		if err == nil {
			openAI.APIMaxTokens = maxTokensInt
		}
	}

	if temperature := util.GetEnv(util.OpenAIAPITemperatureEnv); "" != temperature {
		temperatureFloat, err := strconv.ParseFloat(temperature, 64)
		if err == nil {
			openAI.APITemperature = temperatureFloat
		}
	}

	if maxContexts := util.GetEnv(util.OpenAIAPIMaxContextsEnv); "" != maxContexts {
		maxContextsInt, err := strconv.Atoi(maxContexts)
		if err == nil {
			openAI.APIMaxContexts = maxContextsInt
		}
	}

	if baseURL := util.GetEnv(util.OpenAIAPIBaseURLEnv); "" != baseURL {
		openAI.APIBaseURL = baseURL
	}

	if userAgent := util.GetEnv(util.OpenAIAPIUserAgentEnv); "" != userAgent {
		openAI.APIUserAgent = userAgent
	}
	return &AI{OpenAI: openAI}
}
