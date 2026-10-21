const defaultAIBaseURL = "https://aiapi.muskpay.top/v1";
const defaultAIModel = "gpt-5.5";

function aiConfig() {
  const baseURL = (process.env.AI_BASE_URL || defaultAIBaseURL).replace(/\/$/, "");
  const apiKey = process.env.AI_API_KEY || process.env.MUSKPAY_API_KEY || "";
  const model = process.env.AI_MODEL || defaultAIModel;
  return { baseURL, apiKey, model };
}

async function callAI(
  maxTokens: number,
  temperature: number,
  systemPrompt: string,
  userPrompt: string
) {
  const { baseURL, apiKey, model } = aiConfig();
  if (!apiKey) {
    throw new Error("AI API key is not configured");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: maxTokens,
          temperature,
        }),
        signal: AbortSignal.timeout(180_000),
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`AI API error ${response.status}: ${text}`);
      }
      const data = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`empty content in response: ${text}`);
      }
      return content;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 2000));
      }
    }
  }
  throw new Error(`AI request failed after 3 attempts: ${String(lastError)}`);
}

export function callKimi(systemPrompt: string, userPrompt: string) {
  return callAI(500, 0.3, systemPrompt, userPrompt);
}

export function analyzeEvent(systemPrompt: string, userPrompt: string) {
  return callAI(600, 0.3, systemPrompt, userPrompt);
}

export function generateProfile(prompt: string) {
  return callAI(
    1200,
    0.7,
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
    prompt
  );
}
