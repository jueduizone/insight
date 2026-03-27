package controllers

import (
	"encoding/csv"
	"encoding/json"
	"insight/models"
	"insight/utils"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

// CreateProject 创建项目
func CreateProject(c *gin.Context) {
	var req CreateProjectRequest

	// 绑定并验证请求参数
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	project := models.Project{
		Name:        req.Name,
		Description: req.Description,
		Github:      req.Github,
		Site:        req.Site,
		CoverImg:    req.CoverImg,
		Tags:        pq.StringArray(req.Tags),
	}

	// 保存到数据库
	if err := models.CreateProject(&project); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create project", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Project created successfully", project)
}

// GetProject 根据ID获取项目
func GetProject(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.Atoi(idParam)
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	project, err := models.GetProjectByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Project not found", nil)
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", project)
}

// UpdateProject PUT /v1/projects/:id
func UpdateProject(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	project, err := models.GetProjectByID(uint(id))
	if err != nil {
		utils.ErrorResponse(c, http.StatusNotFound, "Project not found", nil)
		return
	}

	var req UpdateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	if req.Name != "" {
		project.Name = req.Name
	}
	if req.Description != "" {
		project.Description = req.Description
	}
	project.Github = req.Github
	project.Site = req.Site
	if req.Tags != nil {
		project.Tags = pq.StringArray(req.Tags)
	}

	if err := models.UpdateProject(project); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to update project", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Project updated", project)
}

// DeleteProject DELETE /v1/projects/:id
func DeleteProject(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid ID", nil)
		return
	}

	if err := models.DeleteProject(uint(id)); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to delete project", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Project deleted", nil)
}

// ImportHackathonCSV POST /v1/projects/hackathon/import
// mode=preview: return columns + first 5 rows
// mode=import:  import with field_mapping, dedup by name+event_id
func ImportHackathonCSV(c *gin.Context) {
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

	var fieldMapping map[string]string
	if err := json.Unmarshal([]byte(mappingStr), &fieldMapping); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid field_mapping JSON", err.Error())
		return
	}

	// Build column index map
	colIndex := make(map[string]int)
	for i, h := range headers {
		colIndex[strings.TrimSpace(h)] = i
	}

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

	systemFields := map[string]bool{
		"name": true, "description": true, "github": true, "site": true,
		"team_name": true, "members": true, "score": true, "rank": true,
		"status": true, "award_level": true, "tags": true, "event_id": true,
	}

	created := 0
	updated := 0

	for _, row := range rows {
		name := getValue(row, "name")
		if name == "" {
			continue
		}

		eventIDStr := getValue(row, "event_id")
		var eventID uint
		if n, err2 := strconv.Atoi(eventIDStr); err2 == nil {
			eventID = uint(n)
		}

		scoreStr := getValue(row, "score")
		var score float64
		if f, err2 := strconv.ParseFloat(scoreStr, 64); err2 == nil {
			score = f
		}

		rankStr := getValue(row, "rank")
		var rank int
		if n, err2 := strconv.Atoi(rankStr); err2 == nil {
			rank = n
		}

		tagsStr := getValue(row, "tags")
		var tags pq.StringArray
		if tagsStr != "" {
			for _, t := range strings.Split(tagsStr, ",") {
				tags = append(tags, strings.TrimSpace(t))
			}
		}

		// Extra fields not in system fields → store as Scores JSON
		extraData := make(map[string]string)
		for field, col := range fieldMapping {
			if !systemFields[field] {
				idx, ok := colIndex[col]
				if ok && idx < len(row) {
					extraData[field] = strings.TrimSpace(row[idx])
				}
			}
		}
		scoresJSON, _ := json.Marshal(extraData)

		// Dedup by name + event_id
		existing, _ := models.GetProjectByNameAndEventID(name, eventID)
		if existing != nil {
			existing.Description = getValue(row, "description")
			existing.Github = getValue(row, "github")
			existing.Site = getValue(row, "site")
			existing.TeamName = getValue(row, "team_name")
			existing.Members = getValue(row, "members")
			existing.Score = score
			existing.Rank = rank
			existing.Status = getValue(row, "status")
			existing.AwardLevel = getValue(row, "award_level")
			if tags != nil {
				existing.Tags = tags
			}
			existing.Scores = scoresJSON
			models.UpdateProject(existing)
			updated++
		} else {
			project := models.Project{
				Name:        name,
				Description: getValue(row, "description"),
				Github:      getValue(row, "github"),
				Site:        getValue(row, "site"),
				Tags:        tags,
				EventID:     eventID,
				TeamName:    getValue(row, "team_name"),
				Members:     getValue(row, "members"),
				Score:       score,
				Rank:        rank,
				Status:      getValue(row, "status"),
				AwardLevel:  getValue(row, "award_level"),
				Scores:      scoresJSON,
			}
			models.CreateProject(&project)
			created++
		}
	}

	utils.SuccessResponse(c, http.StatusOK, "Import complete", gin.H{
		"created": created,
		"updated": updated,
	})
}

// GetProjects 查询项目列表
func QueryProjects(c *gin.Context) {
	// 获取查询参数
	pageStr := c.DefaultQuery("page", "1")
	pageSizeStr := c.DefaultQuery("page_size", "10")
	keyword := c.Query("keyword")
	tag := c.Query("tag")

	// 转换分页参数
	page, err := strconv.Atoi(pageStr)
	if err != nil || page < 1 {
		page = 1
	}

	pageSize, err := strconv.Atoi(pageSizeStr)
	if err != nil || pageSize <= 0 {
		pageSize = 10
	}

	// 构建过滤器
	filter := models.ProjectFilter{
		Page:     page,
		PageSize: pageSize,
		Keyword:  keyword,
		Tag:      tag,
	}

	// 查询项目列表
	projects, total, err := models.QueryProjects(filter)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch projects", err.Error())
		return
	}

	var response ProjectListResponse
	response.Projects = projects
	response.Total = total
	response.Page = page
	response.PageSize = pageSize

	utils.SuccessResponse(c, http.StatusOK, "Success", response)
}
