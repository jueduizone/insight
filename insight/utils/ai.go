package utils

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/spf13/viper"
)

const defaultAIBaseURL = "https://aiapi.muskpay.top/v1"
const defaultAIModel = "gpt-5.5"
const defaultAITimeout = 180 * time.Second

type aiResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func aiConfig() (baseURL, apiKey, model string) {
	baseURL = strings.TrimRight(viper.GetString("ai.base_url"), "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(os.Getenv("AI_BASE_URL"), "/")
	}
	if baseURL == "" {
		baseURL = defaultAIBaseURL
	}

	apiKey = viper.GetString("ai.api_key")
	if strings.HasPrefix(apiKey, "${") && strings.HasSuffix(apiKey, "}") {
		apiKey = os.Getenv(strings.TrimSuffix(strings.TrimPrefix(apiKey, "${"), "}"))
	}
	if apiKey == "" {
		apiKey = os.Getenv("AI_API_KEY")
	}
	if apiKey == "" {
		apiKey = os.Getenv("MUSKPAY_API_KEY")
	}

	model = viper.GetString("ai.model")
	if model == "" {
		model = os.Getenv("AI_MODEL")
	}
	if model == "" {
		model = defaultAIModel
	}
	return baseURL, apiKey, model
}

// callAI calls the configured OpenAI-compatible chat completions API.
// Defaults mirror the current Hermes model provider: MuskPay gpt-5.5.
func callAI(maxTokens int, temperature float64, systemPrompt, userPrompt string) (string, error) {
	baseURL, apiKey, model := aiConfig()
	if apiKey == "" {
		return "", fmt.Errorf("AI API key is not configured")
	}

	body, err := json.Marshal(map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"max_tokens":  maxTokens,
		"temperature": temperature,
	})
	if err != nil {
		return "", err
	}

	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		req, err := http.NewRequest("POST", baseURL+"/chat/completions", bytes.NewReader(body))
		if err != nil {
			return "", err
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+apiKey)

		client := &http.Client{Timeout: defaultAITimeout}
		resp, err := client.Do(req)
		if err != nil {
			lastErr = err
			time.Sleep(time.Duration(attempt+1) * 2 * time.Second)
			continue
		}

		respBytes, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}

		if resp.StatusCode >= 400 {
			return "", fmt.Errorf("AI API error %d: %s", resp.StatusCode, string(respBytes))
		}

		var result aiResponse
		if err := json.Unmarshal(respBytes, &result); err != nil {
			return "", err
		}
		if len(result.Choices) == 0 {
			return "", fmt.Errorf("no choices in response")
		}
		content := result.Choices[0].Message.Content
		if content == "" {
			var raw map[string]interface{}
			if err := json.Unmarshal(respBytes, &raw); err == nil {
				if len(raw) > 0 {
					return "", fmt.Errorf("empty content in response: %v", raw)
				}
			}
			return "", fmt.Errorf("empty content in response")
		}
		return content, nil
	}
	return "", fmt.Errorf("AI request failed after 3 attempts: %v", lastErr)
}

// CallKimi keeps the legacy function name for field mapping/extraction callers.
func CallKimi(systemPrompt, userPrompt string) (string, error) {
	return callAI(500, 0.3, systemPrompt, userPrompt)
}

// GenerateProfile generates a structured developer profile.
func GenerateProfile(prompt string) (string, error) {
	return callAI(1200, 0.7,
		`你是 Monad 生态开发者运营助手，根据提供的开发者信息生成结构化画像。
严格按以下 Markdown 格式输出，不要添加额外标题或说明，无法判断的项填"未知"：

## 开发者画像
（2-3句综合描述该开发者的背景、技能和生态参与情况）

## 角色定位
（从以下选一个最符合的：前端/后端/全栈/智能合约/产品/设计/其他）

## 技术潜力 ⭐[1-5]星
（1句理由，依据技术栈、GitHub 活跃度、语言深度）

## 商业潜力 ⭐[1-5]星
（1句理由，依据项目经验、商业意识、已有产品）

## Monad 关联度 ⭐[1-5]星
（1句理由，依据 monad_commits 数量、参会次数、Monad 相关表述）

## 运营建议
（针对 Monad 生态运营团队的1-2条具体建议，如：邀请参与 Monad 生态项目/重点孵化/邀请线下活动/普通维护等）`,
		prompt,
	)
}

func AnalyzeEvent(systemPrompt, userPrompt string) (string, error) {
	return callAI(600, 0.3, systemPrompt, userPrompt)
}
