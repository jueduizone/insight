package controllers

import (
	"insight/models"
	"insight/utils"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleLogin POST /v1/login
func HandleLogin(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	user, err := models.GetUserByEmail(req.Email)
	if err != nil {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid email or password", nil)
		return
	}

	if !utils.CheckPasswordHash(req.Password, user.PasswordHash) {
		utils.ErrorResponse(c, http.StatusUnauthorized, "Invalid email or password", nil)
		return
	}

	token, err := utils.GenerateToken(user.ID, user.Email, user.Avatar, user.Username, user.Github, []string{user.Role})
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to generate token", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusOK, "Login successful", LoginResponse{
		User:        *user,
		Permissions: []string{user.Role},
		Token:       token,
	})
}

// CreateAdminUser POST /v1/admin/users - Super Admin only
func CreateAdminUser(c *gin.Context) {
	uid, _ := c.Get("uid")
	currentUser, err := models.GetUserById(uid.(uint))
	if err != nil || currentUser.Role != "super_admin" {
		utils.ErrorResponse(c, http.StatusForbidden, "Permission denied", nil)
		return
	}

	var req AdminCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Invalid request parameters", err.Error())
		return
	}

	_, err = models.GetUserByEmail(req.Email)
	if err == nil {
		utils.ErrorResponse(c, http.StatusConflict, "Email already exists", nil)
		return
	}

	hash, err := utils.HashPassword(req.Password)
	if err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to hash password", err.Error())
		return
	}

	user := models.User{
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hash,
		Role:         "admin",
	}

	if err := models.CreateUser(&user); err != nil {
		utils.ErrorResponse(c, http.StatusInternalServerError, "Failed to create user", err.Error())
		return
	}

	utils.SuccessResponse(c, http.StatusCreated, "Admin user created", user)
}
