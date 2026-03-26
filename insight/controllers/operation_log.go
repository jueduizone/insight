package controllers

import (
	"insight/models"
	"insight/utils"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// CreateLog POST /v1/operation-logs
func CreateLog(c *gin.Context) {
	var req CreateLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	uid, _ := c.Get("uid")
	log := models.OperationLog{
		TargetType: req.TargetType,
		TargetID:   req.TargetID,
		AdminID:    uid.(uint),
		Content:    req.Content,
	}

	if err := models.CreateOperationLog(&log); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create log", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Log created", log)
}

// GetLogs GET /v1/operation-logs?target_type=xxx&target_id=xxx
func GetLogs(c *gin.Context) {
	targetType := c.Query("target_type")
	targetIDStr := c.Query("target_id")

	var targetID uint
	if targetIDStr != "" {
		id, err := strconv.Atoi(targetIDStr)
		if err != nil {
			utils.ErrorResponse(c, http.StatusBadRequest, "Invalid target_id", nil)
			return
		}
		targetID = uint(id)
	}

	logs, err := models.GetOperationLogs(targetType, targetID)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to fetch logs", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Success", logs)
}
