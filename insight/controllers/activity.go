package controllers

import (
	"encoding/csv"
	"encoding/json"
	"insight/models"
	"insight/utils"
	"insight/workers"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// CreateEvent POST /v1/events
func CreateEvent(c *gin.Context) {
	var req CreateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	event := models.ActivityEvent{
		Name:        req.Name,
		Type:        req.Type,
		Platform:    req.Platform,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
		Description: req.Description,
	}

	if err := models.CreateActivityEvent(&event); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create event", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Event created", event)
}

// QueryEvents GET /v1/events
func QueryEvents(c *gin.Context) {
	var filter models.ActivityEventFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid query parameters", err.Error())
		return
	}

	events, total, err := models.QueryActivityEvents(filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch events", err.Error())
		return
	}

	// 附加每个活动的统计数据
	type EventWithStats struct {
		models.ActivityEvent
		ParticipantCount int `json:"participant_count"`
		AwardedCount     int `json:"awarded_count"`
	}
	result := make([]EventWithStats, 0, len(events))
	for _, e := range events {
		pCount, _ := models.GetActivityRecordCountByEventID(e.ID)
		aCount, _ := models.GetAwardedCountByEventID(e.ID)
		result = append(result, EventWithStats{
			ActivityEvent:    e,
			ParticipantCount: int(pCount),
			AwardedCount:     int(aCount),
		})
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
		"events":    result,
		"total":     total,
		"page":      filter.Page,
		"page_size": filter.PageSize,
	})
}

// GetEvent GET /v1/events/:id
func GetEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	event, err := models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", event)
}

// UpdateEvent PUT /v1/events/:id
func UpdateEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	event, err := models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	var req UpdateEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	if req.Name != "" {
		event.Name = req.Name
	}
	event.Type = req.Type
	event.Platform = req.Platform
	event.Description = req.Description
	if !req.StartDate.IsZero() {
		event.StartDate = req.StartDate
	}
	if !req.EndDate.IsZero() {
		event.EndDate = req.EndDate
	}

	if err := models.UpdateActivityEvent(event); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update event", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Event updated", event)
}

// DeleteEvent DELETE /v1/events/:id
func DeleteEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	_, err = models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	count, err := models.GetActivityRecordCountByEventID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to check records", err.Error())
		return
	}
	if count > 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "该活动已有参与者记录，无法删除", nil)
		return
	}

	if err := models.DeleteActivityEvent(uint(id)); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete event", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Event deleted", nil)
}

// ImportCSV POST /v1/events/:id/import
// mode=preview: parse CSV, return columns + first 5 rows (no DB write)
// mode=import:  import with field_mapping JSON
func ImportCSV(c *gin.Context) {
	eventID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid event ID", nil)
		return
	}

	// Verify event exists
	_, err = models.GetActivityEventByID(uint(eventID))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	mode := c.DefaultPostForm("mode", "preview")

	if c.Request.ContentLength > 10*1024*1024 {
		utils.ErrorResponse(c, http.StatusRequestEntityTooLarge, "File too large (max 10MB)", nil)
		return
	}

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Missing CSV file", err.Error())
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Failed to parse CSV", err.Error())
		return
	}

	if len(records) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "CSV file is empty", nil)
		return
	}

	headers := records[0]
	rows := records[1:]

	if mode == "preview" {
		preview := rows
		if len(preview) > 5 {
			preview = rows[:5]
		}
		utils.SuccessResponse(c, http.StatusOK, "Preview", gin.H{
			"columns": headers,
			"rows":    preview,
		})
		return
	}

	// mode == "import"
	mappingStr := c.PostForm("field_mapping")
	if mappingStr == "" {
		utils.ErrorResponse(c, http.StatusBadRequest, "field_mapping is required for import mode", nil)
		return
	}

	// field_mapping: { internal_field: csv_column_name }
	// e.g. {"email":"Email Address","username":"Full Name","github":"GitHub","wallet_address":"Wallet","award":"Prize"}
	var fieldMapping map[string]string
	if err := json.Unmarshal([]byte(mappingStr), &fieldMapping); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid field_mapping JSON", err.Error())
		return
	}

	// Build column index map: csv_column_name → index
	colIndex := make(map[string]int)
	for i, h := range headers {
		colIndex[strings.TrimSpace(h)] = i
	}

	// Helper: get value from a row by internal field name
	getValue := func(row []string, field string) string {
		col, ok := fieldMapping[field]
		if !ok {
			return ""
		}
		idx, ok := colIndex[col]
		if !ok || idx >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[idx])
	}

	created := 0
	merged := 0
	recordCreated := 0
	recordUpdated := 0
	var githubLogins []string

	for _, row := range rows {
		email := getValue(row, "email")
		github := getValue(row, "github")
		wallet := getValue(row, "wallet_address")
		username := getValue(row, "username")
		firstName := getValue(row, "first_name")
		lastName := getValue(row, "last_name")
		award := getValue(row, "award")
		role := getValue(row, "role")
		status := getValue(row, "status")
		wechat := getValue(row, "wechat")
		telegram := getValue(row, "telegram")
		existingProjects := getValue(row, "existing_projects")
		intro := getValue(row, "intro")
		monadExperience := getValue(row, "monad_experience")
		joinedAtStr := getValue(row, "joined_at")

		// Parse joined_at: try common formats
		var joinedAt *time.Time
		for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02T15:04:05Z", "2006/01/02 15:04:05", "2006-01-02"} {
			if t, err := time.Parse(layout, strings.TrimSpace(joinedAtStr)); err == nil {
				joinedAt = &t
				break
			}
		}

		// If username is empty but first/last name present, compose it (姓在前)
		if username == "" && (lastName != "" || firstName != "") {
			username = strings.TrimSpace(lastName + " " + firstName)
		}

		// Skip rows with no identity fields
		if email == "" && github == "" && wallet == "" && username == "" {
			continue
		}

		// Dedup: find existing user by priority
		var existingUser *models.User

		if email != "" {
			u, err := models.GetUserByEmail(email)
			if err == nil && u.ID > 0 {
				existingUser = u
			}
		}
		if existingUser == nil && github != "" {
			u, err := models.GetUserByGithub(github)
			if err == nil && u.ID > 0 {
				existingUser = u
			}
		}
		if existingUser == nil && wallet != "" {
			u, err := models.GetUserByWalletAddress(wallet)
			if err == nil && u.ID > 0 {
				existingUser = u
			}
		}

		var userID uint
		if existingUser != nil {
			// Merge: update non-empty fields
			if email != "" && existingUser.Email == "" {
				existingUser.Email = email
			}
			if username != "" {
				existingUser.Username = username
			}
			if github != "" {
				existingUser.Github = github
			}
			if wallet != "" {
				existingUser.WalletAddress = wallet
			}
			if wechat != "" {
				existingUser.Wechat = wechat
			}
			if telegram != "" {
				existingUser.Telegram = telegram
			}
			if existingProjects != "" {
				existingUser.ExistingProjects = existingProjects
				if len(existingProjects) > 30 {
					existingUser.ProjectsRaw = existingProjects
					existingUser.ProjectsCleaned = false
				}
			}
			if intro != "" {
				existingUser.Intro = intro
			}
			if monadExperience != "" {
				existingUser.MonadExperience = monadExperience
			}
			// 确保 CSV 导入的用户 role 为 member（防止 GORM default:admin 污染）
			if existingUser.Role != "admin" && existingUser.Role != "super_admin" {
				existingUser.Role = "member"
			}
			// 更新 first_joined_at：取最早时间
			if joinedAt != nil {
				if existingUser.FirstJoinedAt == nil || joinedAt.Before(*existingUser.FirstJoinedAt) {
					existingUser.FirstJoinedAt = joinedAt
				}
			}
			models.UpdateUser(existingUser)
			userID = existingUser.ID
			merged++
		} else {
			// Create new user
			newUser := models.User{
				Email:            email,
				Username:         username,
				Github:           github,
				WalletAddress:    wallet,
				Wechat:           wechat,
				Telegram:         telegram,
				ExistingProjects: existingProjects,
				Intro:            intro,
				MonadExperience:  monadExperience,
				Role:             "member",
				FirstJoinedAt:    joinedAt,
			}
			if len(existingProjects) > 30 {
				newUser.ProjectsRaw = existingProjects
				newUser.ProjectsCleaned = false
			}
			if err := models.CreateUser(&newUser); err != nil {
				log.Printf("[ImportCSV] CreateUser failed for email=%s github=%s: %v", email, github, err)
				continue
			}
			userID = newUser.ID
			created++
		}

		// Collect extra fields not in standard mapping (for activity record)
		standardFields := map[string]bool{
			"email": true, "username": true, "first_name": true, "last_name": true,
			"github": true, "wallet_address": true, "award": true, "role": true,
			"status": true, "wechat": true, "telegram": true, "existing_projects": true,
			"intro": true, "monad_experience": true, "joined_at": true,
		}
		extraData := make(map[string]string)
		for field, col := range fieldMapping {
			if !standardFields[field] {
				idx, ok := colIndex[col]
				if ok && idx < len(row) {
					extraData[field] = strings.TrimSpace(row[idx])
				}
			}
		}
		extraJSON, _ := json.Marshal(extraData)

		// Build extra_csv_data: ALL columns not covered by standard mapping (including unmapped headers)
		// Key = original CSV column header, value = cell content
		mappedCols := make(map[string]bool) // CSV column names that map to standard fields
		for field, col := range fieldMapping {
			if standardFields[field] {
				mappedCols[col] = true
			}
		}
		extraCSV := make(map[string]string)
		for _, h := range headers {
			if !mappedCols[h] {
				idx, ok := colIndex[h]
				if ok && idx < len(row) {
					v := strings.TrimSpace(row[idx])
					if v != "" {
						extraCSV[h] = v
					}
				}
			}
		}
		extraCSVJSON, _ := json.Marshal(extraCSV)

		// Persist extra_csv_data to user record (merge with existing)
		if len(extraCSV) > 0 {
			if existingUser != nil {
				// Merge: existing extra_csv_data + new values (new wins on conflict)
				merged_extra := make(map[string]string)
				if len(existingUser.ExtraCSVData) > 0 {
					_ = json.Unmarshal(existingUser.ExtraCSVData, &merged_extra)
				}
				for k, v := range extraCSV {
					if v != "" {
						merged_extra[k] = v
					}
				}
				if b, err := json.Marshal(merged_extra); err == nil {
					models.UpdateUserExtraCSVData(userID, b)
				}
			} else {
				models.UpdateUserExtraCSVData(userID, extraCSVJSON)
			}
		}

		record := models.ActivityRecord{
			UserID:    userID,
			EventID:   uint(eventID),
			Award:     award,
			Role:      role,
			Status:    status,
			ExtraData: extraJSON,
		}
		wasCreated, _ := models.UpsertActivityRecord(&record)
		if wasCreated {
			recordCreated++
		} else {
			recordUpdated++
		}

		if github != "" {
			githubLogins = append(githubLogins, github)
		}
	}

	// Async trigger Web3Insight analysis for all imported users with GitHub accounts
	web3insightTriggered := len(githubLogins) > 0
	if web3insightTriggered {
		go func(logins []string) {
			taskID, err := utils.TriggerWeb3InsightAnalysis(logins)
			if err != nil {
				log.Printf("Web3Insight analysis trigger failed: %v", err)
			} else {
				log.Printf("Web3Insight analysis triggered, task_id: %s", taskID)
			}
		}(githubLogins)
	}

	// Async trigger project cleaning for any newly marked users
	go workers.CleanProjects()

	utils.SuccessResponse(c, http.StatusOK, "Import complete", gin.H{
		"created":               created,
		"merged":                merged,
		"record_created":        recordCreated,
		"record_updated":        recordUpdated,
		"web3insight_triggered": web3insightTriggered,
	})
}

// GetEventRecords GET /v1/events/:id/records
func GetEventRecords(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")
	page, _ := strconv.Atoi(pageStr)
	pageSize, _ := strconv.Atoi(pageSizeStr)

	records, total, err := models.GetRecordsByEventID(uint(id), page, pageSize)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch records", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
		"records":   records,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// SuggestFieldMapping POST /v1/suggest-mapping
func SuggestFieldMapping(c *gin.Context) {
	var req SuggestMappingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request", err.Error())
		return
	}
	if len(req.Columns) == 0 {
		utils.ErrorResponse(c, http.StatusBadRequest, "columns is required", nil)
		return
	}

	columnsJSON, _ := json.Marshal(req.Columns)
	systemPrompt := `你是一个数据导入助手。请将 CSV 文件的列名映射到以下系统字段。

系统字段说明：
- email: 邮箱地址（主键，用于去重）
- last_name: 姓
- first_name: 名
- username: 完整姓名
- github: GitHub 用户名或链接
- wallet_address: 钱包地址（0x开头）
- twitter: Twitter/X 用户名
- wechat: 微信号
- telegram: Telegram 用户名
- existing_projects: 已有项目名称
- intro: 个人简介/描述
- monad_experience: Monad/Web3 经验描述
- award: 获奖情况
- role: 参与角色
- status: 参与状态`
	userPrompt := "CSV 列名列表：" + string(columnsJSON) + "\n\n严格按以下格式返回 JSON，key 必须是英文系统字段名，value 必须是对应的 CSV 列名原文。找不到对应的字段不要包含。只返回 JSON 对象，不要任何其他文字：\n{\"email\": \"对应的CSV列名\", \"github\": \"对应的CSV列名\", ...}"

	content, err := utils.CallKimi(systemPrompt, userPrompt)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "AI service error", err.Error())
		return
	}

	// Extract JSON from response (AI might wrap in ```json ... ```)
	jsonStr := content
	if idx := strings.Index(content, "{"); idx >= 0 {
		if end := strings.LastIndex(content, "}"); end > idx {
			jsonStr = content[idx : end+1]
		}
	}

	var mapping map[string]string
	if err := json.Unmarshal([]byte(jsonStr), &mapping); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to parse AI response", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", mapping)
}

// GetUserActivity GET /v1/users/:id/activity
func GetUserActivity(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	records, err := models.GetRecordsByUserID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch activity", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", records)
}

// AnalyzeEvent GET /v1/events/:id/analysis
// 对单个活动生成 AI 分析报告：参与人数、获奖分布、角色分布、开发者画像摘要等
func AnalyzeEvent(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	event, err := models.GetActivityEventByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Event not found", nil)
		return
	}

	// 获取参与记录（最多 500 条，够 AI 分析）
	records, _, err := models.GetRecordsByEventID(uint(id), 1, 500)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch records", err.Error())
		return
	}

	totalCount := len(records)

	// 统计角色分布
	roleMap := map[string]int{}
	awardMap := map[string]int{}
	awardedCount := 0
	for _, r := range records {
		if r.Role != "" {
			roleMap[r.Role]++
		}
		if r.Award != "" {
			awardMap[r.Award]++
			awardedCount++
		}
	}

	// 构建 AI 分析 prompt
	var sb strings.Builder
	sb.WriteString("活动名称：" + event.Name + "\n")
	sb.WriteString("活动类型：" + event.Type + "\n")
	sb.WriteString("活动平台：" + event.Platform + "\n")
	sb.WriteString("时间：" + event.StartDate.Format("2006-01-02") + " 至 " + event.EndDate.Format("2006-01-02") + "\n")
	sb.WriteString("活动描述：" + event.Description + "\n\n")
	sb.WriteString("参与人数：" + strconv.Itoa(totalCount) + "\n")
	sb.WriteString("获奖人数：" + strconv.Itoa(awardedCount) + "\n\n")

	if len(roleMap) > 0 {
		sb.WriteString("角色分布：\n")
		for role, cnt := range roleMap {
			sb.WriteString("  " + role + ": " + strconv.Itoa(cnt) + "人\n")
		}
		sb.WriteString("\n")
	}

	if len(awardMap) > 0 {
		sb.WriteString("获奖情况：\n")
		for award, cnt := range awardMap {
			sb.WriteString("  " + award + ": " + strconv.Itoa(cnt) + "人\n")
		}
		sb.WriteString("\n")
	}

	systemPrompt := `你是 Monad 生态开发者运营分析师。请根据以下活动数据生成一份简洁的分析报告。

报告格式（Markdown）：
## 活动概览
（活动基本信息摘要，1-2句话）

## 参与数据
（参与人数、获奖率等关键指标）

## 角色与获奖分布
（角色、获奖情况分析）

## 运营洞察
（3-5条有价值的运营观察和建议，具体可操作）

要求：简洁、数据驱动、面向运营团队，每节不超过100字。`

	report, err := utils.AnalyzeEvent(systemPrompt, sb.String())
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "AI analysis failed", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", gin.H{
		"event_id":      event.ID,
		"event_name":    event.Name,
		"total_count":   totalCount,
		"awarded_count": awardedCount,
		"role_dist":     roleMap,
		"award_dist":    awardMap,
		"report":        report,
	})
}
